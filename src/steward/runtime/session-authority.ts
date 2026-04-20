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
  // Owns: steward_sessions only. runtime_state row is owned by runtime-state-repo.ts.
  const db = getDb();
  const authority = resolveSessionAuthority(sessionKey);
  db.prepare(
    `INSERT INTO steward_sessions (id, agent_id, channel_key, created_ts, last_active_ts, status, data_json)
     VALUES (?, ?, ?, ?, ?, 'open', '{}')
     ON CONFLICT(id) DO UPDATE SET last_active_ts = excluded.last_active_ts`,
  ).run(authority.sessionId, authority.agentId, authority.channelKey, now, now);
  return authority;
}
