import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { markRuntimeRunning } from "../runtime/runtime-state-repo.js";
import { seedIdleAutonomyTask } from "./idle-seeding.js";
import {
  claimNextAutonomyTask,
  hydrateAutonomyExecutionConfigForSelectedProvider,
  materializeAutonomyTurnParams,
  resolveAutonomyModelRef,
  runAutonomyExecuteCycle,
} from "./autonomy-executor.js";

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

function createAutonomyTestConfig(): OpenClawConfig {
  return {
    models: {
      providers: {
        lmstudio: {
          baseUrl: "http://localhost:1234/v1",
          api: "openai-completions",
          apiKey: "lmstudio-local",
          models: [
            {
              id: "qwen/qwen3-14b",
              name: "Qwen",
              reasoning: true,
              input: ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 32768,
              maxTokens: 4096,
            },
          ],
        },
      },
    },
  } as OpenClawConfig;
}

function createAutonomyModelResolverDeps() {
  return {
    resolveLmstudioRequestContext: vi.fn().mockResolvedValue({
      apiKey: undefined,
      headers: undefined,
    }),
    fetchLmstudioModels: vi.fn().mockResolvedValue({
      reachable: true,
      status: 200,
      models: [
        {
          type: "llm",
          key: "qwen/qwen3-14b",
          loaded_instances: [{ id: "qwen/qwen3-14b" }],
        },
      ],
    }),
  };
}

