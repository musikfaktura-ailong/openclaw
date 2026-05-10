import { getDb } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import type { RecordedTesterVerdict } from "./tester-policy.js";

export type RecordedStewardMilestone = {
  milestoneId: number;
  sessionId: string;
  gapId: number;
  verdictId: number;
  milestoneKind: string;
  title: string;
  status: "sealed";
  evidence: Record<string, unknown>;
  createdTs: number;
  updatedTs: number;
  reused: boolean;
};

function readExistingMilestone(verdictId: number): RecordedStewardMilestone | null {
  const row = getDb()
    .prepare(
      `SELECT id, session_id, gap_id, verdict_id, milestone_kind, title, status, evidence_json, created_ts, updated_ts
       FROM steward_milestones
       WHERE verdict_id = ?
       LIMIT 1`,
    )
    .get(verdictId) as
    | {
        id: number;
        session_id: string;
        gap_id: number;
        verdict_id: number;
        milestone_kind: string;
        title: string;
        status: "sealed";
        evidence_json: string;
        created_ts: number;
        updated_ts: number;
      }
    | undefined;
  if (!row) {
    return null;
  }
  return {
    milestoneId: row.id,
    sessionId: row.session_id,
    gapId: row.gap_id,
    verdictId: row.verdict_id,
    milestoneKind: row.milestone_kind,
    title: row.title,
    status: row.status,
    evidence: JSON.parse(row.evidence_json || "{}") as Record<string, unknown>,
    createdTs: row.created_ts,
    updatedTs: row.updated_ts,
    reused: true,
  };
}

export function countSealedMilestones(sessionId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM steward_milestones
       WHERE session_id = ?
         AND status = 'sealed'`,
    )
    .get(sessionId) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

export function sealCurrentMilestone(params: {
  sessionId: string;
  verdict: RecordedTesterVerdict | null;
  now?: number;
}): RecordedStewardMilestone | null {
  if (!params.verdict || params.verdict.verdict !== "confirmed") {
    return null;
  }

  const existing = readExistingMilestone(params.verdict.verdictId);
  if (existing) {
    return existing;
  }

  const gapRow = getDb()
    .prepare(
      `SELECT gap_kind, title, reason
       FROM steward_goal_gaps
       WHERE id = ?
       LIMIT 1`,
    )
    .get(params.verdict.gapId) as
    | {
        gap_kind: string;
        title: string;
        reason: string;
      }
    | undefined;
  if (!gapRow) {
    throw new Error(`Cannot seal milestone without governing gap row for gap ${params.verdict.gapId}`);
  }

  const now = params.now ?? Date.now();
  const milestoneKind = "goal_gap_confirmed";
  const title = gapRow.title
    ? `Milestone sealed: ${gapRow.title}`
    : "Milestone sealed: tester confirmed goal gap";
  const evidence = {
    gapKind: gapRow.gap_kind,
    gapReason: gapRow.reason,
    workerProofId: params.verdict.workerProofId,
    testerProofId: params.verdict.testerProofId,
    testerVerdict: params.verdict.verdict,
    challengeSummary: params.verdict.challengeSummary,
  } satisfies Record<string, unknown>;

  const result = getDb()
    .prepare(
      `INSERT INTO steward_milestones (
         session_id, gap_id, verdict_id, milestone_kind, title, status, evidence_json, created_ts, updated_ts
       ) VALUES (?, ?, ?, ?, ?, 'sealed', ?, ?, ?)`,
    )
    .run(
      params.sessionId,
      params.verdict.gapId,
      params.verdict.verdictId,
      milestoneKind,
      title,
      JSON.stringify(evidence),
      now,
      now,
    ) as { lastInsertRowid: number | bigint };
  const milestoneId = Number(result.lastInsertRowid);

  appendStewardEvent({
    kind: "autonomy.milestone.sealed",
    message: title,
    sessionId: params.sessionId,
    now,
    data: {
      milestoneId,
      verdictId: params.verdict.verdictId,
      gapId: params.verdict.gapId,
      milestoneKind,
      sessionId: params.sessionId,
    },
  });

  return {
    milestoneId,
    sessionId: params.sessionId,
    gapId: params.verdict.gapId,
    verdictId: params.verdict.verdictId,
    milestoneKind,
    title,
    status: "sealed",
    evidence,
    createdTs: now,
    updatedTs: now,
    reused: false,
  };
}
