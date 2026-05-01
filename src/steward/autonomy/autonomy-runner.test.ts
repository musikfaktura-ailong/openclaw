import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { markAutonomyBootCompleted, setAutonomyMode } from "./autonomy-state.js";
import { runAutonomyTick } from "./autonomy-runner.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { markRuntimeRunning } from "../runtime/runtime-state-repo.js";

describe("WS-IC autonomy runner", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("blocks autonomy seeding when a user turn is active", async () => {
    const sessionKey = "agent:main:webchat:direct:auto-blocked";
    setAutonomyMode({ mode: "assistant_plus_autonomy", now: 1_000 });
    markAutonomyBootCompleted({ completed: true, now: 1_050 });
    const authority = getOrCreateStewardSession(sessionKey, 1_100);
    markRuntimeRunning({
      sessionKey: authority.sessionId,
      flowId: 17,
      taskId: 17,
      now: 1_150,
    });

    const result = await runAutonomyTick({
      sessionKey,
      now: 1_200,
    });
    const event = getDb()
      .prepare(
        `SELECT kind, data_json
         FROM steward_events
         WHERE kind = 'autonomy.tick.blocked'
         ORDER BY id DESC
         LIMIT 1` ,
      )
      .get() as { kind: string; data_json: string };

    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("user_turn_active");
    expect(event.kind).toBe("autonomy.tick.blocked");
    expect(event.data_json).toContain("\"reason\":\"user_turn_active\"");
  });

  it("seeds exactly one goal-oriented task when autonomy is eligible", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-runner-"));
    try {
      const sessionKey = "agent:main:webchat:direct:auto-seed";
      const authority = getOrCreateStewardSession(sessionKey, 1_000);
      setAutonomyMode({ mode: "assistant_plus_autonomy", now: 1_050 });
      markAutonomyBootCompleted({ completed: true, now: 1_100 });

      const result = await runAutonomyTick({
        sessionKey,
        artifactRoot: tempRoot,
        now: 1_200,
      });
      const flow = getDb()
        .prepare(`SELECT flow_type, status, state_json FROM steward_flows WHERE session_id = ? ORDER BY id DESC LIMIT 1`)
        .get(authority.sessionId) as { flow_type: string; status: string; state_json: string };
      const tasks = getDb()
        .prepare(`SELECT task_id FROM steward_flow_tasks ORDER BY id DESC LIMIT 1`)
        .get() as { task_id: number };
      const hostTask = getDb()
        .prepare(`SELECT id, title FROM steward_host_tasks ORDER BY id DESC LIMIT 1`)
        .get() as { id: number; title: string };
      const seededEvent = getDb()
        .prepare(`SELECT data_json FROM steward_events WHERE kind = 'autonomy.task.seeded' ORDER BY id DESC LIMIT 1`)
        .get() as { data_json: string };

      expect(result).toMatchObject({
        status: "seeded",
        workClass: "goal_work",
        reason: "no_recorded_proof_yet",
      });
      expect(flow.flow_type).toBe("research");
      expect(flow.status).toBe("resumable");
      expect(flow.state_json).toContain("\"seeded_by\":\"autonomy\"");
      expect(flow.state_json).toContain("\"autonomy_work_class\":\"goal_work\"");
      expect(tasks.task_id).toBe(hostTask.id);
      expect(hostTask.title).toContain("Research");
      expect(seededEvent.data_json).toContain("\"workClass\":\"goal_work\"");
      expect(seededEvent.data_json).toContain("\"triageArtifactPath\"");
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("suppresses duplicate autonomy work and persists noop backoff evidence", async () => {
    const sessionKey = "agent:main:webchat:direct:auto-noop";
    const authority = getOrCreateStewardSession(sessionKey, 1_000);
    setAutonomyMode({ mode: "assistant_plus_autonomy", now: 1_050 });
    markAutonomyBootCompleted({ completed: true, now: 1_100 });
    getDb()
      .prepare(
        `INSERT INTO steward_flows (
           session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
         ) VALUES (?, 'research', 'resumable', ?, ?, ?, ?, ?)` ,
      )
      .run(
        authority.sessionId,
        JSON.stringify({
          seeded_by: "autonomy",
          autonomy_work_class: "goal_work",
          classification_reason: "no_recorded_proof_yet",
        }),
        process.pid,
        1_150,
        1_150,
        1_150,
      );

    const result = await runAutonomyTick({
      sessionKey,
      now: 1_200,
    });
    const noopEvent = getDb()
      .prepare(`SELECT data_json FROM steward_events WHERE kind = 'autonomy.tick.noop' ORDER BY id DESC LIMIT 1`)
      .get() as { data_json: string };
    const nextAllowed = getDb()
      .prepare(`SELECT v FROM steward_kv WHERE k = 'autonomy.next_allowed_tick_ts'`)
      .get() as { v: string };

    expect(result.status).toBe("noop");
    expect(result.reason).toBe("duplicate_seed_suppressed");
    expect(Number(nextAllowed.v)).toBeGreaterThan(1_200);
    expect(noopEvent.data_json).toContain("\"reason\":\"duplicate_seed_suppressed\"");
  });
});
