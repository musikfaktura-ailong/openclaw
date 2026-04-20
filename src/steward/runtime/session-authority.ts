import crypto from "node:crypto";
import { getDb } from "../db/db-bootstrap.js";
import { resolveAgentIdFromSessionKey, toAgentRequestSessionKey } from "../../routing/session-key.js";

export type StewardSessionAuthority = {
  sessionId: string;
  agentId: string;
  channelKey: string;
};

export function computeStewardSessionId(agentId: string, channelKey: string): string {
  return crypto.createHash("sha256").update(`${agentId}:${channelKey}`).digest("hex");
}

export function resolveSessionAuthority(sessionKey: string): StewardSessionAuthority {
  const agentId = resolveAgentIdFromSessionKey(sessionKey);
  const channelKey = toAgentRequestSessionKey(sessionKey) ?? sessionKey.trim().toLowerCase();
  return {
    sessionId: computeStewardSessionId(agentId, channelKey),
    agentId,
    channelKey,
  };
}

export function getOrCreateStewardSession(sessionKey: string, now = Date.now()): StewardSessionAuthority {
  const db = getDb();
  const authority = resolveSessionAuthority(sessionKey);
  db.prepare(
    `INSERT INTO steward_sessions (id, agent_id, channel_key, created_ts, last_active_ts, status, data_json)
     VALUES (?, ?, ?, ?, ?, 'open', '{}')
     ON CONFLICT(id) DO UPDATE SET last_active_ts = excluded.last_active_ts`,
  ).run(authority.sessionId, authority.agentId, authority.channelKey, now, now);
  db.prepare(
    `INSERT INTO steward_runtime_state (
       session_key, status, owner_pid, active_flow_id, active_task_id, heartbeat_ts, last_transition_ts,
       wait_reason, last_error, version, data_json
     ) VALUES (?, 'idle', NULL, NULL, NULL, ?, ?, '', '', 0, '{}')
     ON CONFLICT(session_key) DO NOTHING`,
  ).run(authority.sessionId, now, now);
  return authority;
}
