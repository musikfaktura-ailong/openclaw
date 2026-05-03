import { afterEach, describe, expect, it, vi } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { ensureStewardLmstudioLifecycle, withStewardLmstudioQueryLock } from "./lifecycle-bridge.js";
import { planLmstudioLifecycle } from "./lifecycle-policy.js";

afterEach(() => {
  closeStewardDb();
  resetDbForTest();
});

describe("LM-C lifecycle bridge", () => {
  it("preserves lowercase normalization for mixed-case target model keys", () => {
    const plan = planLmstudioLifecycle({
      selection: {
        provider: "lmstudio",
        modelId: "LMSTUDIO/Qwen/Qwen3-14B",
        role: "primary_local",
      },
      loadedModels: [
        {
          modelKey: "qwen/qwen3-14b",
          instanceId: "inst-qwen",
          contextLength: 32_768,
          kind: "inference",
        },
      ],
    });

    expect(plan.action).toBe("noop");
    expect(plan.targetModelKey).toBe("qwen/qwen3-14b");
  });

  it("unloads before switching models and persists lifecycle events", async () => {
    initStewardDb(":memory:");
    const operations: string[] = [];
    const getLoadedLmstudioModels = vi.fn(async () => [
      {
        modelKey: "qwen/qwen3-14b",
        instanceId: "inst-primary",
        contextLength: 32_768,
        kind: "inference" as const,
      },
    ]);
    const unloadLmstudioModel = vi.fn(async ({ instanceId }: { instanceId?: string | null }) => {
      operations.push(`unload:${instanceId}`);
    });
    const ensureLmstudioModelLoaded = vi.fn(async ({ modelKey }: { modelKey: string }) => {
      operations.push(`load:${modelKey}`);
    });

    const result = await ensureStewardLmstudioLifecycle({
      selection: {
        provider: "lmstudio",
        modelId: "deepseek-r1-distill-qwen-14b",
        role: "critic_local",
        baseUrl: "http://127.0.0.1:1234",
      },
      sessionKey: "agent:main:webchat:direct:user-1",
      getLoadedLmstudioModels,
      unloadLmstudioModel,
      ensureLmstudioModelLoaded,
    });

    expect(result.bypassed).toBe(false);
    expect(result.plan.action).toBe("unload_then_load");
    expect(operations).toEqual(["unload:inst-primary", "load:deepseek-r1-distill-qwen-14b"]);

    const kinds = (
      getDb()
        .prepare(`SELECT kind FROM steward_events ORDER BY id ASC`)
        .all() as Array<{ kind: string }>
    ).map((row) => row.kind);
    expect(kinds).toEqual([
      "lmstudio.lifecycle.lock_wait_started",
      "lmstudio.lifecycle.lock_acquired",
      "lmstudio.lifecycle.unload_started",
      "lmstudio.lifecycle.unload_finished",
      "lmstudio.lifecycle.load_started",
      "lmstudio.lifecycle.load_finished",
      "lmstudio.lifecycle.lock_released",
    ]);
  });

  it("detects context mismatch, reloads, and records the mismatch event", async () => {
    initStewardDb(":memory:");
    const unloaded: string[] = [];
    const getLoadedLmstudioModels = vi.fn(async () => [
      {
        modelKey: "qwen/qwen3-14b",
        instanceId: "inst-small-a",
        contextLength: 4_096,
        kind: "inference" as const,
      },
      {
        modelKey: "qwen/qwen3-14b",
        instanceId: "inst-small-b",
        contextLength: 4_096,
        kind: "inference" as const,
      },
    ]);
    const unloadLmstudioModel = vi.fn(async ({ instanceId }: { instanceId?: string | null }) => {
      if (instanceId) {
        unloaded.push(instanceId);
      }
    });
    const ensureLmstudioModelLoaded = vi.fn(async () => {});

    await ensureStewardLmstudioLifecycle({
      selection: {
        provider: "lmstudio",
        modelId: "LMSTUDIO/Qwen/Qwen3-14B",
        role: "primary_local",
        requestedContextLength: 32_768,
      },
      sessionKey: "agent:main:webchat:direct:user-1",
      getLoadedLmstudioModels,
      unloadLmstudioModel,
      ensureLmstudioModelLoaded,
    });

    expect(unloaded).toEqual(["inst-small-a", "inst-small-b"]);
    expect(ensureLmstudioModelLoaded).toHaveBeenCalledWith(
      expect.objectContaining({
        modelKey: "qwen/qwen3-14b",
        requestedContextLength: 32_768,
      }),
    );

    const mismatchRow = getDb()
      .prepare(
        `SELECT data_json
         FROM steward_events
         WHERE kind = 'lmstudio.lifecycle.context_mismatch_detected'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get() as { data_json: string };
    expect(mismatchRow.data_json).toContain("\"targetModelKey\":\"qwen/qwen3-14b\"");
    expect(mismatchRow.data_json).toContain("\"action\":\"unload_then_load\"");
  });

  it("records load failure and still releases the lifecycle lock", async () => {
    initStewardDb(":memory:");

    await expect(
      ensureStewardLmstudioLifecycle({
        selection: {
          provider: "lmstudio",
          modelId: "qwen/qwen3-14b",
          role: "primary_local",
        },
        sessionKey: "agent:main:webchat:direct:user-1",
        getLoadedLmstudioModels: vi.fn(async () => []),
        ensureLmstudioModelLoaded: vi.fn(async () => {
          throw new Error("out of memory");
        }),
      }),
    ).rejects.toThrow("out of memory");

    const kinds = (
      getDb()
        .prepare(`SELECT kind FROM steward_events ORDER BY id ASC`)
        .all() as Array<{ kind: string }>
    ).map((row) => row.kind);
    expect(kinds).toEqual([
      "lmstudio.lifecycle.lock_wait_started",
      "lmstudio.lifecycle.lock_acquired",
      "lmstudio.lifecycle.load_started",
      "lmstudio.lifecycle.load_failed",
      "lmstudio.lifecycle.lock_released",
    ]);
  });

  it("emits query lock events around local inference admission", async () => {
    initStewardDb(":memory:");
    const task = vi.fn(async () => "ok");

    await expect(
      withStewardLmstudioQueryLock({
        selection: {
          provider: "lmstudio",
          modelId: "qwen/qwen3-14b",
          role: "primary_local",
        },
        sessionKey: "agent:main:webchat:direct:user-1",
        task,
      }),
    ).resolves.toBe("ok");

    const kinds = (
      getDb()
        .prepare(
          `SELECT kind
           FROM steward_events
           WHERE kind LIKE 'lmstudio.lifecycle.query_lock_%'
           ORDER BY id ASC`,
        )
        .all() as Array<{ kind: string }>
    ).map((row) => row.kind);
    expect(task).toHaveBeenCalledTimes(1);
    expect(kinds).toEqual([
      "lmstudio.lifecycle.query_lock_wait_started",
      "lmstudio.lifecycle.query_lock_acquired",
      "lmstudio.lifecycle.query_lock_released",
    ]);
  });

  it("bypasses remote models without invoking lifecycle helpers or query events", async () => {
    initStewardDb(":memory:");
    const getLoadedLmstudioModels = vi.fn(async () => []);
    const ensureLmstudioModelLoaded = vi.fn(async () => {});
    const unloadLmstudioModel = vi.fn(async () => {});

    const lifecycle = await ensureStewardLmstudioLifecycle({
      selection: {
        provider: "anthropic",
        modelId: "claude-sonnet-4-6",
        role: "primary_local",
      },
      sessionKey: "agent:main:webchat:direct:user-1",
      getLoadedLmstudioModels,
      ensureLmstudioModelLoaded,
      unloadLmstudioModel,
    });

    expect(lifecycle.bypassed).toBe(true);
    expect(getLoadedLmstudioModels).not.toHaveBeenCalled();
    expect(ensureLmstudioModelLoaded).not.toHaveBeenCalled();
    expect(unloadLmstudioModel).not.toHaveBeenCalled();

    await withStewardLmstudioQueryLock({
      selection: {
        provider: "anthropic",
        modelId: "claude-sonnet-4-6",
      },
      sessionKey: "agent:main:webchat:direct:user-1",
      task: async () => "remote-ok",
    });

    const queryLockCount = getDb()
      .prepare(`SELECT COUNT(*) AS count FROM steward_events WHERE kind LIKE 'lmstudio.lifecycle.query_lock_%'`)
      .get() as { count: number };
    expect(queryLockCount.count).toBe(0);
    const lifecycleCount = getDb()
      .prepare(`SELECT COUNT(*) AS count FROM steward_events WHERE kind LIKE 'lmstudio.lifecycle.%'`)
      .get() as { count: number };
    expect(lifecycleCount.count).toBe(0);
  });
});
