import { getDb } from "../db/db-bootstrap.js";
import { buildStewardshipDriftReport, scoreRecentStewardshipEvents } from "../mission/stewardship-audit.js";
import { seedControlTask } from "./control-budget.js";
import { applyImprovementHints } from "./self-improvement.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";

export const GOVERNOR_INTERVAL_MS = 10 * 60 * 1000;
export const EVENT_ROWS_TO_KEEP = 100_000;
export const KNOWLEDGE_PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const FLOW_PRUNE_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const LAST_RUN_KEY = "governor:last_run_ts";
const LAST_WEEKLY_AUDIT_KEY = "governor:last_weekly_audit_ts";
const LAST_MONTHLY_AUDIT_KEY = "governor:last_monthly_audit_ts";
const LAST_PRUNE_KEY = "governor:last_prune_ts";
const WEEKLY_AUDIT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const MONTHLY_AUDIT_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

export type RootCause =
  | "task_design_issue"
  | "planner_issue"
  | "research_deficit"
  | "tool_misuse"
  | "strategy_defect"
  | "stewardship_drift";

export type Intervention = "hint_patch" | "reroute_task" | "diagnostic_task" | "strategy_reset";

type GovernorSignals = {
  rejectedProofRate: number;
  proofCount2h: number;
  lowValueCount: number;
  taskValueCount: number;
  precheckBlocks: number;
  consequenceBlocks: number;
  knowledgeCount: number;
  stewardshipDrift: boolean;
  averageStewardshipScore: number;
};

function readKv(key: string): string | null {
  const row = getDb().prepare(`SELECT v FROM steward_kv WHERE k = ?`).get(key) as
    | { v: string }
    | undefined;
  return row?.v ?? null;
}

