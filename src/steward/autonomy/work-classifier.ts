import { getDb } from "../db/db-bootstrap.js";
import { resolveAutonomyWorkClassBoundary } from "./progress-discipline.js";

export type AutonomyWorkClass =
  | "goal_work"
  | "diagnostic_work"
  | "maintenance_work"
  | "review_or_consolidation";

export type ClassifiedAutonomyWork = {
  workClass: AutonomyWorkClass;
  reason: string;
};

type SqlParam = string | number | bigint | Uint8Array | null;

function countRows(sql: string, ...params: SqlParam[]): number {
  const row = getDb().prepare(sql).get(...params) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

export function classifyAutonomyWork(params: {
  sessionId: string;
  now?: number;
}): ClassifiedAutonomyWork {
  const now = params.now ?? Date.now();
  const activeBlockers = countRows(
    `SELECT COUNT(*) AS count
     FROM steward_blockers b
     JOIN steward_flows f ON f.id = b.flow_id
     WHERE f.session_id = ? AND b.status = 'active'`,
    params.sessionId,
  );
  if (activeBlockers > 0) {
    const boundary = resolveAutonomyWorkClassBoundary({
      sessionId: params.sessionId,
      proposedWorkClass: "diagnostic_work",
    });
    return {
      workClass: boundary.workClass,
      reason: boundary.boundaryApplied ? boundary.reason : "active_blockers_present",
    };
  }

  const proofCount = countRows(`SELECT COUNT(*) AS count FROM steward_proofs WHERE session_id = ?`, params.sessionId);
  if (proofCount === 0) {
    const boundary = resolveAutonomyWorkClassBoundary({
      sessionId: params.sessionId,
      proposedWorkClass: "goal_work",
    });
    return {
      workClass: boundary.workClass,
      reason: boundary.boundaryApplied ? boundary.reason : "no_recorded_proof_yet",
    };
  }

  const recentPrimaryFailures = countRows(
    `SELECT COUNT(*) AS count
     FROM (
       SELECT t.link_status
       FROM steward_flow_tasks t
       JOIN steward_flows f ON f.id = t.flow_id
       WHERE f.session_id = ?
         AND t.role = 'primary'
       ORDER BY t.id DESC
       LIMIT 2
     ) recent_failures
     WHERE link_status = 'failed'`,
    params.sessionId,
  );
  if (recentPrimaryFailures >= 2) {
    const boundary = resolveAutonomyWorkClassBoundary({
      sessionId: params.sessionId,
      proposedWorkClass: "diagnostic_work",
    });
    return {
      workClass: boundary.workClass,
      reason: boundary.boundaryApplied ? boundary.reason : "consecutive_primary_failures",
    };
  }

  const lastAuditTsRow = getDb()
    .prepare(
      `SELECT MAX(ts) AS ts
       FROM steward_events
       WHERE session_id = ?
         AND kind = 'mission.audit.report'`,
    )
    .get(params.sessionId) as { ts: number | null };
  const hasSessionEvents = countRows(`SELECT COUNT(*) AS count FROM steward_events WHERE session_id = ?`, params.sessionId);
  const reviewWindowMs = 24 * 60 * 60 * 1000;
  if (hasSessionEvents > 0 && (lastAuditTsRow.ts == null || now - Number(lastAuditTsRow.ts) >= reviewWindowMs)) {
    const boundary = resolveAutonomyWorkClassBoundary({
      sessionId: params.sessionId,
      proposedWorkClass: "review_or_consolidation",
    });
    return {
      workClass: boundary.workClass,
      reason: boundary.boundaryApplied
        ? boundary.reason
        : lastAuditTsRow.ts == null
          ? "audit_missing"
          : "audit_stale",
    };
  }

  const boundary = resolveAutonomyWorkClassBoundary({
    sessionId: params.sessionId,
    proposedWorkClass: "maintenance_work",
  });
  return {
    workClass: boundary.workClass,
    reason: boundary.boundaryApplied ? boundary.reason : "baseline_maintenance_window",
  };
}
