import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { markRuntimeRunning } from "../runtime/runtime-state-repo.js";
import { seedIdleAutonomyTask } from "./idle-seeding.js";
import { claimNextAutonomyTask, runAutonomyExecuteCycle } from "./autonomy-executor.js";

async function withTempStore<T>(
  run: (params: { artifactRoot: string; storePath: string }) => Promise<T>,
): Promise<T> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-ws-l-"));
  try {
    const artifactRoot = path.join(tempRoot, "artifacts");
    const storePath = path.join(tempRoot, "sessions.json");
    await fs.writeFile(storePath, "{}", "utf8");
    initStewardDb(storePath);
    return await run({ artifactRoot, storePath });
  } finally {
    closeStewardDb();
    resetDbForTest();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function seedOneTask(params: {
  sessionKey: string;
  artifactRoot: string;
  now?: number;
}) {
  const authority = getOrCreateStewardSession(params.sessionKey, params.now ?? 1_000);
  const seeded = await seedIdleAutonomyTask({
    sessionId: authority.sessionId,
    sessionKey: params.sessionKey,
    workClass: "goal_work",
    classificationReason: "no_recorded_proof_yet",
    artifactRoot: params.artifactRoot,
    now: params.now ?? 1_100,
  });
  expect(seeded.seeded).toBe(true);
  return authority;
}

describe("WS-L autonomy executor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("claims a pending autonomy task exactly once", async () => {
    await withTempStore(async ({ artifactRoot }) => {
      const sessionKey = "agent:main:webchat:direct:ws-l-claim";
      const authority = await seedOneTask({ sessionKey, artifactRoot });

      const first = claimNextAutonomyTask({
        sessionId: authority.sessionId,
        now: 1_200,
      });
      const second = claimNextAutonomyTask({
        sessionId: authority.sessionId,
        now: 1_250,
      });

      expect(first?.hostTaskId).toBeTruthy();
      expect(second).toBeNull();
    });
  });

  it("blocks execute when runtime is already active", async () => {
    await withTempStore(async ({ artifactRoot, storePath }) => {
      const sessionKey = "agent:main:webchat:direct:ws-l-block";
      const authority = await seedOneTask({ sessionKey, artifactRoot });
      markRuntimeRunning({
        sessionKey: authority.sessionId,
        flowId: 99,
        taskId: 99,
        triggerSource: "user",
        now: 1_300,
      });

      const result = await runAutonomyExecuteCycle({
        cfg: {} as never,
        sessionKey,
        storePath,
        now: 1_400,
      });

      expect(result).toEqual({
        status: "blocked",
        reason: "runtime_active",
      });
    });
  });

  it("executes a claimed autonomy task through the unified runtime and terminalizes it done", async () => {
    await withTempStore(async ({ artifactRoot, storePath }) => {
      const sessionKey = "agent:main:webchat:direct:ws-l-success";
      const authority = await seedOneTask({ sessionKey, artifactRoot });
      const runAgent = vi.fn().mockResolvedValue({
        payloads: [{ text: "Grounded execution evidence was gathered and summarized." }],
        meta: {
          durationMs: 1,
          aborted: false,
          finalAssistantVisibleText: "Grounded execution evidence was gathered and summarized.",
        },
      });

      const result = await runAutonomyExecuteCycle({
        cfg: {} as never,
        sessionKey,
        storePath,
        now: 1_500,
        runAgent: runAgent as never,
      });
      const hostTaskId = result.status === "claimed" ? result.hostTaskId : null;

      const hostTask = getDb()
        .prepare(`SELECT status, claimed_at, completed_at, error_json FROM steward_host_tasks ORDER BY id DESC LIMIT 1`)
        .get() as {
        status: string;
        claimed_at: number | null;
        completed_at: number | null;
        error_json: string;
      };
      const flow = getDb()
        .prepare(
          `SELECT f.status
           FROM steward_flows f
           JOIN steward_flow_tasks t ON t.flow_id = f.id
           WHERE t.task_id = ?
           ORDER BY f.id DESC
           LIMIT 1`,
        )
        .get(hostTaskId) as { status: string };
      const runtime = getDb()
        .prepare(`SELECT status, trigger_source FROM steward_runtime_state WHERE session_key = ?`)
        .get(authority.sessionId) as { status: string; trigger_source: string | null };
      const completedEvent = getDb()
        .prepare(
          `SELECT data_json
           FROM steward_events
           WHERE kind = 'autonomy.execution.completed'
           ORDER BY id DESC
           LIMIT 1`,
        )
        .get() as { data_json: string };

      expect(result).toMatchObject({
        status: "claimed",
        outcome: "completed",
      });
      expect(runAgent).toHaveBeenCalledOnce();
      expect(runAgent.mock.calls[0]?.[0]?.trigger).toBe("autonomy");
      expect(hostTask.status).toBe("done");
      expect(hostTask.claimed_at).toBeTruthy();
      expect(hostTask.completed_at).toBeTruthy();
      expect(hostTask.error_json).toBe("");
      expect(flow.status).toBe("completed");
      expect(runtime.status).toBe("idle");
      expect(runtime.trigger_source).toBeNull();
      expect(completedEvent.data_json).toContain("\"autonomySource\":true");
    });
  });

  it("marks the host task failed and persists the error path when the agent run throws", async () => {
    await withTempStore(async ({ artifactRoot, storePath }) => {
      const sessionKey = "agent:main:webchat:direct:ws-l-fail";
      const authority = await seedOneTask({ sessionKey, artifactRoot });
      const runAgent = vi.fn().mockRejectedValue(new Error("boom"));

      const result = await runAutonomyExecuteCycle({
        cfg: {} as never,
        sessionKey,
        storePath,
        now: 1_600,
        runAgent: runAgent as never,
      });
      const hostTaskId = result.status === "claimed" ? result.hostTaskId : null;

      const hostTask = getDb()
        .prepare(`SELECT status, failed_at, error_json FROM steward_host_tasks ORDER BY id DESC LIMIT 1`)
        .get() as { status: string; failed_at: number | null; error_json: string };
      const flow = getDb()
        .prepare(
          `SELECT f.status
           FROM steward_flows f
           JOIN steward_flow_tasks t ON t.flow_id = f.id
           WHERE t.task_id = ?
           ORDER BY f.id DESC
           LIMIT 1`,
        )
        .get(hostTaskId) as { status: string };
      const failedEvent = getDb()
        .prepare(
          `SELECT data_json
           FROM steward_events
           WHERE kind = 'autonomy.execution.failed'
           ORDER BY id DESC
           LIMIT 1`,
        )
        .get() as { data_json: string };

      expect(result).toMatchObject({
        status: "claimed",
        outcome: "failed",
      });
      expect(hostTask.status).toBe("failed");
      expect(hostTask.failed_at).toBeTruthy();
      expect(hostTask.error_json).toContain("boom");
      expect(flow.status).toBe("completed");
      expect(failedEvent.data_json).toContain("\"error\":\"Error: boom");
    });
  });
});
