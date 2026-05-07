import type {
  StewardRuntimeStateRow,
  StewardRuntimeStatus,
  StewardRuntimeTriggerSource,
} from "../db/runtime-schema.js";
import { getDb } from "../db/db-bootstrap.js";

function isPidAlive(pid: number | null | undefined): boolean {
  if (!Number.isInteger(pid) || (pid ?? 0) <= 0) {
    return false;
  }
  const normalizedPid = pid as number;
  try {
    process.kill(normalizedPid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return code === "EPERM";
  }
}

function clearDeadRuntimeOwner(params: {
  sessionKey: string;
  ownerPid: number;
  now?: number;
}): void {
  const now = params.now ?? Date.now();
  getDb()
    .prepare(
      `UPDATE steward_runtime_state
       SET status = 'idle',
           owner_pid = NULL,
           trigger_source = NULL,
           active_flow_id = NULL,
           active_task_id = NULL,
           heartbeat_ts = ?,
           last_transition_ts = ?,
           last_error = 'stale_runtime_owner_cleared',
           data_json = '{}',
           version = version + 1
       WHERE session_key = ? AND status = 'running' AND owner_pid = ?`,
    )
    .run(now, now, params.sessionKey, params.ownerPid);
}

function rowToRuntimeState(
  row:
    | {
        session_key: string;
        status: StewardRuntimeStatus;
        trigger_source: StewardRuntimeTriggerSource | null;
        owner_pid: number | null;
        active_flow_id: number | null;
        active_task_id: number | null;
        heartbeat_ts: number | null;
        last_transition_ts: number | null;
        wait_reason: string | null;
        last_error: string | null;
        version: number;
        data_json: string | null;
      }
    | undefined,
): StewardRuntimeStateRow | null {
  if (!row) {
    return null;
  }
  return {
    sessionKey: row.session_key,
    status: row.status,
    triggerSource: row.trigger_source ?? null,
    ownerPid: row.owner_pid,
    activeFlowId: row.active_flow_id,
    activeTaskId: row.active_task_id,
    heartbeatTs: row.heartbeat_ts,
    lastTransitionTs: row.last_transition_ts,
    waitReason: row.wait_reason ?? "",
    lastError: row.last_error ?? "",
    version: row.version,
    dataJson: row.data_json ?? "{}",
  };
}

export function getRuntimeState(sessionKey: string): StewardRuntimeStateRow | null {
  let row = getDb()
    .prepare(
      `SELECT session_key, status, owner_pid, active_flow_id, active_task_id, heartbeat_ts,
              last_transition_ts, wait_reason, last_error, version, data_json, trigger_source
       FROM steward_runtime_state WHERE session_key = ?`,
    )
    .get(sessionKey) as Parameters<typeof rowToRuntimeState>[0];
  if (row?.status === "running" && row.owner_pid && !isPidAlive(row.owner_pid)) {
    clearDeadRuntimeOwner({
      sessionKey,
      ownerPid: row.owner_pid,
      now: Date.now(),
    });
    row = getDb()
      .prepare(
        `SELECT session_key, status, owner_pid, active_flow_id, active_task_id, heartbeat_ts,
                last_transition_ts, wait_reason, last_error, version, data_json, trigger_source
         FROM steward_runtime_state WHERE session_key = ?`,
      )
      .get(sessionKey) as Parameters<typeof rowToRuntimeState>[0];
  }
  return rowToRuntimeState(row);
}
