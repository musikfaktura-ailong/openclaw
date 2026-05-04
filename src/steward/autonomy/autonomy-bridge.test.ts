import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { markAutonomyBootCompleted, setAutonomyMode } from "./autonomy-state.js";
import { markRuntimeRunning } from "../runtime/runtime-state-repo.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import {
  recordAutonomyBridgeFailure,
  runAutonomyBridgeCycle,
  startStewardAutonomyBridge,
} from "./autonomy-bridge.js";

async function removeTempDirWithRetry(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const busy = error instanceof Error && String(error).includes("resource busy or locked");
      if (!busy) {
        throw error;
      }
      if (attempt === 4) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

describe("WS-K autonomy bridge", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("records boot, seeds one autonomy task, and persists triage evidence in one harnessed cycle", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-bridge-"));
    try {
      const sessionKey = "agent:main:webchat:direct:ws-k-bridge-a";
      const authority = getOrCreateStewardSession(sessionKey, 1_000);
      setAutonomyMode({ mode: "assistant_plus_autonomy", now: 1_050 });

      const result = await runAutonomyBridgeCycle({
        sessionKey,
        storePath: ":memory:",
        now: 1_200,
        artifactRoot: tempRoot,
        resolveStartupReadiness: () => ({
          truthCoreReady: true,
          lmStudioLifecycleReady: true,
        }),
      });
      const bootEvent = getDb()
        .prepare(`SELECT COUNT(*) AS count FROM steward_events WHERE kind = 'autonomy.boot.recorded'`)
        .get() as { count: number };
      const seededEvent = getDb()
        .prepare(`SELECT COUNT(*) AS count FROM steward_events WHERE kind = 'autonomy.task.seeded'`)
        .get() as { count: number };
      const flowCreatedEvent = getDb()
        .prepare(`SELECT COUNT(*) AS count FROM steward_events WHERE kind = 'flow.created'`)
        .get() as { count: number };
      const flowTask = getDb()
        .prepare(
          `SELECT t.task_id, f.state_json
           FROM steward_flow_tasks t
           JOIN steward_flows f ON f.id = t.flow_id
           WHERE f.session_id = ?
           ORDER BY t.id DESC LIMIT 1`,
        )
        .get(authority.sessionId) as { task_id: number; state_json: string };
      const hostTask = getDb()
        .prepare(`SELECT id FROM steward_host_tasks ORDER BY id DESC LIMIT 1`)
        .get() as { id: number };

      expect(result.boot.recorded).toBe(true);
      expect(result.tick?.status).toBe("seeded");
      expect(bootEvent.count).toBe(1);
      expect(seededEvent.count).toBe(1);
      expect(flowCreatedEvent.count).toBe(0);
      expect(flowTask.task_id).toBe(hostTask.id);
      expect(flowTask.state_json).toContain("\"triage_artifact_path\"");
      expect(result.execute).toBeNull();
    } finally {
      closeStewardDb();
      resetDbForTest();
      await removeTempDirWithRetry(tempRoot);
    }
  });

  it("runs a full seed-then-execute cycle through the unified runtime", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-bridge-exec-"));
    const storePath = path.join(tempRoot, "sessions.json");
    await fs.writeFile(storePath, "{}", "utf8");
    closeStewardDb();
    resetDbForTest();
    initStewardDb(storePath);
    try {
      const sessionKey = "agent:main:webchat:direct:ws-l-bridge-exec";
      setAutonomyMode({ mode: "assistant_plus_autonomy", now: 10_000 });

      const result = await runAutonomyBridgeCycle({
        cfg: {} as never,
        sessionKey,
        storePath,
        now: 10_100,
        artifactRoot: tempRoot,
        resolveStartupReadiness: () => ({
          truthCoreReady: true,
          lmStudioLifecycleReady: true,
        }),
        runAgent: (vi.fn().mockResolvedValue({
          payloads: [{ text: "Grounded autonomy execution completed." }],
          meta: {
            durationMs: 1,
            aborted: false,
            finalAssistantVisibleText: "Grounded autonomy execution completed.",
          },
        }) as never),
      });

      const hostTask = getDb()
        .prepare(`SELECT status FROM steward_host_tasks ORDER BY id DESC LIMIT 1`)
        .get() as { status: string };
      const executionEvent = getDb()
        .prepare(`SELECT COUNT(*) AS count FROM steward_events WHERE kind = 'autonomy.execution.completed'`)
        .get() as { count: number };

      expect(result.tick?.status).toBe("seeded");
      expect(result.execute).toMatchObject({
        status: "claimed",
        outcome: "completed",
      });
      expect(hostTask.status).toBe("done");
      expect(executionEvent.count).toBe(1);
    } finally {
      closeStewardDb();
      resetDbForTest();
      await removeTempDirWithRetry(tempRoot);
    }
  });

  it("preserves mutual exclusion by skipping autonomous seeding while a user turn is active", async () => {
    const sessionKey = "agent:main:webchat:direct:ws-k-bridge-b";
    const authority = getOrCreateStewardSession(sessionKey, 1_000);
    setAutonomyMode({ mode: "assistant_plus_autonomy", now: 1_050 });
    markAutonomyBootCompleted({ completed: true, now: 1_075 });
    markRuntimeRunning({
      sessionKey: authority.sessionId,
      flowId: 44,
      taskId: 44,
      now: 1_100,
    });

    const result = await runAutonomyBridgeCycle({
      sessionKey,
      storePath: ":memory:",
      now: 1_200,
      resolveStartupReadiness: () => ({
        truthCoreReady: false,
        lmStudioLifecycleReady: true,
      }),
    });
    const hostTaskCount = getDb()
      .prepare(`SELECT COUNT(*) AS count FROM steward_host_tasks`)
      .get() as { count: number };

    expect(result.tick?.status).toBe("blocked");
    expect(result.tick?.reason).toBe("user_turn_active");
    expect(hostTaskCount.count).toBe(0);
  });

  it("captures bridge cycle failures as persisted steward events", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-bridge-fail-"));
    const blockingFile = path.join(tempRoot, "not-a-directory.txt");
    await fs.writeFile(blockingFile, "x", "utf8");
    const runner = startStewardAutonomyBridge({
      cfg: {
        agents: {
          default: "main",
          list: [{ id: "main", label: "Main" }],
        },
      } as never,
      storePath: ":memory:",
      artifactRoot: blockingFile,
      intervalMs: 1_000,
      nowMs: (() => {
        let ts = 3_000;
        return () => ++ts;
      })(),
    });
    try {
      setAutonomyMode({ mode: "assistant_plus_autonomy", now: 3_000 });

      await new Promise((resolve) => setTimeout(resolve, 1_100));

      const failedEvent = getDb()
        .prepare(
          `SELECT kind, data_json
           FROM steward_events
           WHERE kind = 'autonomy.bridge.failed'
           ORDER BY id DESC
           LIMIT 1`,
        )
        .get() as { kind: string; data_json: string } | undefined;

      expect(failedEvent?.kind).toBe("autonomy.bridge.failed");
      expect(failedEvent?.data_json).toContain("not-a-directory.txt");
    } finally {
      runner.stop();
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("records the real readiness snapshot from the bridge resolver", async () => {
    const sessionKey = "agent:main:webchat:direct:ws-k-bridge-readiness";
    setAutonomyMode({ mode: "assistant_plus_autonomy", now: 1_000 });

    const first = await runAutonomyBridgeCycle({
      sessionKey,
      storePath: ":memory:",
      now: 1_100,
      resolveStartupReadiness: () => ({
        truthCoreReady: false,
        lmStudioLifecycleReady: true,
      }),
    });

    expect(first.boot.snapshot.truthCoreReady).toBe(false);
    expect(first.boot.snapshot.lmStudioLifecycleReady).toBe(true);

    closeStewardDb();
    resetDbForTest();
    initStewardDb(":memory:");
    setAutonomyMode({ mode: "assistant_plus_autonomy", now: 2_000 });

    const second = await runAutonomyBridgeCycle({
      sessionKey: `${sessionKey}-2`,
      storePath: ":memory:",
      now: 2_100,
      resolveStartupReadiness: () => ({
        truthCoreReady: true,
        lmStudioLifecycleReady: false,
      }),
    });

    expect(second.boot.snapshot.truthCoreReady).toBe(true);
    expect(second.boot.snapshot.lmStudioLifecycleReady).toBe(false);
  });

  it("initializes steward db from the provided storePath on a fresh bridge cycle", async () => {
    closeStewardDb();
    resetDbForTest();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-bridge-db-"));
    const storePath = path.join(tempDir, "sessions.json");
    try {
      initStewardDb(storePath);
      setAutonomyMode({ mode: "assistant_plus_autonomy", now: 4_000 });
      closeStewardDb();
      resetDbForTest();

      const result = await runAutonomyBridgeCycle({
        sessionKey: "agent:main:webchat:direct:ws-k-bridge-db-init",
        storePath,
        now: 4_100,
        resolveStartupReadiness: () => ({
          truthCoreReady: true,
          lmStudioLifecycleReady: true,
        }),
      });

      const bootEvent = getDb()
        .prepare(`SELECT COUNT(*) AS count FROM steward_events WHERE kind = 'autonomy.boot.recorded'`)
        .get() as { count: number };

      expect(result.boot.recorded).toBe(true);
      expect(bootEvent.count).toBe(1);
    } finally {
      closeStewardDb();
      resetDbForTest();
      initStewardDb(":memory:");
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("can persist bridge failures without a pre-initialized cached steward db", async () => {
    closeStewardDb();
    resetDbForTest();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-bridge-failure-db-"));
    const storePath = path.join(tempDir, "sessions.json");
    try {
      recordAutonomyBridgeFailure({
        sessionKey: "agent:main:webchat:direct:ws-k-bridge-failure-persist",
        storePath,
        now: 5_000,
        error: new Error("boom"),
      });

      const failedEvent = getDb()
        .prepare(
          `SELECT kind, data_json
           FROM steward_events
           WHERE kind = 'autonomy.bridge.failed'
           ORDER BY id DESC
           LIMIT 1`,
        )
        .get() as { kind: string; data_json: string } | undefined;

      expect(failedEvent?.kind).toBe("autonomy.bridge.failed");
      expect(failedEvent?.data_json).toContain("boom");
    } finally {
      closeStewardDb();
      resetDbForTest();
      initStewardDb(":memory:");
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
