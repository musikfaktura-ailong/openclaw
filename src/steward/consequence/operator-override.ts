import { storeRelationshipMemory } from "../memory/relationship-memory.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getRuntimeState } from "../runtime/runtime-state.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { getDb } from "../db/db-bootstrap.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PENALTY_THRESHOLD = 4;
const REVIEW_THRESHOLD = 7;
const FATIGUE_PENALTY_SECONDS = 1800;

export type OperatorOverrideFatigue = {
  overrideCount7d: number;
  penaltySeconds: number;
  requiresReview: boolean;
};

export async function getOperatorOverrideFatigue(params: {
  sessionKey: string;
  now?: number;
}): Promise<OperatorOverrideFatigue> {
  const now = params.now ?? Date.now();
  const cutoff = now - SEVEN_DAYS_MS;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM steward_memories
       WHERE session_key = ?
         AND memory_type = 'operator_override'
         AND created_ts >= ?`,
    )
    .get(params.sessionKey, cutoff) as { count: number };
  const overrideCount7d = Number(row.count ?? 0);
  return {
    overrideCount7d,
    penaltySeconds: overrideCount7d >= PENALTY_THRESHOLD ? FATIGUE_PENALTY_SECONDS : 0,
    requiresReview: overrideCount7d >= REVIEW_THRESHOLD,
  };
}

export async function persistOperatorOverride(params: {
  sessionKey: string;
  toolName: string;
  approvalClass: string;
  recommendation: string;
  reason: string;
  operatorId?: string;
  now?: number;
}): Promise<OperatorOverrideFatigue> {
  const now = params.now ?? Date.now();
  const authority = getOrCreateStewardSession(params.sessionKey);
  const runtimeState = getRuntimeState(authority.sessionId);
  const fatigueBefore = await getOperatorOverrideFatigue({
    sessionKey: params.sessionKey,
    now,
  });
  const fatigueAfter = {
    overrideCount7d: fatigueBefore.overrideCount7d + 1,
    penaltySeconds:
      fatigueBefore.overrideCount7d + 1 >= PENALTY_THRESHOLD ? FATIGUE_PENALTY_SECONDS : 0,
    requiresReview: fatigueBefore.overrideCount7d + 1 >= REVIEW_THRESHOLD,
  };

  await storeRelationshipMemory({
    sessionKey: params.sessionKey,
    memoryType: "operator_override",
    payload: {
      key: `${params.toolName}:${now}`,
      value: params.reason,
      tool_name: params.toolName,
      approval_class: params.approvalClass,
      recommendation: params.recommendation,
      operator_id: params.operatorId ?? "operator",
      override_count_7d: fatigueAfter.overrideCount7d,
      penalty_seconds: fatigueAfter.penaltySeconds,
      requires_review: fatigueAfter.requiresReview,
    },
    summary: `OPERATOR_OVERRIDE tool=${params.toolName} recommendation=${params.recommendation}`,
    importance: 0.9,
    source: "consequence_override",
    confidenceScore: 1.0,
    lastVerifiedTs: now,
    now,
  });

  appendStewardEvent({
    kind: "consequence.override_allowed",
    message: `Operator override allowed ${params.toolName}`,
    sessionId: authority.sessionId,
    flowId: runtimeState?.activeFlowId ?? null,
    data: {
      toolName: params.toolName,
      approvalClass: params.approvalClass,
      recommendation: params.recommendation,
      operatorId: params.operatorId ?? "operator",
      overrideCount7d: fatigueAfter.overrideCount7d,
      penaltySeconds: fatigueAfter.penaltySeconds,
      requiresReview: fatigueAfter.requiresReview,
      reason: params.reason,
    },
    now,
  });

  return fatigueAfter;
}
