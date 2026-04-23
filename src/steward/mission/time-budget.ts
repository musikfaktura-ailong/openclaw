import { getDb } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";

export const TIME_BUDGET_KEY = "time_budget_seconds";
export const LAST_TICK_TS_KEY = "time.last_tick_ts";
export const LAST_VALIDATED_TS_KEY = "time.last_validated_ts";
export const KNOWLEDGE_BONUS_AT_KEY = "time.knowledge_bonus_at";

export const START_SECONDS = 24 * 60 * 60;
export const TELEMETRY_BONUS_SECONDS = 60;
export const VALIDATION_BONUS_SECONDS = 157_680;
export const KNOWLEDGE_MILESTONE_ENTRIES = 15;
export const KNOWLEDGE_MILESTONE_BONUS_SECONDS = 1_800;
export const REJECTION_BASE_BURN_SECONDS = 1_800;
export const REJECTION_MAX_BURN_SECONDS = 14_400;
export const HIGH_RUNWAY_THRESHOLD_SECONDS = 48 * 60 * 60;
export const REJECTION_PERCENT_BASE = 0.02;
export const REJECTION_PERCENT_MAX = 0.1;

export type TimeBudgetAdjustment = {
  beforeSeconds: number;
  afterSeconds: number;
  deltaSeconds: number;
  reason: string;
  exhausted: boolean;
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

function parseInteger(value: string | null, fallback: number): number {
  if (value == null || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

export function getRemainingTimeSeconds(): number {
  const raw = readKv(TIME_BUDGET_KEY);
  if (raw == null) {
    writeKv(TIME_BUDGET_KEY, String(START_SECONDS));
    writeKv(LAST_TICK_TS_KEY, String(Date.now()));
    return START_SECONDS;
  }
  return parseInteger(raw, START_SECONDS);
}

export function setRemainingTimeSeconds(seconds: number): number {
  const clamped = Math.max(0, Math.trunc(seconds));
  writeKv(TIME_BUDGET_KEY, String(clamped));
  return clamped;
}

export function adjustTimeBudget(params: {
  deltaSeconds: number;
  reason: string;
  sessionId?: string | null;
  flowId?: number | null;
  taskId?: number | null;
  now?: number;
}): TimeBudgetAdjustment {
  const beforeSeconds = getRemainingTimeSeconds();
  const afterSeconds = setRemainingTimeSeconds(beforeSeconds + Math.trunc(params.deltaSeconds));
  const result = {
    beforeSeconds,
    afterSeconds,
    deltaSeconds: afterSeconds - beforeSeconds,
    reason: params.reason,
    exhausted: afterSeconds <= 0,
  };
  appendStewardEvent({
    kind: "mission.time.updated",
    message: "time.updated",
    sessionId: params.sessionId ?? null,
    flowId: params.flowId ?? null,
    now: params.now,
    data: { ...result, taskId: params.taskId ?? null },
  });
  if (result.exhausted) {
    appendStewardEvent({
      kind: "mission.time.exhausted",
      message: "steward.time_exhausted",
      sessionId: params.sessionId ?? null,
      flowId: params.flowId ?? null,
      now: params.now,
      data: { reason: params.reason, beforeSeconds, taskId: params.taskId ?? null },
    });
  }
  return result;
}

export function applyRejectionBurn(params: {
  rejectionCount: number;
  sessionId?: string | null;
  flowId?: number | null;
  taskId?: number | null;
  now?: number;
}): TimeBudgetAdjustment {
  const remaining = getRemainingTimeSeconds();
  const repeatIndex = Math.max(0, Math.trunc(params.rejectionCount) - 1);
  if (remaining >= HIGH_RUNWAY_THRESHOLD_SECONDS) {
    const pct = Math.min(REJECTION_PERCENT_MAX, REJECTION_PERCENT_BASE * 2 ** repeatIndex);
    return adjustTimeBudget({
      ...params,
      deltaSeconds: -Math.trunc(remaining * pct),
      reason: `rejection_burn:${params.rejectionCount}:pct`,
    });
  }
  const burn = Math.min(REJECTION_MAX_BURN_SECONDS, REJECTION_BASE_BURN_SECONDS * 2 ** repeatIndex);
  return adjustTimeBudget({
    ...params,
    deltaSeconds: -burn,
    reason: `rejection_burn:${params.rejectionCount}:fixed`,
  });
}

export function applyValidationBonus(params: {
  sessionId?: string | null;
  flowId?: number | null;
  taskId?: number | null;
  now?: number;
} = {}): TimeBudgetAdjustment {
  writeKv(LAST_VALIDATED_TS_KEY, String(params.now ?? Date.now()));
  return adjustTimeBudget({ ...params, deltaSeconds: VALIDATION_BONUS_SECONDS, reason: "validation_win" });
}

export function applyTelemetryBonus(params: {
  sessionId?: string | null;
  flowId?: number | null;
  taskId?: number | null;
  now?: number;
} = {}): TimeBudgetAdjustment {
  return adjustTimeBudget({ ...params, deltaSeconds: TELEMETRY_BONUS_SECONDS, reason: "telemetry_bonus" });
}

export function applyKnowledgeMilestoneBonus(params: {
  sessionId?: string | null;
  flowId?: number | null;
  taskId?: number | null;
  now?: number;
} = {}): TimeBudgetAdjustment | null {
  const row = getDb().prepare(`SELECT COUNT(*) AS count FROM steward_knowledge`).get() as {
    count: number;
  };
  const currentCount = Number(row.count ?? 0);
  let lastAt = parseInteger(readKv(KNOWLEDGE_BONUS_AT_KEY), currentCount);
  let earned = 0;
  while (currentCount - lastAt >= KNOWLEDGE_MILESTONE_ENTRIES) {
    lastAt += KNOWLEDGE_MILESTONE_ENTRIES;
    earned += KNOWLEDGE_MILESTONE_BONUS_SECONDS;
  }
  writeKv(KNOWLEDGE_BONUS_AT_KEY, String(lastAt));
  return earned > 0
    ? adjustTimeBudget({ ...params, deltaSeconds: earned, reason: "knowledge_milestone_bonus" })
    : null;
}

export function getTimeBudgetPromptContext(): string {
  const remaining = getRemainingTimeSeconds();
  return `TIME balance: remaining=${remaining}s (${Math.floor(remaining / 3600)}h ${Math.floor((remaining % 3600) / 60)}m)`;
}

export const __testing = { readKv, writeKv };
