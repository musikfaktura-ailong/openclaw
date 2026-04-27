import type { AcpApprovalClass } from "../../acp/approval-classifier.js";
import { classifyAcpToolApproval } from "../../acp/approval-classifier.js";
import type { StewardClassifier } from "../proof/proof-types.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getRuntimeState } from "../runtime/runtime-state.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { createDefaultCausalDependencyModel, type CausalSimulationResult } from "./causal-model.js";
import {
  resolveBridgeDecision,
  type ConsequenceBridgeDecision,
  type ConsequenceRecommendation,
} from "./action-policy-bridge.js";
import { persistOperatorOverride } from "./operator-override.js";
import { resolveConsequenceClass } from "./tool-taxonomy.js";
import { evaluateTruthGate } from "./truth-gate.js";

export type ConsequenceCheckResult = {
  toolName: string;
  approvalClass: AcpApprovalClass;
  consequenceClass: string;
  recommendation: ConsequenceRecommendation;
  annotation: string;
  bridgeDecision: ConsequenceBridgeDecision;
  rerouteToolName?: string;
  causalResult?: CausalSimulationResult;
};

type NegationClassifierOutput = {
  blocked?: boolean;
  negated_states?: unknown;
  reason?: unknown;
  recommendation?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function extractCommand(args: unknown): string {
  const record = asRecord(args);
  return (
    normalizeString(record?.command) ??
    normalizeString(record?.cmd) ??
    normalizeString(record?.script) ??
    ""
  );
}

function classifyApproval(toolName: string, args: unknown): AcpApprovalClass {
  return classifyAcpToolApproval({
    cwd: process.cwd(),
    toolCall: {
      _meta: { toolName },
      rawInput: {
        ...(asRecord(args) ?? {}),
        toolName,
        tool: toolName,
        name: toolName,
      },
    },
  }).approvalClass;
}

function buildHighImpactNegations(toolName: string, args: unknown): string[] {
  const toolId = toolName.toLowerCase();
  const command = extractCommand(args).toLowerCase();

  if (
    command.includes("rm -rf") ||
    command.includes("del /f") ||
    command.includes("format ") ||
    command.includes("shutdown") ||
    command.includes("diskpart")
  ) {
    return ["safe_execution"];
  }

  if (toolId === "sessions_send" || toolId === "message") {
    return ["operator_alignment"];
  }

  if (toolId === "sessions_spawn" || toolId === "cron" || toolId === "gateway" || toolId === "nodes") {
    return ["runtime_stable"];
  }

  return [];
}

async function classifyNegationWithModel(params: {
  classifier?: StewardClassifier | null;
  toolName: string;
  args: unknown;
}): Promise<{ recommendation?: ConsequenceRecommendation; reason?: string; negatedStates: string[] }> {
  if (!params.classifier) {
    return { negatedStates: buildHighImpactNegations(params.toolName, params.args) };
  }

  try {
    const raw = await params.classifier.classifyJson<NegationClassifierOutput>({
      systemPrompt:
        "Return JSON only. Assess steward consequence risk for the proposed tool call. " +
        "Allowed recommendations: ALLOW, WARN, REFUSE. Negated states must be from: " +
        "action_grounded, operator_alignment, safe_execution, runtime_stable, truth_preserved, stewardship_intact, continuity_protected.",
      prompt: JSON.stringify({
        toolName: params.toolName,
        args: params.args,
      }),
    });
    const recommendation = normalizeString(raw.recommendation);
    const reason = normalizeString(raw.reason);
    const negatedStates = Array.isArray(raw.negated_states)
      ? raw.negated_states.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    if (recommendation === "ALLOW" || recommendation === "WARN" || recommendation === "REFUSE") {
      return { recommendation, reason, negatedStates };
    }
    return { reason, negatedStates };
  } catch {
    return { negatedStates: buildHighImpactNegations(params.toolName, params.args) };
  }
}

function chooseRecommendation(params: {
  consequenceClass: string;
  approvalClass: AcpApprovalClass;
  modelRecommendation?: ConsequenceRecommendation;
  negatedStates: string[];
  causalResult: CausalSimulationResult;
  args: unknown;
}): { recommendation: ConsequenceRecommendation; annotation: string } {
  if (params.modelRecommendation === "REFUSE") {
    return { recommendation: "REFUSE", annotation: "model classified action as disallowed" };
  }
  if (params.causalResult.blocked) {
    return {
      recommendation: "REFUSE",
      annotation: `causal model blocked action: ${params.causalResult.negatedStates.join(", ")}`,
    };
  }
  if (params.approvalClass === "exec_capable") {
    return { recommendation: "WARN", annotation: "exec action requires consequence review" };
  }
  if (params.approvalClass === "control_plane") {
    return { recommendation: "ALLOW", annotation: "control-plane action requires operator confirmation" };
  }
  if (params.modelRecommendation === "WARN") {
    return { recommendation: "WARN", annotation: "model classified action as cautionary" };
  }
  if (params.consequenceClass === "plugin") {
    return { recommendation: "WARN", annotation: "plugin action requires consequence trace" };
  }
  if (params.negatedStates.includes("operator_alignment")) {
    return { recommendation: "WARN", annotation: "external action may burden the operator" };
  }
  return { recommendation: "ALLOW", annotation: "" };
}

function persistConsequenceEvent(params: {
  sessionKey?: string;
  toolName: string;
  approvalClass: AcpApprovalClass;
  consequenceClass: string;
  recommendation: ConsequenceRecommendation;
  annotation: string;
  bridgeDecision: ConsequenceBridgeDecision;
  rerouteToolName?: string;
  causalResult?: CausalSimulationResult;
  args: unknown;
  now?: number;
}): void {
  if (!params.sessionKey) {
    return;
  }
  const authority = getOrCreateStewardSession(params.sessionKey);
  const runtimeState = getRuntimeState(authority.sessionId);
  const eventKind =
    params.recommendation === "REFUSE"
      ? "consequence.refused"
      : params.recommendation === "REROUTE"
        ? "consequence.reroute"
        : params.recommendation === "WARN"
          ? "consequence.warning"
          : params.recommendation === "ALLOW_BY_OPERATOR_OVERRIDE"
            ? "consequence.override_allowed"
            : "consequence.check";
  appendStewardEvent({
    kind: eventKind,
    message: `Consequence ${params.recommendation.toLowerCase()} for ${params.toolName}`,
    sessionId: authority.sessionId,
    flowId: runtimeState?.activeFlowId ?? null,
    data: {
      toolName: params.toolName,
      approvalClass: params.approvalClass,
      consequenceClass: params.consequenceClass,
      recommendation: params.recommendation,
      annotation: params.annotation,
      rerouteToolName: params.rerouteToolName ?? null,
      requireOperatorEscalation: params.bridgeDecision.requireOperatorEscalation,
      operatorOverride: params.bridgeDecision.operatorOverride,
      negatedStates: params.causalResult?.negatedStates ?? [],
      terminalWeight: params.causalResult?.terminalWeight ?? 0,
      args: params.args,
    },
    now: params.now,
  });
}

export async function evaluateConsequencePolicy(params: {
  toolName: string;
  args: unknown;
  sessionKey?: string;
  classifier?: StewardClassifier | null;
  operatorOverride?: {
    allowed: boolean;
    operatorId?: string;
    reason?: string;
  };
  now?: number;
}): Promise<ConsequenceCheckResult> {
  const now = params.now ?? Date.now();
  const consequenceClass = resolveConsequenceClass(params.toolName, {
    action: normalizeString(asRecord(params.args)?.action),
    hasModelParam: typeof asRecord(params.args)?.model === "string",
  });
  const approvalClass = classifyApproval(params.toolName, params.args);

  if (consequenceClass === "fast_pass" || consequenceClass === "always_allow") {
    return {
      toolName: params.toolName,
      approvalClass,
      consequenceClass,
      recommendation: "ALLOW",
      annotation: "",
      bridgeDecision: resolveBridgeDecision("ALLOW", approvalClass),
    };
  }

  if (consequenceClass === "truth_gated") {
    const truthGate = evaluateTruthGate({
      toolName: params.toolName,
      args: params.args,
    });
    const bridgeDecision = resolveBridgeDecision(
      truthGate.recommendation,
      approvalClass,
      truthGate.reason,
    );
    const result: ConsequenceCheckResult = {
      toolName: params.toolName,
      approvalClass,
      consequenceClass,
      recommendation: truthGate.recommendation,
      annotation: truthGate.reason,
      rerouteToolName: "rerouteToolName" in truthGate ? truthGate.rerouteToolName : undefined,
      bridgeDecision,
    };
    persistConsequenceEvent({
      sessionKey: params.sessionKey,
      toolName: params.toolName,
      approvalClass,
      consequenceClass,
      recommendation: result.recommendation,
      annotation: result.annotation,
      bridgeDecision,
      rerouteToolName: result.rerouteToolName,
      args: params.args,
      now,
    });
    return result;
  }

  const modelClassification = await classifyNegationWithModel({
    classifier: params.classifier,
    toolName: params.toolName,
    args: params.args,
  });
  const causalResult = createDefaultCausalDependencyModel().simulateNegation(
    modelClassification.negatedStates,
  );
  let recommendationResult = chooseRecommendation({
    consequenceClass,
    approvalClass,
    modelRecommendation: modelClassification.recommendation,
    negatedStates: modelClassification.negatedStates,
    causalResult,
    args: params.args,
  });

  if (params.operatorOverride?.allowed && recommendationResult.recommendation !== "ALLOW") {
    await persistOperatorOverride({
      sessionKey: params.sessionKey ?? "unknown",
      toolName: params.toolName,
      approvalClass,
      recommendation: recommendationResult.recommendation,
      reason: params.operatorOverride.reason ?? recommendationResult.annotation,
      operatorId: params.operatorOverride.operatorId,
      now,
    });
    recommendationResult = {
      recommendation: "ALLOW_BY_OPERATOR_OVERRIDE",
      annotation: params.operatorOverride.reason ?? "operator override applied",
    };
  }

  const bridgeDecision = resolveBridgeDecision(
    recommendationResult.recommendation,
    approvalClass,
    recommendationResult.annotation,
  );
  persistConsequenceEvent({
    sessionKey: params.sessionKey,
    toolName: params.toolName,
    approvalClass,
    consequenceClass,
    recommendation: recommendationResult.recommendation,
    annotation: recommendationResult.annotation,
    bridgeDecision,
    causalResult,
    args: params.args,
    now,
  });
  return {
    toolName: params.toolName,
    approvalClass,
    consequenceClass,
    recommendation: recommendationResult.recommendation,
    annotation: recommendationResult.annotation,
    bridgeDecision,
    causalResult,
  };
}
