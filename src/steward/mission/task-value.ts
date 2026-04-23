import { storeRelationshipMemory } from "../memory/relationship-memory.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import {
  onBurdenReduction,
  onTaskHighValue,
  onTaskLowValue,
  onTruthfulService,
  onTruthViolation,
} from "./heuristics.js";
import { applyRejectionBurn, adjustTimeBudget } from "./time-budget.js";
import { reflectStewardship, type StewardshipReflection } from "./stewardship-reflection.js";

export type TaskValueLabel = "high_value" | "neutral" | "low_value" | "hollow";

export type TaskValueResult = {
  score: number;
  label: TaskValueLabel;
  adjustments: string[];
  budgetEffectSeconds: number;
  reflection: StewardshipReflection;
};

function labelForScore(score: number): TaskValueLabel {
  if (score >= 8) return "high_value";
  if (score >= 5) return "neutral";
  if (score >= 2) return "low_value";
  return "hollow";
}

export async function adjudicateTaskValue(params: {
  sessionId: string;
  sessionKey: string;
  flowId?: number | null;
  taskId?: number | null;
  taskType?: string;
  taskTitle?: string;
  taskDetails?: string;
  taskResult?: string;
  proofVerdict?: "accepted" | "rejected" | null;
  proofScore?: number | null;
  now?: number;
}): Promise<TaskValueResult> {
  const reflection = reflectStewardship({
    sessionId: params.sessionId,
    flowId: params.flowId ?? null,
    taskId: params.taskId ?? null,
    taskTitle: params.taskTitle,
    taskDetails: params.taskDetails,
    taskResult: params.taskResult,
  });
  let score = 5;
  const adjustments: string[] = [];

  if (params.proofVerdict === "accepted") {
    score += 2;
    adjustments.push("proof_accepted:+2");
    if ((params.proofScore ?? 0) >= 0.85) {
      score += 1;
      adjustments.push("strong_proof:+1");
    }
  } else if (params.proofVerdict === "rejected") {
    score -= 3;
    adjustments.push("proof_rejected:-3");
  }
  if (reflection.truthViolationCount > 0) {
    const penalty = Math.min(12, 7 + Math.ceil((reflection.truthViolationCount - 1) * 1.25));
    score -= penalty;
    adjustments.push(`truth_violation(${reflection.truthViolationCount}x):-${penalty}`);
  } else {
    score += 4;
    adjustments.push("truth_preserved:+4");
  }
  if (reflection.truthfulRefusal) {
    score += 3;
    adjustments.push("truthful_refusal:+3");
  }
  if (reflection.contradictionSurfaced) {
    score += 2;
    adjustments.push("contradiction_surfaced:+2");
  }
  if (reflection.operatorServed && !reflection.truthfulRefusal) {
    score += 2;
    adjustments.push("operator_served:+2");
  }
  if (reflection.burdenReduced && !reflection.truthfulRefusal) {
    score += 2;
    adjustments.push("burden_reduced:+2");
  }
  if (reflection.continuityProtected && !reflection.truthfulRefusal) {
    score += 1;
    adjustments.push("continuity_protected:+1");
  }
  if (!reflection.discretionHonored) {
    score -= 3;
    adjustments.push("discretion_violation:-3");
  }
  if (reflection.busywork) {
    score -= 4;
    adjustments.push("busywork:-4");
  }

  score = Math.max(0, Math.min(10, score));
  const label = labelForScore(score);
  let budgetEffectSeconds = 0;
  if (score >= 8) {
    budgetEffectSeconds += adjustTimeBudget({
      deltaSeconds: 600,
      reason: "task_value_bonus",
      sessionId: params.sessionId,
      flowId: params.flowId ?? null,
      taskId: params.taskId ?? null,
      now: params.now,
    }).deltaSeconds;
    onTaskHighValue(params.sessionId, params.flowId ?? null);
  } else if (score <= 1) {
    budgetEffectSeconds += applyRejectionBurn({
      rejectionCount: 1,
      sessionId: params.sessionId,
      flowId: params.flowId ?? null,
      taskId: params.taskId ?? null,
      now: params.now,
    }).deltaSeconds;
    onTaskLowValue(params.sessionId, params.flowId ?? null);
  } else if (score <= 4) {
    budgetEffectSeconds += adjustTimeBudget({
      deltaSeconds: -300,
      reason: "task_value_penalty",
      sessionId: params.sessionId,
      flowId: params.flowId ?? null,
      taskId: params.taskId ?? null,
      now: params.now,
    }).deltaSeconds;
    onTaskLowValue(params.sessionId, params.flowId ?? null);
  }
  if (reflection.operatorServed && reflection.truthPreserved) {
    onTruthfulService(params.sessionId, params.flowId ?? null);
  }
  if (reflection.burdenReduced || reflection.continuityProtected) {
    onBurdenReduction(params.sessionId, params.flowId ?? null);
  }
  if (reflection.truthViolationCount > 0) {
    onTruthViolation(params.sessionId, params.flowId ?? null);
  }

  const result = { score, label, adjustments, budgetEffectSeconds, reflection };
  appendStewardEvent({
    kind: "mission.task_value.adjudicated",
    message: "task_value.adjudicated",
    sessionId: params.sessionId,
    flowId: params.flowId ?? null,
    now: params.now,
    data: { ...result, taskId: params.taskId ?? null, taskType: params.taskType ?? "general" },
  });
  await storeRelationshipMemory({
    sessionKey: params.sessionKey,
    memoryType: "stewardship_ledger",
    payload: {
      key: `task_${params.taskId ?? "turn"}`,
      value: JSON.stringify(reflection),
      score,
      label,
    },
    summary: `STEWARDSHIP_LEDGER task=${params.taskId ?? "turn"} label=${label} score=${score}`,
    importance: score >= 7 ? 0.8 : 0.6,
    source: "task_value",
    taskId: params.taskId ?? undefined,
    now: params.now,
  });
  return result;
}
