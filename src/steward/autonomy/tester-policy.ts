import { getDb } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import type { AutonomyGapWorkClass } from "./goal-gap-registry.js";

export type RecordedTesterVerdict = {
  verdictId: number;
  sessionId: string;
  gapId: number;
  workerProofId: number;
  testerProofId: number;
  verdict: "confirmed" | "challenged";
  challengeSummary: string;
};

export type TesterGapRequirement =
  | {
      kind: "tester_required";
      workClass: "tester_work";
      reason: "tester_required_after_accepted_proof";
      gapId: number;
      workerProofId: number;
      workerTaskId: number;
      workerFlowId: number | null;
      evidence: Record<string, unknown>;
    }
  | {
      kind: "tester_challenged";
      workClass: "goal_work";
      reason: "tester_challenged_worker_proof";
      gapId: number;
      workerProofId: number;
      testerProofId: number;
      challengeSummary: string;
      evidence: Record<string, unknown>;
    };

type GoalGapRef = {
  gapId: number;
  gapKind: string;
  workClass: string;
  reason: string;
};

function findCurrentOpenGoalGap(sessionId: string): GoalGapRef | null {
  const row = getDb()
    .prepare(
      `SELECT id, gap_kind, work_class, reason
       FROM steward_goal_gaps
       WHERE session_id = ?
         AND status = 'open'
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(sessionId) as
    | { id: number; gap_kind: string; work_class: string; reason: string }
    | undefined;
  if (!row) {
    return null;
  }
  return {
    gapId: row.id,
    gapKind: row.gap_kind,
    workClass: row.work_class,
    reason: row.reason,
  };
}

function latestAcceptedGoalProof(sessionId: string): {
  proofId: number;
  taskId: number;
  flowId: number | null;
  taskTitle: string;
  createdTs: number;
} | null {
  const row = getDb()
    .prepare(
      `SELECT p.id, p.task_id, p.flow_id, p.task_title, p.created_ts
       FROM steward_proofs p
       JOIN steward_host_tasks ht ON ht.id = p.task_id
       WHERE p.session_id = ?
         AND ht.source = 'autonomy'
         AND ht.work_class = 'goal_work'
         AND p.verdict = 'accepted'
       ORDER BY p.id DESC
       LIMIT 1`,
    )
    .get(sessionId) as
    | {
        id: number;
        task_id: number;
        flow_id: number | null;
        task_title: string;
        created_ts: number;
      }
    | undefined;
  if (!row) {
    return null;
  }
  return {
    proofId: row.id,
    taskId: row.task_id,
    flowId: row.flow_id,
    taskTitle: row.task_title,
    createdTs: row.created_ts,
  };
}

function latestTesterVerdict(sessionId: string): {
  id: number;
  gap_id: number;
  worker_proof_id: number;
  tester_proof_id: number;
  verdict: "confirmed" | "challenged";
  challenge_summary: string;
  created_ts: number;
} | null {
  const row = getDb()
    .prepare(
      `SELECT id, gap_id, worker_proof_id, tester_proof_id, verdict, challenge_summary, created_ts
       FROM steward_tester_verdicts
       WHERE session_id = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(sessionId) as
    | {
        id: number;
        gap_id: number;
        worker_proof_id: number;
        tester_proof_id: number;
        verdict: "confirmed" | "challenged";
        challenge_summary: string;
        created_ts: number;
      }
    | undefined;
  return row ?? null;
}

function newerAcceptedGoalProofExists(sessionId: string, afterTs: number): boolean {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM steward_proofs p
       JOIN steward_host_tasks ht ON ht.id = p.task_id
       WHERE p.session_id = ?
         AND ht.source = 'autonomy'
         AND ht.work_class = 'goal_work'
         AND p.verdict = 'accepted'
         AND p.created_ts > ?`,
    )
    .get(sessionId, afterTs) as { count: number };
  return Number(row.count ?? 0) > 0;
}

export function resolveTesterGapRequirement(params: {
  sessionId: string;
  now?: number;
}): TesterGapRequirement | null {
  const challenge = latestTesterVerdict(params.sessionId);
  if (
    challenge &&
    challenge.verdict === "challenged" &&
    !newerAcceptedGoalProofExists(params.sessionId, challenge.created_ts)
  ) {
    return {
      kind: "tester_challenged",
      workClass: "goal_work",
      reason: "tester_challenged_worker_proof",
      gapId: challenge.gap_id,
      workerProofId: challenge.worker_proof_id,
      testerProofId: challenge.tester_proof_id,
      challengeSummary: challenge.challenge_summary,
      evidence: {
        priorGapId: challenge.gap_id,
        workerProofId: challenge.worker_proof_id,
        testerProofId: challenge.tester_proof_id,
        challengeSummary: challenge.challenge_summary,
      },
    };
  }

  const workerProof = latestAcceptedGoalProof(params.sessionId);
  if (!workerProof) {
    return null;
  }
  const existingVerdict = getDb()
    .prepare(
      `SELECT id
       FROM steward_tester_verdicts
       WHERE session_id = ?
         AND worker_proof_id = ?
       LIMIT 1`,
    )
    .get(params.sessionId, workerProof.proofId) as { id: number } | undefined;
  if (existingVerdict) {
    return null;
  }
  const gap = findCurrentOpenGoalGap(params.sessionId);
  if (!gap) {
    return null;
  }
  return {
    kind: "tester_required",
    workClass: "tester_work",
    reason: "tester_required_after_accepted_proof",
    gapId: gap.gapId,
    workerProofId: workerProof.proofId,
    workerTaskId: workerProof.taskId,
    workerFlowId: workerProof.flowId,
    evidence: {
      priorGapId: gap.gapId,
      priorGapKind: gap.gapKind,
      workerProofId: workerProof.proofId,
      workerTaskId: workerProof.taskId,
      workerFlowId: workerProof.flowId,
      workerTaskTitle: workerProof.taskTitle,
    },
  };
}

export function recordLatestTesterVerdict(params: {
  sessionId: string;
  now?: number;
}): RecordedTesterVerdict | null {
  const latestTesterTask = getDb()
    .prepare(
      `SELECT id, seed_flow_id
       FROM steward_host_tasks
       WHERE session_id = ?
         AND source = 'autonomy'
         AND work_class = 'tester_work'
         AND status IN ('done', 'failed')
       ORDER BY updated_ts DESC, id DESC
       LIMIT 1`,
    )
    .get(params.sessionId) as { id: number; seed_flow_id: number | null } | undefined;
  if (!latestTesterTask) {
    return null;
  }

  const testerProof = getDb()
    .prepare(
      `SELECT id, verdict, reason, rejection_reason, created_ts
       FROM steward_proofs
       WHERE session_id = ?
         AND task_id = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(params.sessionId, latestTesterTask.id) as
    | {
        id: number;
        verdict: "accepted" | "rejected";
        reason: string;
        rejection_reason: string;
        created_ts: number;
      }
    | undefined;
  if (!testerProof) {
    return null;
  }

  const existing = getDb()
    .prepare(
      `SELECT id
       FROM steward_tester_verdicts
       WHERE tester_proof_id = ?
       LIMIT 1`,
    )
    .get(testerProof.id) as { id: number } | undefined;
  if (existing) {
    return null;
  }

  const flowStateRow = getDb()
    .prepare(`SELECT state_json FROM steward_flows WHERE id = ?`)
    .get(latestTesterTask.seed_flow_id) as { state_json: string } | undefined;
  const flowState = JSON.parse(flowStateRow?.state_json ?? "{}") as Record<string, unknown>;
  const gapEvidence =
    flowState.gap_evidence && typeof flowState.gap_evidence === "object"
      ? (flowState.gap_evidence as Record<string, unknown>)
      : {};
  const gapId = Number(gapEvidence.priorGapId ?? 0);
  const workerProofId = Number(gapEvidence.workerProofId ?? 0);
  if (!gapId || !workerProofId) {
    return null;
  }

  const verdict = testerProof.verdict === "accepted" ? "confirmed" : "challenged";
  const challengeSummary =
    verdict === "challenged"
      ? String(gapEvidence.challengeSummary ?? (testerProof.rejection_reason || testerProof.reason || ""))
      : "";
  const now = params.now ?? Date.now();
  const result = getDb()
    .prepare(
      `INSERT INTO steward_tester_verdicts (
         session_id, gap_id, worker_proof_id, tester_proof_id, verdict, challenge_summary, created_ts, updated_ts
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.sessionId,
      gapId,
      workerProofId,
      testerProof.id,
      verdict,
      challengeSummary,
      now,
      now,
    ) as { lastInsertRowid: number | bigint };
  const verdictId = Number(result.lastInsertRowid);

  appendStewardEvent({
    kind: "autonomy.tester.verdict",
    message: verdict === "confirmed" ? "tester confirmed worker proof" : "tester challenged worker proof",
    sessionId: params.sessionId,
    flowId: latestTesterTask.seed_flow_id,
    now,
    data: {
      verdictId,
      gapId,
      workerProofId,
      testerProofId: testerProof.id,
      verdict,
      challengeSummary,
    },
  });

  return {
    verdictId,
    sessionId: params.sessionId,
    gapId,
    workerProofId,
    testerProofId: testerProof.id,
    verdict,
    challengeSummary,
  };
}
