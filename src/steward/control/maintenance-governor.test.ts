import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { pruneGovernorData, runMaintenanceGovernorTick } from "./maintenance-governor.js";

describe("WS-H maintenance governor", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("classifies tool misuse and records a host-owned intervention event", () => {
    const sessionKey = "agent:main:webchat:direct:governor-tool";
    const session = getOrCreateStewardSession(sessionKey, 5_000);
    for (let index = 0; index < 3; index += 1) {
      appendStewardEvent({
        kind: "tool.precheck.blocked",
        message: "blocked",
        sessionId: session.sessionId,
        now: 5_000 + index,
        data: { toolName: "write" },
      });
    }

    const result = runMaintenanceGovernorTick({
      sessionKey,
      now: 700_000,
    });

    expect(result.skipped).toBe(false);
    expect(result.cause).toBe("tool_misuse");
    expect(result.action).toBe("hint_patch");
    const row = getDb()
      .prepare(
        `SELECT kind, data_json
         FROM steward_events
         WHERE kind = 'control.governor.intervention'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get() as { kind: string; data_json: string };
    expect(row.kind).toBe("control.governor.intervention");
    expect(row.data_json).toContain("\"cause\":\"tool_misuse\"");
  });

  it("prunes stale low-confidence memory and completed flow rows", () => {
    const session = getOrCreateStewardSession("agent:main:webchat:direct:governor-prune", 1_000);
    const db = getDb();
    db.prepare(
      `INSERT INTO steward_knowledge (
         session_key, memory_type, text, metadata_json, embedding_blob, embedding_dims, embedding_model, created_ts, updated_ts
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(session.channelKey, "relationship", "stale", '{"fallback_embed":true}', Buffer.from([0, 1]), 2, "test", 1, 1);
    const knowledgeId = Number(
      (db.prepare(`SELECT id FROM steward_knowledge ORDER BY id DESC LIMIT 1`).get() as { id: number }).id,
    );
    db.prepare(
      `INSERT INTO steward_memories (
         session_key, knowledge_id, memory_type, importance, salience_weight, source, task_id,
         payload_json, confidence_score, last_verified_ts, created_ts, updated_ts
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(session.channelKey, knowledgeId, "relationship", 0.5, 0.5, "test", null, "{}", 0.2, null, 1, 1);
    db.prepare(
      `INSERT INTO steward_flows (
         session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
       ) VALUES (?, 'maintenance', 'completed', '{}', ?, ?, ?, ?)`,
    ).run(session.sessionId, process.pid, 1, 1, 1);
    const flowId = Number((db.prepare(`SELECT id FROM steward_flows ORDER BY id DESC LIMIT 1`).get() as { id: number }).id);
    db.prepare(
      `INSERT INTO steward_flow_tasks (
         flow_id, task_id, role, link_status, created_ts, updated_ts
       ) VALUES (?, ?, 'diagnostic', 'succeeded', ?, ?)`,
    ).run(flowId, flowId, 1, 1);

    const result = pruneGovernorData(40 * 24 * 60 * 60 * 1000);

    expect(result.knowledgePruned).toBeGreaterThan(0);
    expect(result.flowsPruned).toBeGreaterThan(0);
    expect(
      Number((db.prepare(`SELECT COUNT(*) AS count FROM steward_flow_tasks WHERE flow_id = ?`).get(flowId) as { count: number }).count),
    ).toBe(0);
  });
});
