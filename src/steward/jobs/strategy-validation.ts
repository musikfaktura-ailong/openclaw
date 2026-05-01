import { getDb } from "../db/db-bootstrap.js";
import { storeKnowledge } from "../memory/knowledge-store.js";
import {
  applyRejectionBurn,
  applyValidationBonus,
  type TimeBudgetAdjustment,
} from "../mission/time-budget.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import type { StewardEmbedder } from "../memory/embedder.js";
import { STRATEGY_VALIDATION_CADENCE_MS } from "./job-types.js";

const APPROVAL_SCORE_THRESHOLD = 0.8;
const VALIDATION_SIGNAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export type StrategyValidationDecisionVerdict = "approved" | "rejected";

export type StrategyValidationReason =
  | "approved"
  | "no_candidate_proof"
  | "proof_not_accepted"
  | "proof_not_grounded"
  | "proof_score_below_threshold"
  | "recent_truth_violation"
  | "recent_task_value_low";

export type StrategyValidationSnapshot = {
  latestProof: {
    proofId: number;
    taskId: number | null;
    flowId: number | null;
    verdict: "accepted" | "rejected";
    grounded: boolean;
    score: number;
    taskType: string;
    taskTitle: string;
    createdTs: number;
  } | null;
  acceptedProofCount: number;
  rejectedProofCount: number;
  truthViolationCount24h: number;
  truthReinforcedCount24h: number;
  lastTaskValueLabel: string | null;
  lastTaskValueTs: number | null;
};

export type StrategyValidationDecision = {
  verdict: StrategyValidationDecisionVerdict;
  reason: StrategyValidationReason;
  summary: string;
  proofId: number | null;
  taskId: number | null;
  flowId: number | null;
  score: number | null;
  rejectionCount: number;
};

export type StrategyValidationRunResult = {
  created: boolean;
  reused: boolean;
  flowId: number;
  taskId: number;
  cooldownUntilTs: number;
  validationKnowledgeId: number;
  decision: StrategyValidationDecision;
  budgetAdjustment: TimeBudgetAdjustment | null;
};

type PriorValidationFlow = {
  flowId: number;
  taskId: number;
  createdTs: number;
  cooldownUntilTs: number | null;
  decision: StrategyValidationDecision | null;
};

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function findLatestStrategyValidationFlow(sessionId: string): PriorValidationFlow | null {
  const rows = getDb()
    .prepare(
      `SELECT f.id, f.created_ts, f.state_json, t.task_id
       FROM steward_flows f
       JOIN steward_flow_tasks t ON t.flow_id = f.id
       WHERE f.session_id = ?
         AND f.flow_type = 'maintenance'
       ORDER BY f.id DESC`,
    )
    .all(sessionId) as Array<{
    id: number;
    created_ts: number;
    state_json: string;
    task_id: number;
  }>;

  for (const row of rows) {
    const state = parseJsonRecord(row.state_json);
    if (state.job_type !== "strategy_validation") {
      continue;
    }
    const decisionRaw =
      typeof state.validation_decision === "object" && state.validation_decision
        ? (state.validation_decision as Record<string, unknown>)
        : null;
    return {
      flowId: Number(row.id),
      taskId: Number(row.task_id),
      createdTs: Number(row.created_ts),
      cooldownUntilTs:
        state.cooldown_until_ts == null ? null : Number(state.cooldown_until_ts),
      decision: decisionRaw
        ? {
            verdict:
              decisionRaw.verdict === "approved" ? "approved" : "rejected",
            reason: String(decisionRaw.reason ?? "no_candidate_proof") as StrategyValidationReason,
            summary: String(decisionRaw.summary ?? ""),
            proofId: decisionRaw.proofId == null ? null : Number(decisionRaw.proofId),
            taskId: decisionRaw.taskId == null ? null : Number(decisionRaw.taskId),
            flowId: decisionRaw.flowId == null ? null : Number(decisionRaw.flowId),
            score: decisionRaw.score == null ? null : Number(decisionRaw.score),
            rejectionCount: Math.max(0, Number(decisionRaw.rejectionCount ?? 0)),
          }
        : null,
    };
  }

  return null;
}