function writeKv(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO steward_kv (k, v)
       VALUES (?, ?)
       ON CONFLICT(k) DO UPDATE SET v = excluded.v`,
    )
    .run(key, value);
}

function buildSignals(sessionId: string, sessionKey: string, now: number): GovernorSignals {
  const cutoff2h = now - 2 * 60 * 60 * 1000;
  const proofRows = getDb()
    .prepare(
      `SELECT verdict
       FROM steward_proofs
       WHERE session_id = ?
       ORDER BY id DESC
       LIMIT 10`,
    )
    .all(sessionId) as Array<{ verdict: string }>;
  const lowValueCount = Number(
    (getDb()
      .prepare(
        `SELECT COUNT(*) AS count
         FROM steward_events
         WHERE kind = 'mission.task_value.adjudicated'
           AND session_id = ?
           AND data_json LIKE '%\"label\":\"low_value\"%'`,
      )
      .get(sessionId) as { count: number }).count ?? 0,
  );
  const taskValueCount = Number(
    (getDb()
      .prepare(
        `SELECT COUNT(*) AS count
         FROM steward_events
         WHERE kind = 'mission.task_value.adjudicated'
           AND session_id = ?`,
      )
      .get(sessionId) as { count: number }).count ?? 0,
  );
  const proofCount2h = Number(
    (getDb()
      .prepare(`SELECT COUNT(*) AS count FROM steward_proofs WHERE session_id = ? AND created_ts >= ?`)
      .get(sessionId, cutoff2h) as { count: number }).count ?? 0,
  );
  const precheckBlocks = Number(
    (getDb()
      .prepare(`SELECT COUNT(*) AS count FROM steward_events WHERE session_id = ? AND kind = 'tool.precheck.blocked'`)
      .get(sessionId) as { count: number }).count ?? 0,
  );
  const consequenceBlocks = Number(
    (getDb()
      .prepare(
        `SELECT COUNT(*) AS count
         FROM steward_events
         WHERE session_id = ?
           AND kind IN ('consequence.refused', 'consequence.reroute')`,
      )
      .get(sessionId) as { count: number }).count ?? 0,
  );
  const knowledgeCount = Number(
    (getDb()
      .prepare(`SELECT COUNT(*) AS count FROM steward_knowledge WHERE session_key = ? OR session_key IS NULL`)
      .get(sessionKey) as { count: number }).count ?? 0,
  );
  const drift = buildStewardshipDriftReport({ sessionId, now });
  return {
    rejectedProofRate:
      proofRows.length > 0
        ? proofRows.filter((row) => row.verdict === "rejected").length / proofRows.length
        : 0,
    proofCount2h,
    lowValueCount,
    taskValueCount,
    precheckBlocks,
    consequenceBlocks,
    knowledgeCount,
    stewardshipDrift: taskValueCount > 0 && !drift.passed,
    averageStewardshipScore: drift.averageStewardshipScore,
  };
}

export function classifyGovernorRootCause(signals: GovernorSignals): RootCause {
  if (signals.stewardshipDrift) return "stewardship_drift";
  if (signals.precheckBlocks + signals.consequenceBlocks >= 3) return "tool_misuse";
  if (signals.rejectedProofRate > 0.6 && signals.lowValueCount >= 3) return "task_design_issue";
  if (signals.rejectedProofRate > 0.6 && signals.proofCount2h === 0) return "planner_issue";
  if (signals.knowledgeCount < 10 && signals.proofCount2h === 0) return "research_deficit";
  return "strategy_defect";
}

export function chooseGovernorIntervention(cause: RootCause): Intervention {
  switch (cause) {
    case "stewardship_drift":
    case "research_deficit":
      return "reroute_task";
    case "planner_issue":
      return "diagnostic_task";
    case "strategy_defect":
      return "strategy_reset";
    case "tool_misuse":
    case "task_design_issue":
    default:
      return "hint_patch";
  }
}

export function pruneGovernorData(now = Date.now()): {
  eventsPruned: number;
  knowledgePruned: number;
  flowsPruned: number;
} {
  const lastPrune = Number(readKv(LAST_PRUNE_KEY) ?? 0);
  if (now - lastPrune < PRUNE_INTERVAL_MS) {
    return { eventsPruned: 0, knowledgePruned: 0, flowsPruned: 0 };
  }
  const db = getDb();
  let eventsPruned = 0;
  let knowledgePruned = 0;
  let flowsPruned = 0;
  const totalEvents = Number((db.prepare(`SELECT COUNT(*) AS count FROM steward_events`).get() as { count: number }).count ?? 0);
  if (totalEvents > EVENT_ROWS_TO_KEEP) {
    const cutoffRow = db
      .prepare(`SELECT id FROM steward_events ORDER BY id DESC LIMIT 1 OFFSET ?`)
      .get(EVENT_ROWS_TO_KEEP) as { id: number } | undefined;
    if (cutoffRow) {
      eventsPruned = Number(
        (db.prepare(`SELECT COUNT(*) AS count FROM steward_events WHERE id < ?`).get(cutoffRow.id) as { count: number })
          .count ?? 0,
      );
      db.prepare(`DELETE FROM steward_events WHERE id < ?`).run(cutoffRow.id);
    }
  }
  knowledgePruned = Number(
    (db
      .prepare(
        `DELETE FROM steward_knowledge
         WHERE id IN (
           SELECT k.id
           FROM steward_knowledge k
           LEFT JOIN steward_memories m ON m.knowledge_id = k.id
           LEFT JOIN steward_host_tasks ht ON ht.triage_knowledge_id = k.id
           WHERE k.created_ts < ?
             AND ht.id IS NULL
             AND (
               COALESCE(m.confidence_score, 0) < 0.6
               OR k.metadata_json LIKE '%"fallback_embed":true%'
             )
         )`,
      )
      .run(now - KNOWLEDGE_PRUNE_AGE_MS) as { changes: number }).changes ?? 0,
  );
  db.prepare(
    `DELETE FROM steward_flow_tasks
     WHERE flow_id IN (
       SELECT id
       FROM steward_flows
       WHERE status = 'completed'
         AND updated_ts < ?
     )`,
  ).run(now - FLOW_PRUNE_AGE_MS);
  flowsPruned = Number(
    (db
      .prepare(
        `DELETE FROM steward_flows
         WHERE status = 'completed'
           AND updated_ts < ?`,
      )
      .run(now - FLOW_PRUNE_AGE_MS) as { changes: number }).changes ?? 0,
  );
  writeKv(LAST_PRUNE_KEY, String(now));
  return { eventsPruned, knowledgePruned, flowsPruned };
}

export function runMaintenanceGovernorTick(params: {
  sessionKey: string;
  now?: number;
}): { skipped: boolean; cause?: RootCause; action?: Intervention; prune?: ReturnType<typeof pruneGovernorData> } {
  const now = params.now ?? Date.now();
  const lastRun = Number(readKv(LAST_RUN_KEY) ?? 0);
  const authority = getOrCreateStewardSession(params.sessionKey, now);
  if (now - lastRun < GOVERNOR_INTERVAL_MS) {
    return { skipped: true };
  }
  writeKv(LAST_RUN_KEY, String(now));

  if (now - Number(readKv(LAST_WEEKLY_AUDIT_KEY) ?? 0) >= WEEKLY_AUDIT_INTERVAL_MS) {
    buildStewardshipDriftReport({ sessionId: authority.sessionId, now });
    writeKv(LAST_WEEKLY_AUDIT_KEY, String(now));
  }
  if (now - Number(readKv(LAST_MONTHLY_AUDIT_KEY) ?? 0) >= MONTHLY_AUDIT_INTERVAL_MS) {
    scoreRecentStewardshipEvents({ sessionId: authority.sessionId, now });
    writeKv(LAST_MONTHLY_AUDIT_KEY, String(now));
  }

  const prune = pruneGovernorData(now);
  const signals = buildSignals(authority.sessionId, params.sessionKey, now);
  const cause = classifyGovernorRootCause(signals);
  const action = chooseGovernorIntervention(cause);
  let seeded = null;
  if (action !== "hint_patch") {
    seeded = seedControlTask({
      sessionKey: params.sessionKey,
      title: `Governor: ${action}`,
      details: `Governor intervention for ${cause}. Review recent stewardship/task/proof signals and correct the runtime path.`,
      source: "governor",
      taskType: action === "strategy_reset" ? "strategy_reset" : action === "diagnostic_task" ? "diagnostic" : "analysis",
      now,
    });
  } else {
    applyImprovementHints({ sessionId: authority.sessionId, now });
  }
  appendStewardEvent({
    kind: "control.governor.intervention",
    message: `governor.${action}`,
    sessionId: authority.sessionId,
    flowId: seeded?.flowId ?? null,
    now,
    data: { cause, action, signals, seededTaskId: seeded?.taskId ?? null, prune },
  });
  return { skipped: false, cause, action, prune };
}
