import { resolveToolId } from "./tool-taxonomy.js";

export type TruthGateDecision =
  | {
      recommendation: "ALLOW";
      reason: string;
    }
  | {
      recommendation: "REROUTE";
      reason: string;
      rerouteToolName?: string;
    }
  | {
      recommendation: "REFUSE";
      reason: string;
    };

const PROTECTED_PATH_MARKERS = [
  "core/stewardship.py",
  "core/code_improvement.py",
  "core/consequence_simulator.py",
  "core/controller.py",
  "src/steward/mission/",
  "src/steward/consequence/",
] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

function readFirstString(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readNumber(record: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function readStringArray(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string[] {
  if (!record) {
    return [];
  }
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function collectWriteTargets(toolName: string, args: Record<string, unknown> | undefined): string[] {
  const pathCandidate = readFirstString(args, ["path", "file_path", "filePath", "filepath", "file"]);
  if (pathCandidate) {
    return [pathCandidate];
  }
  if (resolveToolId(toolName) !== "apply_patch") {
    return [];
  }
  const patch = readFirstString(args, ["patch", "input", "content"]);
  if (!patch) {
    return [];
  }
  return [...patch.matchAll(/\*\*\* (?:Add|Delete|Update) File: (.+)/g)]
    .map((match) => match[1]?.trim())
    .filter((item): item is string => Boolean(item));
}

function isProtectedPath(target: string): boolean {
  const normalized = normalizePath(target);
  return PROTECTED_PATH_MARKERS.some((marker) => normalized.includes(marker));
}

export function evaluateTruthGate(params: {
  toolName: string;
  args: unknown;
}): TruthGateDecision {
  const toolId = resolveToolId(params.toolName);
  const args = asRecord(params.args);

  if (toolId === "knowledge_store") {
    const provenanceUrls = readStringArray(args, ["provenance_urls", "provenanceUrls", "source_urls", "sourceUrls"]);
    const confidence = readNumber(args, ["confidence", "confidence_score", "confidenceScore"]);
    if (provenanceUrls.length === 0) {
      return {
        recommendation: "REROUTE",
        reason: "knowledge.store requires provenance URLs before persistence",
        rerouteToolName: "web_fetch",
      };
    }
    if ((confidence ?? 0) < 0.6) {
      return {
        recommendation: "REROUTE",
        reason: "knowledge.store requires confidence >= 0.6 before persistence",
        rerouteToolName: "web_search",
      };
    }
    return { recommendation: "ALLOW", reason: "knowledge.write grounded" };
  }

  if (toolId === "write" || toolId === "edit" || toolId === "apply_patch") {
    const targets = collectWriteTargets(toolId, args);
    if (targets.some(isProtectedPath)) {
      return {
        recommendation: "REFUSE",
        reason: "protected steward paths cannot be modified through tool execution",
      };
    }
    return { recommendation: "ALLOW", reason: "write target passed deterministic truth gate" };
  }

  return { recommendation: "ALLOW", reason: "no truth-gated policy for tool" };
}

export const __testing = {
  PROTECTED_PATH_MARKERS,
  collectWriteTargets,
  isProtectedPath,
};
