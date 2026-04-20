import { getDb } from "../db/db-bootstrap.js";
import type { StewardFlowType } from "../db/runtime-schema.js";

export function createRuntimeFlow(params: {
  sessionId: string;
  flowType?: StewardFlowType;
  now?: number;
}): { flowId: number; taskId: number } {
  // port of core/runtime_flow.py:create_flow_for_goal into OpenClaw-aligned runtime tables
  const db = getDb();
  const now = params.now ?? Date.now();
  const flowResult = db
    .prepare(
      `INSERT INTO steward_flows (
         session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
       ) VALUES (?, ?, 'running', '{}', ?, ?, ?, ?)`,
    )
    .run(params.sessionId, params.flowType ?? "control", process.pid, now, now, now);
  const flowId = Number(flowResult.lastInsertRowid);
  const taskId = flowId;
  db.prepare(
    `INSERT INTO steward_flow_tasks (
       flow_id, task_id, role, link_status, created_ts, updated_ts
     ) VALUES (?, ?, 'primary', 'running', ?, ?)`,
  ).run(flowId, taskId, now, now);
  return { flowId, taskId };
}

export function completeRuntimeFlow(params: {
  flowId: number | null | undefined;
  taskId: number | null | undefined;
  now?: number;
}): void {
  // port of core/runtime_flow.py flow completion semantics into Steward2 flow rows
  if (!params.flowId) {
    return;
  }
  const db = getDb();
  const now = params.now ?? Date.now();
  db.prepare(
    `UPDATE steward_flows
     SET status = 'completed', updated_ts = ?, heartbeat_ts = ?
     WHERE id = ?`,
  ).run(now, now, params.flowId);
  if (params.taskId != null) {
    db.prepare(
      `UPDATE steward_flow_tasks
       SET link_status = 'succeeded', updated_ts = ?
       WHERE flow_id = ? AND task_id = ?`,
    ).run(now, params.flowId, params.taskId);
  }
}
