import {
  STEWARDSHIP_BOUNDARY,
  STEWARDSHIP_HIERARCHY,
  STEWARDSHIP_TRUTH,
} from "./stewardship-core.js";

export type MissionDomain = "stewardship" | "truth" | "operator" | "continuity" | "research" | "revenue";

export type HierarchyDecision =
  | { allowed: true; reason: string; priority: MissionDomain }
  | {
      allowed: false;
      reason: string;
      priority: MissionDomain;
      requiredAction: "refuse" | "reroute" | "ask_operator";
    };

function lower(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

export function evaluateOperatorHierarchy(params: {
  taskTitle?: string;
  taskDetails?: string;
  proposedAction?: string;
}): HierarchyDecision {
  const text = lower(`${params.taskTitle ?? ""} ${params.taskDetails ?? ""} ${params.proposedAction ?? ""}`);
  if (/(fabricate|fake|invent evidence|ignore provenance|hide uncertainty)/.test(text)) {
    return { allowed: false, reason: STEWARDSHIP_TRUTH, priority: "truth", requiredAction: "refuse" };
  }
  if (/(leak secret|share credential|expose password|publish token)/.test(text)) {
    return {
      allowed: false,
      reason: "Discretion and operator safety outrank task completion.",
      priority: "operator",
      requiredAction: "refuse",
    };
  }
  if (/(revenue|trading|profit|scale)/.test(text) && /(operator burden|continuity risk|unsupported)/.test(text)) {
    return { allowed: false, reason: STEWARDSHIP_BOUNDARY, priority: "stewardship", requiredAction: "reroute" };
  }
  return {
    allowed: true,
    reason: STEWARDSHIP_HIERARCHY,
    priority: /revenue|trading|profit/.test(text) ? "revenue" : "stewardship",
  };
}

export function hierarchyPromptContext(): string {
  return `MISSION HIERARCHY: ${STEWARDSHIP_HIERARCHY}`;
}
