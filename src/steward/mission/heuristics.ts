import { getDb } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";

export type HeuristicState = {
  confidence: number;
  frustration: number;
  curiosity: number;
};

const CONFIDENCE_KEY = "heuristics.confidence";
const FRUSTRATION_KEY = "heuristics.frustration";
const CURIOSITY_KEY = "heuristics.curiosity";
const DEFAULT_VALUE = 0.5;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function readFloat(key: string): number {
  const row = getDb().prepare(`SELECT v FROM steward_kv WHERE k = ?`).get(key) as
    | { v: string }
    | undefined;
  const parsed = Number(row?.v);
  return Number.isFinite(parsed) ? clamp(parsed) : DEFAULT_VALUE;
}

function writeFloat(key: string, value: number): number {
  const clamped = Number(clamp(value).toFixed(6));
  getDb()
    .prepare(
      `INSERT INTO steward_kv (k, v)
       VALUES (?, ?)
       ON CONFLICT(k) DO UPDATE SET v = excluded.v`,
    )
    .run(key, String(clamped));
  return clamped;
}

function adjust(key: string, delta: number): number {
  return writeFloat(key, readFloat(key) + delta);
}

function emitHeuristicEvent(reason: string, sessionId?: string | null, flowId?: number | null): void {
  appendStewardEvent({
    kind: "mission.heuristics.updated",
    message: "heuristics.updated",
    sessionId: sessionId ?? null,
    flowId: flowId ?? null,
    data: { reason, state: getHeuristicState() },
  });
}

export function getHeuristicState(): HeuristicState {
  return {
    confidence: readFloat(CONFIDENCE_KEY),
    frustration: readFloat(FRUSTRATION_KEY),
    curiosity: readFloat(CURIOSITY_KEY),
  };
}

export function resetHeuristics(): HeuristicState {
  writeFloat(CONFIDENCE_KEY, DEFAULT_VALUE);
  writeFloat(FRUSTRATION_KEY, DEFAULT_VALUE);
  writeFloat(CURIOSITY_KEY, DEFAULT_VALUE);
  return getHeuristicState();
}

export function onTaskHighValue(sessionId?: string | null, flowId?: number | null): HeuristicState {
  adjust(CONFIDENCE_KEY, 0.1);
  adjust(FRUSTRATION_KEY, -0.1);
  adjust(CURIOSITY_KEY, -0.05);
  emitHeuristicEvent("task_high_value", sessionId, flowId);
  return getHeuristicState();
}

export function onTaskLowValue(sessionId?: string | null, flowId?: number | null): HeuristicState {
  adjust(FRUSTRATION_KEY, 0.15);
  adjust(CURIOSITY_KEY, 0.12);
  emitHeuristicEvent("task_low_value", sessionId, flowId);
  return getHeuristicState();
}

export function onTruthfulService(sessionId?: string | null, flowId?: number | null): HeuristicState {
  adjust(CONFIDENCE_KEY, 0.15);
  adjust(FRUSTRATION_KEY, -0.1);
  emitHeuristicEvent("truthful_service", sessionId, flowId);
  return getHeuristicState();
}

export function onBurdenReduction(sessionId?: string | null, flowId?: number | null): HeuristicState {
  adjust(FRUSTRATION_KEY, -0.2);
  adjust(CURIOSITY_KEY, 0.05);
  emitHeuristicEvent("burden_reduction", sessionId, flowId);
  return getHeuristicState();
}

export function onTruthViolation(sessionId?: string | null, flowId?: number | null): HeuristicState {
  adjust(CONFIDENCE_KEY, -0.12);
  adjust(FRUSTRATION_KEY, 0.18);
  adjust(CURIOSITY_KEY, -0.04);
  emitHeuristicEvent("truth_violation", sessionId, flowId);
  return getHeuristicState();
}

export function decayTick(): HeuristicState {
  for (const key of [CONFIDENCE_KEY, FRUSTRATION_KEY, CURIOSITY_KEY]) {
    const current = readFloat(key);
    writeFloat(key, current + 0.02 * (DEFAULT_VALUE - current));
  }
  return getHeuristicState();
}

export function getHeuristicPromptContext(): string {
  const state = getHeuristicState();
  let label = "BALANCED - continue current plan";
  if (state.frustration > 0.7) {
    label = "FRUSTRATED - switch strategy or research new approaches";
  } else if (state.confidence > 0.75 && state.frustration < 0.4) {
    label = "CONFIDENT - current approach is working";
  } else if (state.curiosity > 0.65) {
    label = "CURIOUS - explore new opportunities";
  }
  return (
    `INTERNAL STATE: confidence=${state.confidence.toFixed(2)} ` +
    `frustration=${state.frustration.toFixed(2)} curiosity=${state.curiosity.toFixed(2)}\n` +
    `TEMPERAMENT: [${label}]`
  );
}

export function shouldForceResearch(): boolean {
  const state = getHeuristicState();
  return state.frustration > 0.8 && state.curiosity > 0.6;
}
