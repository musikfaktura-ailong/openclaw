import { getDb } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";

export type AutonomyMode = "assistant_only" | "assistant_plus_autonomy" | "autonomy_paused";

export type AutonomyBlockedReason =
  | "assistant_only_mode"
  | "autonomy_paused"
  | "user_turn_active"
  | "cooldown_active"
  | "boot_not_complete"
  | "budget_blocked";

export type AutonomyState = {
  mode: AutonomyMode;
  lastAutonomyTickTs: number | null;
  bootCompleted: boolean;
  idleBackoffMs: number;
  lastBlockedReason: AutonomyBlockedReason | null;
  nextAllowedTickTs: number | null;
  updatedTs: number | null;
};

const MODE_KEY = "autonomy.mode";
const LAST_TICK_KEY = "autonomy.last_tick_ts";
const BOOT_COMPLETED_KEY = "autonomy.boot_completed";
const IDLE_BACKOFF_KEY = "autonomy.idle_backoff_ms";
const LAST_BLOCKED_REASON_KEY = "autonomy.last_blocked_reason";
const NEXT_ALLOWED_TICK_KEY = "autonomy.next_allowed_tick_ts";
const UPDATED_TS_KEY = "autonomy.updated_ts";

const DEFAULT_MODE: AutonomyMode = "assistant_only";

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

function parseInteger(value: string | null): number | null {
  if (value == null || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function parseMode(value: string | null): AutonomyMode {
  switch (value) {
    case "assistant_plus_autonomy":
    case "autonomy_paused":
    case "assistant_only":
      return value;
    default:
      return DEFAULT_MODE;
  }
}

function parseBlockedReason(value: string | null): AutonomyBlockedReason | null {
  switch (value) {
    case "assistant_only_mode":
    case "autonomy_paused":
    case "user_turn_active":
    case "cooldown_active":
    case "boot_not_complete":
    case "budget_blocked":
      return value;
    default:
      return null;
  }
}

function parseBoolean(value: string | null): boolean {
  return value === "true";
}

function writeUpdatedTimestamp(now: number): void {
  writeKv(UPDATED_TS_KEY, String(now));
}

function resolveEventSessionId(sessionId: string | null | undefined): string | null {
  if (!sessionId) {
    return null;
  }
  const row = getDb().prepare(`SELECT 1 FROM steward_sessions WHERE id = ? LIMIT 1`).get(sessionId) as
    | { 1: number }
    | undefined;
  return row ? sessionId : null;
}

export function getAutonomyState(): AutonomyState {
  return {
    mode: parseMode(readKv(MODE_KEY)),
    lastAutonomyTickTs: parseInteger(readKv(LAST_TICK_KEY)),
    bootCompleted: parseBoolean(readKv(BOOT_COMPLETED_KEY)),
    idleBackoffMs: Math.max(parseInteger(readKv(IDLE_BACKOFF_KEY)) ?? 0, 0),
    lastBlockedReason: parseBlockedReason(readKv(LAST_BLOCKED_REASON_KEY)),
    nextAllowedTickTs: parseInteger(readKv(NEXT_ALLOWED_TICK_KEY)),
    updatedTs: parseInteger(readKv(UPDATED_TS_KEY)),
  };
}

export function setAutonomyMode(params: {
  mode: AutonomyMode;
  sessionId?: string | null;
  now?: number;
}): AutonomyState {
  const now = params.now ?? Date.now();
  writeKv(MODE_KEY, params.mode);
  writeUpdatedTimestamp(now);
  appendStewardEvent({
    kind: "autonomy.mode.updated",
    message: "autonomy mode updated",
    sessionId: resolveEventSessionId(params.sessionId),
    now,
    data: { mode: params.mode },
  });
  return getAutonomyState();
}

export function markAutonomyBootCompleted(params: { completed: boolean; now?: number }): AutonomyState {
  const now = params.now ?? Date.now();
  writeKv(BOOT_COMPLETED_KEY, params.completed ? "true" : "false");
  writeUpdatedTimestamp(now);
  return getAutonomyState();
}

export function setAutonomyIdleBackoff(params: { idleBackoffMs: number; now?: number }): AutonomyState {
  const now = params.now ?? Date.now();
  writeKv(IDLE_BACKOFF_KEY, String(Math.max(0, Math.trunc(params.idleBackoffMs))));
  writeUpdatedTimestamp(now);
  return getAutonomyState();
}

export function markAutonomyTickRan(params: { now?: number; nextAllowedTickTs?: number | null }): AutonomyState {
  const now = params.now ?? Date.now();
  writeKv(LAST_TICK_KEY, String(now));
  writeKv(LAST_BLOCKED_REASON_KEY, "");
  writeKv(NEXT_ALLOWED_TICK_KEY, params.nextAllowedTickTs == null ? "" : String(Math.trunc(params.nextAllowedTickTs)));
  writeUpdatedTimestamp(now);
  return getAutonomyState();
}

export function recordAutonomyBlocked(params: {
  reason: AutonomyBlockedReason;
  now?: number;
  nextAllowedTickTs?: number | null;
}): AutonomyState {
  const now = params.now ?? Date.now();
  writeKv(LAST_BLOCKED_REASON_KEY, params.reason);
  if (params.nextAllowedTickTs !== undefined) {
    writeKv(
      NEXT_ALLOWED_TICK_KEY,
      params.nextAllowedTickTs == null ? "" : String(Math.trunc(params.nextAllowedTickTs)),
    );
  }
  writeUpdatedTimestamp(now);
  return getAutonomyState();
}
