import { getDb } from "../db/db-bootstrap.js";
import { withBoundedRetries, withImmediateTransaction } from "../db/tx.js";
import type {
  StewardRuntimeStateRow,
  StewardRuntimeStatus,
  StewardRuntimeTriggerSource,
} from "../db/runtime-schema.js";
import { getRuntimeState } from "./runtime-state.js";

export function getOrCreateRuntimeState(sessionKey: string, now = Date.now()): StewardRuntimeStateRow {
  const db = getDb();
  db.prepare(
    `INSERT INTO steward_runtime_state (
       session_key, status, owner_pid, active_flow_id, active_task_id, heartbeat_ts, last_transition_ts,
       wait_reason, last_error, version, data_json, trigger_source
     ) VALUES (?, 'idle', NULL, NULL, NULL, ?, ?, '', '', 0, '{}', NULL)
     ON CONFLICT(session_key) DO NOTHING`,
  ).run(sessionKey, now, now);
  const state = getRuntimeState(sessionKey);
  if (!state) {
    throw new Error(`failed to create runtime state for session ${sessionKey}`);
  }
  return state;
}

export function casUpdateRuntimeState(params: {
  sessionKey: string;
  expectedVersion: number;
  status: StewardRuntimeStatus;
  activeFlowId?: number | null;
  activeTaskId?: number | null;
  ownerPid?: number | null;
  triggerSource?: StewardRuntimeTriggerSource | null;
  heartbeatTs?: number | null;
  lastTransitionTs?: number;
  waitReason?: string;
  lastError?: string;
  dataJson?: string;
}): boolean {
  const now = params.lastTransitionTs ?? Date.now();
  const result = getDb()
    .prepare(
      `UPDATE steward_runtime_state
       SET status = ?,
           owner_pid = ?,
           trigger_source = ?,
           active_flow_id = ?,
           active_task_id = ?,
           heartbeat_ts = ?,
           last_transition_ts = ?,
           wait_reason = ?,
           last_error = ?,
           data_json = ?,
           version = version + 1
       WHERE session_key = ? AND version = ?`,
    )
    // CAS: fails cleanly when version is stale; caller owns bounded retry.
    .run(
      params.status,
      params.ownerPid ?? null,
      params.triggerSource ?? null,
      params.activeFlowId ?? null,
      params.activeTaskId ?? null,
      params.heartbeatTs ?? null,
      now,
      params.waitReason ?? "",
      params.lastError ?? "",
      params.dataJson ?? "{}",
      params.sessionKey,
      params.expectedVersion,
    );
  return Number(result.changes ?? 0) > 0;
}

export function markRuntimeRunning(params: {
  sessionKey: string;
  flowId: number;
  taskId: number;
  triggerSource?: StewardRuntimeTriggerSource;
  now?: number;
}): StewardRuntimeStateRow {
  // port of core/runtime_flow.py flow activation semantics into Steward2 runtime state
  const now = params.now ?? Date.now();
  return withBoundedRetries({
    attempts: 4,
    shouldRetry: (error) => error instanceof Error && error.message === "stale-runtime-state",
    run: () =>
      withImmediateTransaction(getDb(), () => {
        const current = getOrCreateRuntimeState(params.sessionKey, now);
        const ok = casUpdateRuntimeState({
          sessionKey: params.sessionKey,
          expectedVersion: current.version,
          status: "running",
          triggerSource: params.triggerSource ?? "user",
          activeFlowId: params.flowId,
          activeTaskId: params.taskId,
          ownerPid: process.pid,
          heartbeatTs: now,
          lastTransitionTs: now,
        });
        if (!ok) {
          throw new Error("stale-runtime-state");
        }
        const next = getRuntimeState(params.sessionKey);
        if (!next) {
          throw new Error(`missing runtime state after running transition for ${params.sessionKey}`);
        }
        return next;
      }),
  });
}

export function markRuntimeIdle(params: {
  sessionKey: string;
  now?: number;
  lastError?: string;
}): StewardRuntimeStateRow {
  // port of core/runtime_flow.py completion semantics into Steward2 runtime state
  const now = params.now ?? Date.now();
  return withBoundedRetries({
    attempts: 4,
    shouldRetry: (error) => error instanceof Error && error.message === "stale-runtime-state",
    run: () =>
      withImmediateTransaction(getDb(), () => {
        const current = getOrCreateRuntimeState(params.sessionKey, now);
        const ok = casUpdateRuntimeState({
          sessionKey: params.sessionKey,
          expectedVersion: current.version,
          status: "idle",
          triggerSource: null,
          activeFlowId: null,
          activeTaskId: null,
          ownerPid: null,
          heartbeatTs: now,
          lastTransitionTs: now,
          lastError: params.lastError ?? "",
        });
        if (!ok) {
          throw new Error("stale-runtime-state");
        }
        const next = getRuntimeState(params.sessionKey);
        if (!next) {
          throw new Error(`missing runtime state after idle transition for ${params.sessionKey}`);
        }
        return next;
      }),
  });
}
