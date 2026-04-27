import { getDb } from "../db/db-bootstrap.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { seedControlTask } from "./control-budget.js";

export const SPIN_WINDOW_MS = 60_000;
export const SPIN_THRESHOLD = 50;
export const STAGNATION_WINDOW_MS = 2 * 60 * 60 * 1000;
export const FRUSTRATION_THRESHOLD = 6;
const DUPLICATE_ANOMALY_WINDOW_MS = 10 * 60 * 1000;

export type MetacogAnomalyType = "spin" | "stagnation" | "frustration";

export type MetacogAnomaly = {
  type: MetacogAnomalyType;
  severity: "medium" | "high";
  detail: Record<string, unknown>;
  ts: number;
};

function recentlyEmitted(sessionId: string, type: MetacogAnomalyType, now: number): boolean {
  const cutoff = now - DUPLICATE_ANOMALY_WINDOW_MS;
  const rows = getDb()
    .prepare(
      `SELECT data_json
       FROM steward_events
       WHERE kind = 'control.anomaly.detected'
         AND session_id = ?
         AND ts >= ?`,
    )
    .all(sessionId, cutoff) as Array<{ data_json: string }>;
  return rows.some((row) => {
    try {
      return JSON.parse(row.data_json || "{}").type === type;
    } catch {
      return false;
    }
  });
}

export function detectSpin(params: { sessionId: string; now?: number }): MetacogAnomaly | null {
  const now = params.now ?? Date.now();
  const cutoff = now - SPIN_WINDOW_MS;
  const row = getDb()
    .prepare(
      `SELECT kind, message, COUNT(*) AS count
       FROM steward_events
       WHERE session_id = ? AND ts >= ?
       GROUP BY kind, message
       ORDER BY count DESC
       LIMIT 1`,
    )
    .get(params.sessionId, cutoff) as { kind: string; message: string; count: number } | undefined;
  if (row && Number(row.count ?? 0) > SPIN_THRESHOLD) {
    return {
      type: "spin",
      severity: "high",
      detail: { kind: row.kind, message: row.message, count: Number(row.count), windowMs: SPIN_WINDOW_MS },
      ts: now,
    };
  }
  return null;
}

export function detectStagnation(params: { sessionId: string; now?: number }): MetacogAnomaly | null {
  const now = params.now ?? Date.now();
  const lastProof = getDb()
    .prepare(
      `SELECT MAX(created_ts) AS ts
       FROM steward_proofs
       WHERE session_id = ?`,
    )
    .get(params.sessionId) as { ts: number | null };
  if (lastProof.ts != null && now - Number(lastProof.ts) <= STAGNATION_WINDOW_MS) {
    return null;
  }
  const firstEvent = getDb()
    .prepare(`SELECT MIN(ts) AS ts FROM steward_events WHERE session_id = ?`)
    .get(params.sessionId) as { ts: number | null };
  if (firstEvent.ts == null || now - Number(firstEvent.ts) <= STAGNATION_WINDOW_MS) {
    return null;
  }
  return {
    type: "stagnation",
    severity: "medium",
    detail: {
      lastProofTs: lastProof.ts,
      stagnationMs: now - (lastProof.ts != null ? Number(lastProof.ts) : Number(firstEvent.ts)),
    },
    ts: now,
  };
}

export function detectFrustration(params: { sessionId: string; now?: number }): MetacogAnomaly | null {
  const rows = getDb()
    .prepare(
      `SELECT t.link_status
       FROM steward_flow_tasks t
       JOIN steward_flows f ON f.id = t.flow_id
       WHERE f.session_id = ?
         AND t.role = 'primary'
       ORDER BY t.id DESC
       LIMIT ?`,
    )
    .all(params.sessionId, FRUSTRATION_THRESHOLD) as Array<{ link_status: string }>;
  if (rows.length < FRUSTRATION_THRESHOLD) {
    return null;
  }
  const allFailed = rows.every((row) => row.link_status === "failed");
  if (!allFailed) {
    return null;
  }
  return {
    type: "frustration",
    severity: "high",
    detail: {
      consecutiveFailures: FRUSTRATION_THRESHOLD,
      statuses: rows.map((row) => row.link_status),
    },
    ts: params.now ?? Date.now(),
  };
}

export function runMetacogMonitorTick(params: {
  sessionKey: string;
  now?: number;
}): { anomalies: MetacogAnomalyType[]; tasksSeeded: number[] } {
  const now = params.now ?? Date.now();
  const authority = getOrCreateStewardSession(params.sessionKey, now);
  const anomalies = [
    detectSpin({ sessionId: authority.sessionId, now }),
    detectStagnation({ sessionId: authority.sessionId, now }),
    detectFrustration({ sessionId: authority.sessionId, now }),
  ].filter((item): item is MetacogAnomaly => item != null);

  const result = { anomalies: [] as MetacogAnomalyType[], tasksSeeded: [] as number[] };
  for (const anomaly of anomalies) {
    if (recentlyEmitted(authority.sessionId, anomaly.type, now)) {
      continue;
    }
    appendStewardEvent({
      kind: "control.anomaly.detected",
      message: `metacog.${anomaly.type}`,
      sessionId: authority.sessionId,
      now,
      data: anomaly,
    });
    const seeded = seedControlTask({
      sessionKey: params.sessionKey,
      title: `Metacog: analyze ${anomaly.type}`,
      details: `Analyze ${anomaly.type} anomaly and document root cause plus corrective action.`,
      source: "metacog",
      taskType: "analysis",
      now,
    });
    result.anomalies.push(anomaly.type);
    if (seeded) {
      result.tasksSeeded.push(seeded.taskId);
    }
  }
  return result;
}
