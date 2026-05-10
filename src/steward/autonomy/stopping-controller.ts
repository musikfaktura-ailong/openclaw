import { getDb } from "../db/db-bootstrap.js";

export type AutonomyGoalDecision =
  | "stop_completed"
  | "continue_current_gap"
  | "replan_goal";

export type AutonomyProgressDecision = {
  decision: AutonomyGoalDecision;
  reason: string;
  details: Record<string, unknown>;
};

type ProposedGap = {
  gapKind: string;
  workClass: string;
  reason: string;
  title: string;
  details: string;
  sourceFlowId: number | null;
  sourceHostTaskId: number | null;
  evidence: Record<string, unknown>;
};

function latestTesterVerdict(sessionId: string): {
  verdict: "confirmed" | "challenged";
  gapId: number;
  workerProofId: number;
  testerProofId: number;
  createdTs: number;
} | null {
  const row = getDb()
    .prepare(
      `SELECT verdict, gap_id, worker_proof_id, tester_proof_id, created_ts
       FROM steward_tester_verdicts
       WHERE session_id = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(sessionId) as
    | {
        verdict: "confirmed" | "challenged";
        gap_id: number;
        worker_proof_id: number;
        tester_proof_id: number;
        created_ts: number;
      }
    | undefined;
  if (!row) {
    return null;
  }
  return {
    verdict: row.verdict,
    gapId: row.gap_id,
    workerProofId: row.worker_proof_id,
    testerProofId: row.tester_proof_id,
    createdTs: row.created_ts,
  };
}

function countRecentChallengedVerdicts(sessionId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM (
         SELECT verdict
         FROM steward_tester_verdicts
         WHERE session_id = ?
         ORDER BY id DESC
         LIMIT 2
       ) recent
       WHERE verdict = 'challenged'`,
    )
    .get(sessionId) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

function countRecentChurnWithoutMilestones(sessionId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM (
         SELECT COALESCE(JSON_EXTRACT(e.data_json, '$.taskValueLabel'), '') AS task_value_label
         FROM steward_events e
         JOIN steward_flows f ON f.id = e.flow_id
         WHERE e.session_id = ?
           AND e.kind = 'runtime.idle'
           AND JSON_EXTRACT(f.state_json, '$.seeded_by') = 'autonomy'
           AND JSON_EXTRACT(f.state_json, '$.autonomy_work_class') IN ('maintenance_work', 'review_or_consolidation')
         ORDER BY e.id DESC
         LIMIT 3
       ) recent
       WHERE task_value_label IN ('hollow', 'low_value')`,
    )
    .get(sessionId) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

export function evaluateAutonomyProgressDecision(params: {
  sessionId: string;
  proposedGap: ProposedGap;
  sealedMilestoneCount: number;
}): AutonomyProgressDecision {
  const latestVerdict = latestTesterVerdict(params.sessionId);
  const recentChallengedCount = countRecentChallengedVerdicts(params.sessionId);
  const recentChurnCount = countRecentChurnWithoutMilestones(params.sessionId);

  if (
    latestVerdict?.verdict === "confirmed" &&
    params.sealedMilestoneCount >= 1 &&
    (params.proposedGap.workClass === "maintenance_work" ||
      params.proposedGap.workClass === "review_or_consolidation")
  ) {
    return {
      decision: "stop_completed",
      reason: "goal_completed_after_confirmed_tester_verdict",
      details: {
        sealedMilestoneCount: params.sealedMilestoneCount,
        latestTesterGapId: latestVerdict.gapId,
        latestWorkerProofId: latestVerdict.workerProofId,
        latestTesterProofId: latestVerdict.testerProofId,
        proposedGapKind: params.proposedGap.gapKind,
        proposedWorkClass: params.proposedGap.workClass,
      },
    };
  }

  if (
    recentChallengedCount >= 2 ||
    (recentChurnCount >= 3 && params.sealedMilestoneCount === 0)
  ) {
    return {
      decision: "replan_goal",
      reason:
        recentChallengedCount >= 2
          ? "replan_required_after_repeated_challenged_path"
          : "replan_required_after_repeated_churn_without_milestones",
      details: {
        sealedMilestoneCount: params.sealedMilestoneCount,
        recentChallengedCount,
        recentChurnCount,
        proposedGapKind: params.proposedGap.gapKind,
        proposedWorkClass: params.proposedGap.workClass,
      },
    };
  }

  return {
    decision: "continue_current_gap",
    reason: "unresolved_gap_remains",
    details: {
      sealedMilestoneCount: params.sealedMilestoneCount,
      proposedGapKind: params.proposedGap.gapKind,
      proposedWorkClass: params.proposedGap.workClass,
    },
  };
}
