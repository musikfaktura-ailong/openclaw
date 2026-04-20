import { getDb } from "../db/db-bootstrap.js";
import type { StewardEventKind } from "../db/runtime-schema.js";

export function appendStewardEvent(params: {
  kind: StewardEventKind;
  message: string;
  sessionId?: string | null;
  flowId?: number | null;
  data?: Record<string, unknown>;
  now?: number;
}): void {
  const now = params.now ?? Date.now();
  getDb()
    .prepare(
      `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      now,
      params.sessionId ?? null,
      params.flowId ?? null,
      params.kind,
      params.message,
      JSON.stringify(params.data ?? {}),
    );
}