function getLatestAutonomyHostTaskRow() {
  return getDb()
    .prepare(
      `SELECT id, seed_flow_id, status, claimed_at, completed_at, failed_at, error_json
       FROM steward_host_tasks
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get() as {
    id: number;
    seed_flow_id: number;
    status: string;
    claimed_at: number | null;
    completed_at: number | null;
    failed_at: number | null;
    error_json: string;
  };
}

describe("WS-L autonomy executor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("prefers a configured LM Studio inference model when autonomy has no explicit model override", async () => {
    const cfg = {
      models: {
        providers: {
          lmstudio: {
            baseUrl: "http://localhost:1234/v1",
            models: [
              { id: "text-embedding-nomic-embed-text-v1.5", name: "Embedding", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 1024 },
              { id: "qwen/qwen3-14b", name: "Qwen", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32768, maxTokens: 4096 },
            ],
          },
        },
      },
    } as OpenClawConfig;

    const modelRef = await resolveAutonomyModelRef({
      cfg,
      agentId: "dev",
    });

    expect(modelRef).toEqual({
      provider: "lmstudio",
      model: "qwen/qwen3-14b",
    });
  });

  it("prefers a discovered loaded LM Studio inference model when no explicit or configured model exists", async () => {
    const modelRef = await resolveAutonomyModelRef({
      cfg: {
        agents: {
          defaults: {
            model: {
              primary: "openai/gpt-5.4",
            },
          },
        },
      } as OpenClawConfig,
      agentId: "dev",
      resolveLmstudioRequestContext: vi.fn().mockResolvedValue({
        apiKey: undefined,
        headers: undefined,
      }),
      fetchLmstudioModels: vi.fn().mockResolvedValue({
        reachable: true,
        status: 200,
        models: [
          {
            type: "embedding",
            key: "text-embedding-nomic-embed-text-v1.5",
            loaded_instances: [{ id: "embed-1" }],
          },
          {
            type: "llm",
            key: "qwen/qwen3-14b",
            loaded_instances: [{ id: "llm-1" }],
          },
          {
            type: "llm",
            key: "phi-4",
            loaded_instances: [],
          },
        ],
      }),
    });

    expect(modelRef).toEqual({
      provider: "lmstudio",
      model: "qwen/qwen3-14b",
    });
  });

  it("respects an explicit configured autonomy model override instead of forcing LM Studio", async () => {
    const cfg = {
      agents: {
        defaults: {
          model: {
            primary: "anthropic/claude-sonnet-4",
          },
        },
      },
    } as OpenClawConfig;

    const modelRef = await resolveAutonomyModelRef({
      cfg,
      agentId: "dev",
      fetchLmstudioModels: vi.fn(),
    });

    expect(modelRef).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4",
    });
  });

  it("hydrates the selected provider config from agent models.json for autonomy execution", async () => {
    const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-agent-"));
    try {
      await fs.writeFile(
        path.join(agentDir, "models.json"),
        JSON.stringify(
          {
            providers: {
              lmstudio: {
                baseUrl: "http://localhost:1234/v1",
                api: "openai-completions",
                apiKey: "lmstudio-local",
                models: [{ id: "qwen/qwen3-14b", name: "Qwen" }],
              },
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const hydrated = await hydrateAutonomyExecutionConfigForSelectedProvider({
        cfg: {} as OpenClawConfig,
        agentDir,
        provider: "lmstudio",
      });

      expect(hydrated.models?.providers?.lmstudio).toMatchObject({
        baseUrl: "http://localhost:1234/v1",
        api: "openai-completions",
        apiKey: "lmstudio-local",
      });
      expect(hydrated.agents?.defaults?.timeoutSeconds).toBe(45 * 60);
      expect(hydrated.agents?.defaults?.llm?.idleTimeoutSeconds).toBe(20 * 60);
    } finally {
      await fs.rm(agentDir, { recursive: true, force: true });
    }
  });

  it("materializes autonomy turn params with explicit steward-owned timeout ownership", async () => {
    await withTempStore(async ({ artifactRoot, storePath }) => {
      const sessionKey = "agent:main:webchat:direct:ws-m-timeouts";
      const authority = await seedOneTask({ sessionKey, artifactRoot });
      const hostTask = claimNextAutonomyTask({
        sessionId: authority.sessionId,
        now: 1_200,
      });
      expect(hostTask).toBeTruthy();

      const runParams = await materializeAutonomyTurnParams({
        cfg: {} as OpenClawConfig,
        storePath,
        sessionKey,
        hostTask: hostTask!,
        modelResolverDeps: createAutonomyModelResolverDeps(),
      });

      expect(runParams.trigger).toBe("autonomy");
      expect(runParams.timeoutMs).toBe(45 * 60 * 1000);
      expect(runParams.config?.agents?.defaults?.timeoutSeconds).toBe(45 * 60);
      expect(runParams.config?.agents?.defaults?.llm?.idleTimeoutSeconds).toBe(20 * 60);
    });
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

  it("binds execution to the seeded autonomy flow even when another flow-task row reuses the same task id", async () => {
    await withTempStore(async ({ artifactRoot, storePath }) => {
      const sessionKey = "agent:main:webchat:direct:ws-n-collision";
      const authority = await seedOneTask({ sessionKey, artifactRoot });
      const seededHostTask = getLatestAutonomyHostTaskRow();
      const db = getDb();
      const collisionFlowResult = db
        .prepare(
          `INSERT INTO steward_flows (
             session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
           ) VALUES (?, 'control', 'running', '{}', ?, ?, ?, ?)`,
        )
        .run(authority.sessionId, process.pid, 1_250, 1_250, 1_250) as {
        lastInsertRowid: number | bigint;
      };
      const collisionFlowId = Number(collisionFlowResult.lastInsertRowid);
      db.prepare(
        `INSERT INTO steward_flow_tasks (
           flow_id, task_id, role, link_status, created_ts, updated_ts
         ) VALUES (?, ?, 'primary', 'running', ?, ?)`,
      ).run(collisionFlowId, seededHostTask.id, 1_250, 1_250);

      const runAgent = vi.fn().mockResolvedValue({
        payloads: [],
        meta: {
          durationMs: 1,
          aborted: false,
          finalAssistantVisibleText: "",
        },
      });

      const result = await runAutonomyExecuteCycle({
        cfg: {} as never,
        sessionKey,
        storePath,
        now: 1_400,
        runAgent: runAgent as never,
        modelResolverDeps: createAutonomyModelResolverDeps(),
      });

      const hostTask = getLatestAutonomyHostTaskRow();
      const seededFlow = db
        .prepare(`SELECT status FROM steward_flows WHERE id = ?`)
        .get(hostTask.seed_flow_id) as { status: string };
      const seededFlowTask = db
        .prepare(`SELECT link_status FROM steward_flow_tasks WHERE flow_id = ? AND task_id = ?`)
        .get(hostTask.seed_flow_id, hostTask.id) as { link_status: string };
      const collisionFlow = db
        .prepare(`SELECT status FROM steward_flows WHERE id = ?`)
        .get(collisionFlowId) as { status: string };
      const collisionFlowTask = db
        .prepare(`SELECT link_status FROM steward_flow_tasks WHERE flow_id = ? AND task_id = ?`)
        .get(collisionFlowId, hostTask.id) as { link_status: string };
      const latestRuntimeEvent = db
        .prepare(
          `SELECT flow_id, kind
           FROM steward_events
           WHERE kind = 'runtime.started'
           ORDER BY id DESC
           LIMIT 1`,
        )
        .get() as { flow_id: number; kind: string };

      expect(result).toMatchObject({
        status: "claimed",
        outcome: "failed",
      });
      expect(seededFlow.status).toBe("completed");
      expect(seededFlowTask.link_status).toBe("failed");
      expect(collisionFlow.status).toBe("running");
      expect(collisionFlowTask.link_status).toBe("running");
      expect(latestRuntimeEvent.flow_id).toBe(hostTask.seed_flow_id);
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
        cfg: createAutonomyTestConfig() as never,
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
      const runAgent = vi.fn().mockImplementation(async (runParams) => {
        runParams.onAgentEvent?.({
          stream: "assistant",
          data: { phase: "delta", text: "streamed" },
        });
        return {
          payloads: [
            {
              text: [
                "evidence_basis=runtime.started recorded history triggerSource autonomy",
                "result=grounded execution evidence recorded",
                "implication=the seeded autonomy task completed with traceable runtime evidence",
                "remaining_uncertainty=needs broader live coverage",
              ].join("\n"),
            },
          ],
          meta: {
            durationMs: 1,
            aborted: false,
            finalAssistantVisibleText: [
              "evidence_basis=runtime.started recorded history triggerSource autonomy",
              "result=grounded execution evidence recorded",
              "implication=the seeded autonomy task completed with traceable runtime evidence",
              "remaining_uncertainty=needs broader live coverage",
            ].join("\n"),
          },
        };
      });

      const result = await runAutonomyExecuteCycle({
        cfg: {} as never,
        sessionKey,
        storePath,
        now: 1_500,
        runAgent: runAgent as never,
        modelResolverDeps: createAutonomyModelResolverDeps(),
      });
      const hostTask = getLatestAutonomyHostTaskRow();
      const flow = getDb()
        .prepare(
          `SELECT status
           FROM steward_flows
           WHERE id = ?`,
        )
        .get(hostTask.seed_flow_id) as { status: string };
      const runtime = getDb()
        .prepare(`SELECT status, trigger_source FROM steward_runtime_state WHERE session_key = ?`)
        .get(authority.sessionId) as { status: string; trigger_source: string | null };
      const completedEvent = getDb()
        .prepare(
          `SELECT ts, data_json
           FROM steward_events
           WHERE kind = 'autonomy.execution.completed'
           ORDER BY id DESC
           LIMIT 1`,
        )
        .get() as { ts: number; data_json: string };
      const idleEvent = getDb()
        .prepare(
          `SELECT ts
           FROM steward_events
           WHERE kind = 'runtime.idle'
           ORDER BY id DESC
           LIMIT 1`,
        )
        .get() as { ts: number };
      const streamEvents = getDb()
        .prepare(
          `SELECT kind, ts
           FROM steward_events
           WHERE kind IN ('runtime.stream_started', 'runtime.stream_first_event', 'runtime.stream_terminal')
           ORDER BY id ASC`,
        )
        .all() as Array<{ kind: string; ts: number }>;

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
      expect(streamEvents.map((event) => event.kind)).toEqual([
        "runtime.stream_started",
        "runtime.stream_first_event",
        "runtime.stream_terminal",
      ]);
      expect(hostTask.completed_at).toBeGreaterThanOrEqual(idleEvent.ts);
      expect(completedEvent.ts).toBeGreaterThanOrEqual(idleEvent.ts);
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
        modelResolverDeps: createAutonomyModelResolverDeps(),
      });
      const hostTask = getLatestAutonomyHostTaskRow();
      const flow = getDb()
        .prepare(
          `SELECT status
           FROM steward_flows
           WHERE id = ?`,
        )
        .get(hostTask.seed_flow_id) as { status: string };
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

  it("marks the host task failed when the turn returns but steward proof/value terminalizes it failed", async () => {
    await withTempStore(async ({ artifactRoot, storePath }) => {
      const sessionKey = "agent:main:webchat:direct:ws-l-terminal-fail";
      await seedOneTask({ sessionKey, artifactRoot });
      const runAgent = vi.fn().mockResolvedValue({
        payloads: [],
        meta: {
          durationMs: 1,
          aborted: false,
          finalAssistantVisibleText: "",
        },
      });

      const result = await runAutonomyExecuteCycle({
        cfg: {} as never,
        sessionKey,
        storePath,
        now: 1_700,
        runAgent: runAgent as never,
        modelResolverDeps: createAutonomyModelResolverDeps(),
      });

      const hostTask = getLatestAutonomyHostTaskRow();
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
      expect(hostTask.completed_at).toBeNull();
      expect(failedEvent.data_json).toContain("\"outcome\":\"failed\"");
    });
  });

  it("bounds a stalled autonomy run with steward-owned timeout recovery", async () => {
    await withTempStore(async ({ artifactRoot, storePath }) => {
      const sessionKey = "agent:main:webchat:direct:ws-m-timeout";
      const authority = await seedOneTask({ sessionKey, artifactRoot });
      const runAgent = vi.fn().mockImplementation(
        (runParams: {
          abortSignal?: AbortSignal;
          onAgentEvent?: (evt: { stream: string; data: Record<string, unknown> }) => void;
        }) =>
          new Promise((_, reject) => {
            runParams.onAgentEvent?.({
              stream: "lifecycle",
              data: { phase: "start" },
            });
            runParams.abortSignal?.addEventListener(
              "abort",
              () => {
                reject(runParams.abortSignal?.reason ?? new Error("aborted"));
              },
              { once: true },
            );
          }),
      );

      const result = await runAutonomyExecuteCycle({
        cfg: {} as never,
        sessionKey,
        storePath,
        now: 2_000,
        runAgent: runAgent as never,
        timingOverrides: {
          runTimeoutSeconds: 1,
          llmIdleTimeoutSeconds: 1,
          watchdogGraceMs: 0,
        },
        modelResolverDeps: createAutonomyModelResolverDeps(),
      });

      const hostTask = getLatestAutonomyHostTaskRow();
      const runtime = getDb()
        .prepare(`SELECT status, last_error FROM steward_runtime_state WHERE session_key = ?`)
        .get(authority.sessionId) as { status: string; last_error: string };
      const flowTask = getDb()
        .prepare(`SELECT link_status FROM steward_flow_tasks WHERE flow_id = ? AND task_id = ?`)
        .get(hostTask.seed_flow_id, hostTask.id) as { link_status: string };
      const terminalEvent = getDb()
        .prepare(
          `SELECT data_json
           FROM steward_events
           WHERE kind = 'runtime.stream_terminal'
           ORDER BY id DESC
           LIMIT 1`,
        )
        .get() as { data_json: string };

      expect(result).toMatchObject({
        status: "claimed",
        outcome: "failed",
      });
      expect(runAgent).toHaveBeenCalledOnce();
      expect(hostTask.status).toBe("failed");
      expect(hostTask.failed_at).toBeTruthy();
      expect(hostTask.completed_at).toBeNull();
      expect(hostTask.error_json).toContain("watchdog timeout");
      expect(runtime.status).toBe("idle");
      expect(runtime.last_error).toContain("watchdog timeout");
      expect(flowTask.link_status).toBe("failed");
      expect(terminalEvent.data_json).toContain("\"outcome\":\"failed\"");
      expect(terminalEvent.data_json).toContain("watchdog timeout");
    });
  });

  it("terminates a maintenance autonomy turn immediately after a hard-fail tool result", async () => {
    await withTempStore(async ({ artifactRoot, storePath }) => {
      const sessionKey = "agent:main:webchat:direct:ws-pd-hard-fail";
      const authority = getOrCreateStewardSession(sessionKey, 2_100);
      const seeded = await seedIdleAutonomyTask({
        sessionId: authority.sessionId,
        sessionKey,
        workClass: "maintenance_work",
        classificationReason: "baseline_maintenance_window",
        artifactRoot,
        now: 2_150,
      });
      expect(seeded.seeded).toBe(true);

      const runAgent = vi.fn().mockImplementation(
        (runParams: {
          abortSignal?: AbortSignal;
          onAgentEvent?: (evt: { stream: string; data: Record<string, unknown> }) => void;
        }) =>
          new Promise((resolve, reject) => {
            runParams.abortSignal?.addEventListener(
              "abort",
              () => reject(runParams.abortSignal?.reason ?? new Error("aborted")),
              { once: true },
            );
            runParams.onAgentEvent?.({
              stream: "tool",
              data: {
                phase: "result",
                name: "web_fetch",
                toolCallId: "call-hard-fail",
                result: {
                  details: {
                    stewardPostcheck: {
                      verdict: "hard_fail",
                      reason: "wrapped external-content / unusable 400",
                    },
                  },
                },
              },
            });
            setTimeout(() => resolve({ payloads: [], meta: { durationMs: 1, aborted: false } }), 25);
          }),
      );

      const result = await runAutonomyExecuteCycle({
        cfg: {} as never,
        sessionKey,
        storePath,
        now: 2_200,
        runAgent: runAgent as never,
        modelResolverDeps: createAutonomyModelResolverDeps(),
      });
      const policyEvent = getDb()
        .prepare(
          `SELECT data_json
           FROM steward_events
           WHERE kind = 'autonomy.progress.policy'
           ORDER BY id DESC
           LIMIT 1`,
        )
        .get() as { data_json: string };

      expect(result).toMatchObject({
        status: "claimed",
        outcome: "failed",
      });
      expect(policyEvent.data_json).toContain("\"scope\":\"tool_postcheck\"");
      expect(policyEvent.data_json).toContain("\"reason\":\"hard_fail_not_allowed_for_bounded_work\"");
    });
  });

  it("terminates maintenance autonomy when the assistant asks for permission", async () => {
    await withTempStore(async ({ artifactRoot, storePath }) => {
      const sessionKey = "agent:main:webchat:direct:ws-pd-permission";
      const authority = getOrCreateStewardSession(sessionKey, 2_300);
      const seeded = await seedIdleAutonomyTask({
        sessionId: authority.sessionId,
        sessionKey,
        workClass: "maintenance_work",
        classificationReason: "baseline_maintenance_window",
        artifactRoot,
        now: 2_350,
      });
      expect(seeded.seeded).toBe(true);

      const runAgent = vi.fn().mockImplementation(
        (runParams: {
          abortSignal?: AbortSignal;
          onAgentEvent?: (evt: { stream: string; data: Record<string, unknown> }) => void;
        }) =>
          new Promise((_, reject) => {
            runParams.abortSignal?.addEventListener(
              "abort",
              () => reject(runParams.abortSignal?.reason ?? new Error("aborted")),
              { once: true },
            );
            runParams.onAgentEvent?.({
              stream: "assistant",
              data: {
                text: "Please reply with 1 to approve the healthcheck before I continue.",
              },
            });
          }),
      );

      const result = await runAutonomyExecuteCycle({
        cfg: {} as never,
        sessionKey,
        storePath,
        now: 2_400,
        runAgent: runAgent as never,
        modelResolverDeps: createAutonomyModelResolverDeps(),
      });
      const policyEvent = getDb()
        .prepare(
          `SELECT data_json
           FROM steward_events
           WHERE kind = 'autonomy.progress.policy'
           ORDER BY id DESC
           LIMIT 1`,
        )
        .get() as { data_json: string };

      expect(result).toMatchObject({
        status: "claimed",
        outcome: "failed",
      });
      expect(policyEvent.data_json).toContain("\"scope\":\"assistant_output\"");
      expect(policyEvent.data_json).toContain("\"reason\":\"permission_seeking_not_allowed_for_autonomy_work_class\"");
    });
  });
});
