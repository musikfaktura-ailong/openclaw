import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import {
  buildSleepConsolidationSummary,
  runSleepConsolidationJob,
} from "./sleep-consolidation.js";

describe("WS-JB sleep consolidation job", () => {
  const embedder = async (text: string) =>
    Float32Array.from(text.includes("SLEEP_SUMMARY") ? [1, 0, 0, 0] : [0, 1, 0, 0]);

  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("builds a bounded day summary and persists consolidation evidence", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-sleep-"));
    try {
      const sessionKey = "agent:main:webchat:direct:sleep-a";
      const authority = getOrCreateStewardSession(sessionKey, 1_000);
      const now = Date.UTC(2026, 4, 1, 8, 0, 0);
      const dayStart = Date.UTC(2026, 4, 1, 0, 0, 0);
      const db = getDb();
      db.prepare(
        `INSERT INTO steward_flows (
           session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
         ) VALUES (?, 'research', 'completed', '{}', ?, ?, ?, ?)` ,
      ).run(authority.sessionId, process.pid, dayStart + 1000, dayStart + 1000, dayStart + 1000);
      const flowId = Number((db.prepare(`SELECT id FROM steward_flows ORDER BY id DESC LIMIT 1`).get() as { id: number }).id);
      db.prepare(
        `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
         VALUES (?, ?, ?, 'proof.accepted', 'accepted', '{}')` ,
      ).run(dayStart + 2000, authority.sessionId, flowId);

      const result = await runSleepConsolidationJob({
        sessionKey,
        now,
        artifactRoot: tempRoot,
        embedder,
      });
      const summaryJson = JSON.parse(await fs.readFile(result.summaryPath, "utf8")) as {
        day: string;
        eventCount: number;
        flowCount: number;
      };
      const recordedEvent = getDb()
        .prepare(`SELECT data_json FROM steward_events WHERE kind = 'job.sleep_consolidation.recorded' LIMIT 1`)
        .get() as { data_json: string };
      const knowledge = getDb()
        .prepare(`SELECT metadata_json FROM steward_knowledge WHERE id = ?`)
        .get(result.summaryKnowledgeId) as { metadata_json: string };

      expect(result.created).toBe(true);
      expect(summaryJson.day).toBe("2026-05-01");
      expect(summaryJson.eventCount).toBe(1);
      expect(summaryJson.flowCount).toBeGreaterThanOrEqual(1);
      expect(recordedEvent.data_json).toContain("\"summaryPath\"");
      expect(knowledge.metadata_json).toContain("\"sleep_summary_ref\":true");
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("dedupes per UTC day and reuses the existing consolidation record", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-sleep-reuse-"));
    try {
      const sessionKey = "agent:main:webchat:direct:sleep-b";
      const now = Date.UTC(2026, 4, 1, 8, 0, 0);

      const first = await runSleepConsolidationJob({
        sessionKey,
        now,
        artifactRoot: tempRoot,
        embedder,
      });
      const second = await runSleepConsolidationJob({
        sessionKey,
        now: now + 60_000,
        artifactRoot: tempRoot,
        embedder,
      });
      const flowCount = getDb()
        .prepare(`SELECT COUNT(*) AS count FROM steward_flows`)
        .get() as { count: number };

      expect(first.created).toBe(true);
      expect(second.reused).toBe(true);
      expect(second.flowId).toBe(first.flowId);
      expect(flowCount.count).toBe(1);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("archives and redacts only old low-value event payloads without deleting rows", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-sleep-prune-"));
    try {
      const sessionKey = "agent:main:webchat:direct:sleep-c";
      const authority = getOrCreateStewardSession(sessionKey, 1_000);
      const now = Date.UTC(2026, 4, 1, 8, 0, 0);
      const oldTs = now - 40 * 24 * 60 * 60 * 1000;
      getDb()
        .prepare(
          `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
           VALUES (?, ?, NULL, 'autonomy.tick.noop', 'noop', '{"details":"keep in archive"}')` ,
        )
        .run(oldTs, authority.sessionId);

      const result = await runSleepConsolidationJob({
        sessionKey,
        now,
        artifactRoot: tempRoot,
        pruneOlderThanMs: 30 * 24 * 60 * 60 * 1000,
        embedder,
      });
      const prunedEvent = getDb()
        .prepare(`SELECT data_json FROM steward_events WHERE kind = 'job.sleep_consolidation.pruned' LIMIT 1`)
        .get() as { data_json: string };
      const archivedRow = getDb()
        .prepare(`SELECT data_json FROM steward_events WHERE session_id = ? AND kind = 'autonomy.tick.noop' LIMIT 1`)
        .get(authority.sessionId) as { data_json: string };
      const preservedCount = getDb()
        .prepare(`SELECT COUNT(*) AS count FROM steward_events WHERE session_id = ? AND kind = 'autonomy.tick.noop'`)
        .get(authority.sessionId) as { count: number };

      expect(result.redactedEventCount).toBe(1);
      expect(result.archivePath).toBeTruthy();
      expect(prunedEvent.data_json).toContain("\"redactedEventCount\":1");
      expect(archivedRow.data_json).toContain("\"archived\":true");
      expect(preservedCount.count).toBe(1);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("summarizes only the current UTC day window", () => {
    const sessionKey = "agent:main:webchat:direct:sleep-window";
    const authority = getOrCreateStewardSession(sessionKey, 1_000);
    const now = Date.UTC(2026, 4, 1, 8, 0, 0);
    const dayStart = Date.UTC(2026, 4, 1, 0, 0, 0);
    getDb()
      .prepare(
        `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
         VALUES (?, ?, NULL, 'runtime.idle', 'today', '{}')` ,
      )
      .run(dayStart + 1000, authority.sessionId);
    getDb()
      .prepare(
        `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
         VALUES (?, ?, NULL, 'runtime.idle', 'yesterday', '{}')` ,
      )
      .run(dayStart - 1000, authority.sessionId);

    const summary = buildSleepConsolidationSummary({
      sessionId: authority.sessionId,
      now,
    });

    expect(summary.day).toBe("2026-05-01");
    expect(summary.eventCount).toBe(1);
  });
});
