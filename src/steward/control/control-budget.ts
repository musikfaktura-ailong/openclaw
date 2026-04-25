import { getDb } from "../db/db-bootstrap.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";

export const CONTROL_BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CONTROL_BUDGET_MAX_TASKS = 3;
export const CONTROL_BUDGET_MAX_RATIO = 0.2;

export type ControlBudgetSnapshot = {
  windowMs: number;
  controlTaskCount: number;
  totalTaskCount: number;
  ratioAfterNextSeed: number;
  available: boolean;
};

export type SeededControlTask = {
  flowId: number;
  taskId: number;
};

function parseInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function parseFloatValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBudgetSetting(key: string, fallback: number): number {
  const row = getDb().prepare(`SELECT v FROM steward_kv WHERE k = ?`).get(key) as
    | { v: string }
    | undefined;
  return key.endsWith("ratio")
    ? parseFloatValue(row?.v, fallback)
    : parseInteger(row?.v, fallback);
}

function buildBudgetSnapshot(now = Date.now()): ControlBudgetSnapshot {
  const windowMs = Math.max(readBudgetSetting("control_budget.window_ms", CONTROL_BUDGET_WINDOW_MS), 60 * 60 * 1000);
  const maxTasks = Math.max(readBudgetSetting("control_budget.max_tasks", CONTROL_BUDGET_MAX_TASKS), 1);
  const maxRatio = Math.min(Math.max(readBudgetSetting("control_budget.max_ratio", CONTROL_BUDGET_MAX_RATIO), 0.05), 1);
  const cutoff = now - windowMs;
  const totalTaskCount = Number(
    (getDb()
      .prepare(`SELECT COUNT(*) AS count FROM steward_flow_tasks WHERE created_ts >= ?`)
      .get(cutoff) as { count: number }).count ?? 0,
  );
  const controlTaskCount = Number(
    (getDb()
      .prepare(
        `SELECT COUNT(*) AS count
         FROM steward_events
         WHERE kind = 'control.task.seeded' AND ts >= ?`,
      )
      .get(cutoff) as { count: number }).count ?? 0,
  );
  const ratioAfterNextSeed = (controlTaskCount + 1) / Math.max(totalTaskCount + 1, 1);
  const ratioActivationCount = Math.max(Math.ceil(1 / maxRatio), 1);
  const ratioGateSatisfied = totalTaskCount + 1 < ratioActivationCount || ratioAfterNextSeed <= maxRatio;
  return {
    windowMs,
    controlTaskCount,
    totalTaskCount,
    ratioAfterNextSeed,
    available: controlTaskCount < maxTasks && ratioGateSatisfied,
  };
}

export function getControlBudgetSnapshot(now = Date.now()): ControlBudgetSnapshot {
  return buildBudgetSnapshot(now);
}

export function canSeedControlTask(now = Date.now()): boolean {
  return buildBudgetSnapshot(now).available;
}

export function seedControlTask(params: {
  sessionKey: string;
  title: string;
  details: string;
  source: "metacog" | "governor" | "self_improvement";
  taskType: "analysis" | "diagnostic" | "strategy_reset" | "hint_patch";
  now?: number;
}): SeededControlTask | null {
  const now = params.now ?? Date.now();
  const budget = buildBudgetSnapshot(now);
  const authority = getOrCreateStewardSession(params.sessionKey, now);

  if (!budget.available) {
    appendStewardEvent({
      kind: "control.budget.blocked",
      message: "control budget blocked task seed",
      sessionId: authority.sessionId,
      now,
      data: {
        source: params.source,
        taskType: params.taskType,
        title: params.title,
        budget,
      },
    });
    return null;
  }

  const db = getDb();
  const stateJson = JSON.stringify({
    control_origin: params.source,
    control_task_type: params.taskType,
    title: params.title,
    details: params.details,
  });
  const flowResult = db
    .prepare(
      `INSERT INTO steward_flows (
         session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
       ) VALUES (?, 'maintenance', 'resumable', ?, ?, ?, ?, ?)`,
    )
    .run(authority.sessionId, stateJson, process.pid, now, now, now) as { lastInsertRowid: number | bigint };
  const flowId = Number(flowResult.lastInsertRowid);
  const taskId = flowId;
  db.prepare(
    `INSERT INTO steward_flow_tasks (
       flow_id, task_id, role, link_status, created_ts, updated_ts
     ) VALUES (?, ?, 'diagnostic', 'pending', ?, ?)`,
  ).run(flowId, taskId, now, now);
  appendStewardEvent({
    kind: "control.task.seeded",
    message: params.title,
    sessionId: authority.sessionId,
    flowId,
    now,
    data: {
      source: params.source,
      taskType: params.taskType,
      taskId,
      title: params.title,
      details: params.details,
      budget,
    },
  });
  return { flowId, taskId };
}