function countPriorRejectedValidations(sessionId: string): number {
  const rows = getDb()
    .prepare(
      `SELECT state_json
       FROM steward_flows
       WHERE session_id = ?
         AND flow_type = 'maintenance'
       ORDER BY id DESC`,
    )
    .all(sessionId) as Array<{ state_json: string }>;
  let count = 0;
  for (const row of rows) {
    const state = parseJsonRecord(row.state_json);
    if (state.job_type !== "strategy_validation") {
      continue;
    }
    const decision =
      typeof state.validation_decision === "object" && state.validation_decision
        ? (state.validation_decision as Record<string, unknown>)
        : {};
    if (decision.verdict === "rejected") {
      count += 1;
      continue;
    }
    break;
  }
  return count;
}

function buildStrategyValidationSnapshot(params: {
  sessionId: string;
  sessionKey: string;
  now: number;
}): StrategyValidationSnapshot {
  const db = getDb();
  const latestProof = db
    .prepare(
      `SELECT id, task_id, flow_id, verdict, grounded, score, task_type, task_title, created_ts
       FROM steward_proofs
       WHERE session_id = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(params.sessionId) as
    | {
        id: number;
        task_id: number | null;
        flow_id: number | null;
        verdict: "accepted" | "rejected";
        grounded: number;
        score: number;
        task_type: string;
        task_title: string;
        created_ts: number;
      }
    | undefined;
  const proofCounts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN verdict = 'accepted' THEN 1 ELSE 0 END) AS accepted_count,
         SUM(CASE WHEN verdict = 'rejected' THEN 1 ELSE 0 END) AS rejected_count
       FROM steward_proofs
       WHERE session_id = ?`,
    )
    .get(params.sessionId) as { accepted_count: number | null; rejected_count: number | null };
  const cutoff = params.now - VALIDATION_SIGNAL_WINDOW_MS;
  const truthCounts = db
    .prepare(
      `SELECT
         SUM(CASE WHEN memory_type = 'truth_violation' THEN 1 ELSE 0 END) AS violation_count,
         SUM(CASE WHEN memory_type = 'truth_reinforced' THEN 1 ELSE 0 END) AS reinforced_count
       FROM steward_memories
       WHERE session_key = ?
         AND created_ts >= ?`,
    )
    .get(params.sessionKey, cutoff) as {
    violation_count: number | null;
    reinforced_count: number | null;
  };
  const taskValueRow = db
    .prepare(
      `SELECT ts, data_json
       FROM steward_events
       WHERE session_id = ?
         AND kind = 'mission.task_value.adjudicated'
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(params.sessionId) as { ts: number; data_json: string } | undefined;
  const taskValueData = taskValueRow ? parseJsonRecord(taskValueRow.data_json) : {};

  return {
    latestProof: latestProof
      ? {
          proofId: Number(latestProof.id),
          taskId: latestProof.task_id == null ? null : Number(latestProof.task_id),
          flowId: latestProof.flow_id == null ? null : Number(latestProof.flow_id),
          verdict: latestProof.verdict,
          grounded: Boolean(latestProof.grounded),
          score: Number(latestProof.score ?? 0),
          taskType: latestProof.task_type,
          taskTitle: latestProof.task_title,
          createdTs: Number(latestProof.created_ts),
        }
      : null,
    acceptedProofCount: Number(proofCounts.accepted_count ?? 0),
    rejectedProofCount: Number(proofCounts.rejected_count ?? 0),
    truthViolationCount24h: Number(truthCounts.violation_count ?? 0),
    truthReinforcedCount24h: Number(truthCounts.reinforced_count ?? 0),
    lastTaskValueLabel:
      typeof taskValueData.label === "string" ? String(taskValueData.label) : null,
    lastTaskValueTs: taskValueRow ? Number(taskValueRow.ts) : null,
  };
}

function buildDecision(params: {
  snapshot: StrategyValidationSnapshot;
  rejectionCount: number;
}): StrategyValidationDecision {
  const proof = params.snapshot.latestProof;
  if (!proof) {
    return {
      verdict: "rejected",
      reason: "no_candidate_proof",
      summary: "Strategy validation rejected: no persisted steward proof is available yet.",
      proofId: null,
      taskId: null,
      flowId: null,
      score: null,
      rejectionCount: params.rejectionCount,
    };
  }
  if (proof.verdict !== "accepted") {
    return {
      verdict: "rejected",
      reason: "proof_not_accepted",
      summary: `Strategy validation rejected: latest steward proof ${proof.proofId} is not accepted.`,
      proofId: proof.proofId,
      taskId: proof.taskId,
      flowId: proof.flowId,
      score: proof.score,
      rejectionCount: params.rejectionCount,
    };
  }
  if (!proof.grounded) {
    return {
      verdict: "rejected",
      reason: "proof_not_grounded",
      summary: `Strategy validation rejected: proof ${proof.proofId} is not grounded.`,
      proofId: proof.proofId,
      taskId: proof.taskId,
      flowId: proof.flowId,
      score: proof.score,
      rejectionCount: params.rejectionCount,
    };
  }
  if (proof.score < APPROVAL_SCORE_THRESHOLD) {
    return {
      verdict: "rejected",
      reason: "proof_score_below_threshold",
      summary: `Strategy validation rejected: proof ${proof.proofId} score ${proof.score.toFixed(2)} is below ${APPROVAL_SCORE_THRESHOLD.toFixed(2)}.`,
      proofId: proof.proofId,
      taskId: proof.taskId,
      flowId: proof.flowId,
      score: proof.score,
      rejectionCount: params.rejectionCount,
    };
  }
  if (params.snapshot.truthViolationCount24h > 0) {
    return {
      verdict: "rejected",
      reason: "recent_truth_violation",
      summary: `Strategy validation rejected: ${params.snapshot.truthViolationCount24h} recent truth violation memories are still open in the last 24h.`,
      proofId: proof.proofId,
      taskId: proof.taskId,
      flowId: proof.flowId,
      score: proof.score,
      rejectionCount: params.rejectionCount,
    };
  }
  if (
    params.snapshot.lastTaskValueLabel === "low_value" ||
    params.snapshot.lastTaskValueLabel === "hollow"
  ) {
    return {
      verdict: "rejected",
      reason: "recent_task_value_low",
      summary: `Strategy validation rejected: latest steward task value label is ${params.snapshot.lastTaskValueLabel}.`,
      proofId: proof.proofId,
      taskId: proof.taskId,
      flowId: proof.flowId,
      score: proof.score,
      rejectionCount: params.rejectionCount,
    };
  }
  return {
    verdict: "approved",
    reason: "approved",
    summary: `Strategy validation approved: proof ${proof.proofId} is accepted, grounded, above threshold, and no recent truth/task-value blockers are present.`,
    proofId: proof.proofId,
    taskId: proof.taskId,
    flowId: proof.flowId,
    score: proof.score,
    rejectionCount: 0,
  };
}

export async function runStrategyValidationJob(params: {
  sessionKey: string;
  now?: number;
  embedder?: StewardEmbedder;
}): Promise<StrategyValidationRunResult> {
  const now = params.now ?? Date.now();
  const authority = getOrCreateStewardSession(params.sessionKey, now);
  const existing = findLatestStrategyValidationFlow(authority.sessionId);
  if (existing?.cooldownUntilTs != null && now < existing.cooldownUntilTs && existing.decision) {
    appendStewardEvent({
      kind: "job.strategy_validation.reused",
      message: "strategy validation reused active cooldown decision",
      sessionId: authority.sessionId,
      flowId: existing.flowId,
      now,
      data: {
        taskId: existing.taskId,
        cooldownUntilTs: existing.cooldownUntilTs,
        validationDecision: existing.decision,
      },
    });
    return {
      created: false,
      reused: true,
      flowId: existing.flowId,
      taskId: existing.taskId,
      cooldownUntilTs: existing.cooldownUntilTs,
      validationKnowledgeId: 0,
      decision: existing.decision,
      budgetAdjustment: null,
    };
  }

  const db = getDb();
  const snapshot = buildStrategyValidationSnapshot({
    sessionId: authority.sessionId,
    sessionKey: params.sessionKey,
    now,
  });
  const priorRejectedCount = countPriorRejectedValidations(authority.sessionId);
  const rejectionCountBase = priorRejectedCount + 1;
  const decision = buildDecision({
    snapshot,
    rejectionCount: rejectionCountBase,
  });
  const cooldownUntilTs = now + STRATEGY_VALIDATION_CADENCE_MS;
  const budgetAdjustment =
    decision.verdict === "approved"
      ? applyValidationBonus({
          sessionId: authority.sessionId,
          flowId: decision.flowId,
          taskId: decision.taskId,
          now,
        })
      : applyRejectionBurn({
          rejectionCount: decision.rejectionCount,
          sessionId: authority.sessionId,
          flowId: decision.flowId,
          taskId: decision.taskId,
          now,
        });

  const validationKnowledgeId = await storeKnowledge({
    sessionKey: params.sessionKey,
    memoryType: "shared_thread",
    embedder: params.embedder,
    now,
    text: [
      "STRATEGY_VALIDATION",
      `verdict=${decision.verdict}`,
      `reason=${decision.reason}`,
      `proof_id=${decision.proofId ?? "none"}`,
      `rejection_count=${decision.rejectionCount}`,
    ].join(" "),
    metadata: {
      strategy_validation_ref: true,
      validation_decision: decision,
      snapshot,
      cooldown_until_ts: cooldownUntilTs,
      budget_adjustment: budgetAdjustment,
    },
  });

  const stateJson = JSON.stringify({
    job_type: "strategy_validation",
    snapshot,
    validation_decision: decision,
    cooldown_until_ts: cooldownUntilTs,
    validation_knowledge_id: validationKnowledgeId,
    budget_adjustment: budgetAdjustment,
  });
  const flowResult = db
    .prepare(
      `INSERT INTO steward_flows (
         session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
       ) VALUES (?, 'maintenance', 'completed', ?, ?, ?, ?, ?)`,
    )
    .run(authority.sessionId, stateJson, process.pid, now, now, now) as {
    lastInsertRowid: number | bigint;
  };
  const flowId = Number(flowResult.lastInsertRowid);
  const taskId = flowId;
  db.prepare(
    `INSERT INTO steward_flow_tasks (
       flow_id, task_id, role, link_status, created_ts, updated_ts
     ) VALUES (?, ?, 'diagnostic', 'succeeded', ?, ?)`,
  ).run(flowId, taskId, now, now);

  const eventData = {
    taskId,
    cooldownUntilTs,
    validationKnowledgeId,
    snapshot,
    validationDecision: decision,
    budgetAdjustment,
  };
  appendStewardEvent({
    kind: "job.strategy_validation.recorded",
    message: "strategy validation recorded",
    sessionId: authority.sessionId,
    flowId,
    now,
    data: eventData,
  });
  appendStewardEvent({
    kind:
      decision.verdict === "approved"
        ? "job.strategy_validation.approved"
        : "job.strategy_validation.rejected",
    message:
      decision.verdict === "approved"
        ? "strategy validation approved"
        : "strategy validation rejected",
    sessionId: authority.sessionId,
    flowId,
    now,
    data: eventData,
  });

  return {
    created: true,
    reused: false,
    flowId,
    taskId,
    cooldownUntilTs,
    validationKnowledgeId,
    decision,
    budgetAdjustment,
  };
}
