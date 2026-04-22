import { getDb } from "../db/db-bootstrap.js";
import type { ProofHistoryEntry } from "./proof-types.js";

const MAX_HISTORY_SUMMARY_CHARS = 3_000;

function safeParseData(dataJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(dataJson || "{}");
    return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function summarizeData(data: Record<string, unknown>): string {
  const raw = JSON.stringify(data);
  if (!raw || raw === "{}") {
    return "";
  }
  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
}

export function loadProofHistory(params: {
  sessionId: string;
  limit?: number;
}): ProofHistoryEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT id, ts, kind, message, data_json
       FROM steward_events
       WHERE session_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(params.sessionId, Math.max(1, params.limit ?? 40)) as Array<{
    id: number;
    ts: number;
    kind: string;
    message: string;
    data_json: string;
  }>;

  return rows
    .reverse()
    .map((row) => ({
      id: row.id,
      ts: row.ts,
      kind: row.kind,
      message: row.message,
      data: safeParseData(row.data_json),
    }));
}

export function buildProofHistorySummary(history: ProofHistoryEntry[]): string {
  const lines = history
    .map((entry) => {
      const dataSummary = summarizeData(entry.data);
      return dataSummary
        ? `[${entry.kind}] ${entry.message} :: ${dataSummary}`
        : `[${entry.kind}] ${entry.message}`;
    })
    .filter(Boolean);
  const joined = lines.join("\n");
  if (joined.length <= MAX_HISTORY_SUMMARY_CHARS) {
    return joined;
  }
  return joined.slice(-MAX_HISTORY_SUMMARY_CHARS);
}
