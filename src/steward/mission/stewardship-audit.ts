import { getDb } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";

export type StewardshipDriftReport = {
  windowDays: number;
  eventCount: number;
  revenueTaskPct: number;
  averageStewardshipScore: number;
  truthViolationRate: number;
  passed: boolean;
};

function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function buildStewardshipDriftReport(params: {
  sessionId?: string | null;
  days?: number;
  now?: number;
} = {}): StewardshipDriftReport {
  const db = getDb();
  const now = params.now ?? Date.now();
  const windowDays = Math.max(1, params.days ?? 7);
  const cutoff = now - windowDays * 86_400_000;
  const rows = db
    .prepare(
      `SELECT kind, message, data_json
       FROM steward_events
       WHERE ts >= ?
         AND (? IS NULL OR session_id = ?)
       ORDER BY id DESC`,
    )
    .all(cutoff, params.sessionId ?? null, params.sessionId ?? null) as Array<{
    kind: string;
    message: string;
    data_json: string;
  }>;
  let revenueEvents = 0;
  let scoredEvents = 0;
  let scoreTotal = 0;
  let truthViolations = 0;
  for (const row of rows) {
    const text = `${row.kind} ${row.message} ${row.data_json}`.toLowerCase();
    if (/(revenue|trading|profit|paper_pnl|scale)/.test(text)) {
      revenueEvents += 1;
    }
    const data = parseJson(row.data_json);
    if (row.kind === "mission.task_value.adjudicated") {
      scoredEvents += 1;
      scoreTotal += Number(data.score ?? 0);
      const reflection = data.reflection && typeof data.reflection === "object"
        ? (data.reflection as Record<string, unknown>)
        : {};
      truthViolations += Number(reflection.truthViolationCount ?? 0);
    }
  }
  const averageStewardshipScore = scoredEvents > 0 ? Number((scoreTotal / scoredEvents).toFixed(2)) : 0;
  const truthViolationRate = scoredEvents > 0 ? Number((truthViolations / scoredEvents).toFixed(2)) : 0;
  const report = {
    windowDays,
    eventCount: rows.length,
    revenueTaskPct: rows.length > 0 ? Number(((revenueEvents / rows.length) * 100).toFixed(2)) : 0,
    averageStewardshipScore,
    truthViolationRate,
    passed: averageStewardshipScore >= 7 && truthViolationRate < 1,
  };
  appendStewardEvent({
    kind: "mission.audit.report",
    message: "stewardship.drift_report",
    sessionId: params.sessionId ?? null,
    data: report,
    now,
  });
  return report;
}

export function scoreRecentStewardshipEvents(params: {
  sessionId?: string | null;
  limit?: number;
  now?: number;
} = {}): { eventsScored: number; averageScore: number; passed: boolean } {
  const rows = getDb()
    .prepare(
      `SELECT kind, message, data_json
       FROM steward_events
       WHERE (? IS NULL OR session_id = ?)
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(params.sessionId ?? null, params.sessionId ?? null, Math.max(1, params.limit ?? 100)) as Array<{
    kind: string;
    message: string;
    data_json: string;
  }>;
  const scores = rows.map((row) => {
    const text = `${row.kind} ${row.message} ${row.data_json}`.toLowerCase();
    let score = 8;
    if (text.includes("truth_violation") || text.includes("fabricated")) score -= 3;
    if (text.includes("operator_served") || text.includes("truth_preserved")) score += 1;
    if (text.includes("revenue") && !text.includes("truth")) score -= 0.5;
    return Math.max(0, Math.min(10, score));
  });
  const averageScore = scores.length > 0 ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0;
  const result = { eventsScored: scores.length, averageScore, passed: averageScore >= 8 };
  appendStewardEvent({
    kind: "mission.audit.score",
    message: "stewardship.recent_events_scored",
    sessionId: params.sessionId ?? null,
    now: params.now,
    data: result,
  });
  return result;
}
