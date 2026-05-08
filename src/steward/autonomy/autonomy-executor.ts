import crypto from "node:crypto";
import fs from "node:fs/promises";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { resolveSessionTranscriptFile } from "../../config/sessions/transcript.js";
import { loadSessionStore, updateSessionStore } from "../../config/sessions/store.js";
import { mergeSessionEntry, type SessionEntry } from "../../config/sessions/types.js";
import { resolveAgentModelPrimaryValue } from "../../config/model-input.js";
import { resolveAgentDir, resolveAgentExplicitModelPrimary } from "../../agents/agent-scope.js";
import { resolveDefaultModelForAgent } from "../../agents/model-selection.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../../agents/defaults.js";
import { discoverAuthStorage, discoverModels } from "../../agents/pi-model-discovery.js";
import { runEmbeddedPiAgent, type EmbeddedPiRunResult } from "../../agents/pi-embedded.js";
import { resolveAgentTimeoutMs } from "../../agents/timeout.js";
import { updateSessionStoreAfterAgentRun } from "../../agents/command/session-store.js";
import { resolveAgentWorkspaceDir, resolveSessionAgentIds } from "../../agents/agent-scope.js";
import { fetchLmstudioModels as defaultFetchLmstudioModels } from "../../../extensions/lmstudio/src/models.fetch.js";
import {
  LMSTUDIO_DEFAULT_EMBEDDING_MODEL,
  LMSTUDIO_PROVIDER_ID,
} from "../../../extensions/lmstudio/src/defaults.js";
import { resolveLmstudioRequestContext as defaultResolveLmstudioRequestContext } from "../../../extensions/lmstudio/src/runtime.js";
import { getDb, initStewardDb } from "../db/db-bootstrap.js";
import { withImmediateTransaction } from "../db/tx.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getRuntimeState } from "../runtime/runtime-state.js";
import { markRuntimeIdle } from "../runtime/runtime-state-repo.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { recordStewardTurnStart, recordTurnComplete } from "../runtime/runtime-bridge.js";
import { loadTriageArtifact } from "./triage-artifacts.js";
import {
  appendAutonomyProgressDecisionEvent,
  evaluateAutonomyAssistantOutputDecision,
  evaluateAutonomyToolProgressDecision,
} from "./progress-discipline.js";

type ClaimedAutonomyTask = {
  hostTaskId: number;
  sessionId: string;
  seedFlowId: number;
  flowId: number;
  taskId: number;
  workClass: string;
  title: string;
  details: string;
  triageArtifactPath: string | null;
  triageKnowledgeId: number | null;
};

export type AutonomyExecuteOutcome =
  | {
      status: "none_pending";
    }
  | {
      status: "blocked";
      reason: "runtime_active";
    }
  | {
      status: "claimed";
      hostTaskId: number;
      outcome: "completed" | "failed";
    };

type AutonomyModelResolverDeps = {
  fetchLmstudioModels?: typeof defaultFetchLmstudioModels;
  resolveLmstudioRequestContext?: typeof defaultResolveLmstudioRequestContext;
};

export type { AutonomyModelResolverDeps };

type ProviderConfigMap = NonNullable<NonNullable<OpenClawConfig["models"]>["providers"]>;

const AUTONOMY_RUN_TIMEOUT_SECONDS = 45 * 60;
const AUTONOMY_LLM_IDLE_TIMEOUT_SECONDS = 20 * 60;
const AUTONOMY_WATCHDOG_GRACE_MS = 5_000;

type AutonomyTimingOverrides = {
  runTimeoutSeconds?: number;
  llmIdleTimeoutSeconds?: number;
  watchdogGraceMs?: number;
};

function resolveAutonomyTiming(overrides?: AutonomyTimingOverrides): {
  runTimeoutSeconds: number;
  llmIdleTimeoutSeconds: number;
  watchdogGraceMs: number;
} {
  return {
    runTimeoutSeconds: overrides?.runTimeoutSeconds ?? AUTONOMY_RUN_TIMEOUT_SECONDS,
    llmIdleTimeoutSeconds: overrides?.llmIdleTimeoutSeconds ?? AUTONOMY_LLM_IDLE_TIMEOUT_SECONDS,
    watchdogGraceMs: overrides?.watchdogGraceMs ?? AUTONOMY_WATCHDOG_GRACE_MS,
  };
}

const LMSTUDIO_AUTONOMY_MODEL_PREFERENCE = [
  "qwen/qwen3-14b",
  "qwen/qwen2.5-coder-14b",
  "deepseek-r1-distill-qwen-14b",
] as const;

function normalizeLmstudioModelId(modelId: string | null | undefined): string {
  const trimmed = (modelId ?? "").trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.toLowerCase().startsWith("lmstudio/")
    ? trimmed.slice("lmstudio/".length).trim()
    : trimmed;
}

function looksLikeEmbeddingModel(modelId: string | null | undefined): boolean {
  const normalized = normalizeLmstudioModelId(modelId).toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized === LMSTUDIO_DEFAULT_EMBEDDING_MODEL.toLowerCase() ||
    normalized.includes("embedding") ||
    normalized.includes("embed")
  );
}

function scoreLmstudioAutonomyModel(modelId: string | null | undefined): number {
  const normalized = normalizeLmstudioModelId(modelId).toLowerCase();
  if (!normalized || looksLikeEmbeddingModel(normalized)) {
    return Number.POSITIVE_INFINITY;
  }
  const preferredIndex = LMSTUDIO_AUTONOMY_MODEL_PREFERENCE.findIndex(
    (candidate) => candidate.toLowerCase() === normalized,
  );
  if (preferredIndex >= 0) {
    return preferredIndex;
  }
  if (normalized.includes("qwen3-14b")) {
    return 10;
  }
  if (normalized.includes("qwen2.5-coder-14b")) {
    return 11;
  }
  if (normalized.includes("deepseek") && normalized.includes("14b")) {
    return 12;
  }
  if (normalized.includes("14b")) {
    return 20;
  }
  return 100;
}

function pickBestLmstudioAutonomyModel(modelIds: Array<string | null | undefined>): string | null {
  let bestModel: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const modelId of modelIds) {
    const normalized = normalizeLmstudioModelId(modelId);
    const score = scoreLmstudioAutonomyModel(normalized);
    if (!normalized || !Number.isFinite(score)) {
      continue;
    }
    if (score < bestScore) {
      bestModel = normalized;
      bestScore = score;
    }
  }
  if (bestModel) {
    return bestModel;
  }
  for (const modelId of modelIds) {
    const normalized = normalizeLmstudioModelId(modelId);
    if (normalized && !looksLikeEmbeddingModel(normalized)) {
      return normalized;
    }
  }
  return null;
}

function pickConfiguredLmstudioAutonomyModel(cfg: OpenClawConfig): string | null {
  const configuredModels = cfg.models?.providers?.[LMSTUDIO_PROVIDER_ID]?.models;
  if (!Array.isArray(configuredModels) || configuredModels.length === 0) {
    return null;
  }
  return pickBestLmstudioAutonomyModel(configuredModels.map((model) => model?.id));
}

async function pickDiscoveredLmstudioAutonomyModel(
  cfg: OpenClawConfig,
  deps: AutonomyModelResolverDeps,
): Promise<string | null> {
  const fetchLmstudioModels = deps.fetchLmstudioModels ?? defaultFetchLmstudioModels;
  const resolveLmstudioRequestContext =
    deps.resolveLmstudioRequestContext ?? defaultResolveLmstudioRequestContext;
  try {
    const providerConfig = cfg.models?.providers?.[LMSTUDIO_PROVIDER_ID];
    const requestContext = await resolveLmstudioRequestContext({
      config: cfg,
    });
    const discovered = await fetchLmstudioModels({
      baseUrl: providerConfig?.baseUrl,
      apiKey: requestContext.apiKey,
      headers: requestContext.headers,
    });
    if (!discovered.reachable || (discovered.status !== undefined && discovered.status >= 400)) {
      return null;
    }
    const loadedInference = discovered.models
      .filter(
        (model) =>
          model.type === "llm" &&
          Array.isArray(model.loaded_instances) &&
          model.loaded_instances.length > 0,
      )
      .map((model) => model.key);
    const preferredLoadedInference = pickBestLmstudioAutonomyModel(loadedInference);
    if (preferredLoadedInference) {
      return preferredLoadedInference;
    }
    return pickBestLmstudioAutonomyModel(
      discovered.models.filter((model) => model.type === "llm").map((model) => model.key),
    );
  } catch {
    return null;
  }
}

function pickAgentRegistryLmstudioAutonomyModel(params: {
  cfg: OpenClawConfig;
  agentId: string;
}): string | null {
  try {
    const agentDir = resolveAgentDir(params.cfg, params.agentId);
    const authStorage = discoverAuthStorage(agentDir);
    const registry = discoverModels(authStorage, agentDir);
    const availableModels = registry.getAvailable() as Array<{
      provider?: string | null;
      id?: string | null;
    }>;
    return pickBestLmstudioAutonomyModel(
      availableModels
        .filter((model) => (model.provider ?? "").trim().toLowerCase() === LMSTUDIO_PROVIDER_ID)
        .map((model) => model.id),
    );
  } catch {
    return null;
  }
  return null;
}

export async function resolveAutonomyModelRef(
  params: {
    cfg: OpenClawConfig;
    agentId: string;
  } & AutonomyModelResolverDeps,
): Promise<{ provider: string; model: string }> {
  const agentExplicitModel = resolveAgentExplicitModelPrimary(params.cfg, params.agentId);
  if (agentExplicitModel?.trim()) {
    return resolveDefaultModelForAgent({
      cfg: params.cfg,
      agentId: params.agentId,
    });
  }

  const configuredDefaultModel = resolveAgentModelPrimaryValue(params.cfg.agents?.defaults?.model);
  const configuredDefaultIsGenericPaidDefault =
    configuredDefaultModel?.trim() === `${DEFAULT_PROVIDER}/${DEFAULT_MODEL}`;

  if (configuredDefaultModel?.trim() && !configuredDefaultIsGenericPaidDefault) {
    return resolveDefaultModelForAgent({
      cfg: params.cfg,
      agentId: params.agentId,
    });
  }

  const configuredLmstudioModel = pickConfiguredLmstudioAutonomyModel(params.cfg);
  if (configuredLmstudioModel) {
    return {
      provider: LMSTUDIO_PROVIDER_ID,
      model: configuredLmstudioModel,
    };
  }

  const discoveredLmstudioModel = await pickDiscoveredLmstudioAutonomyModel(params.cfg, params);
  if (discoveredLmstudioModel) {
    return {
      provider: LMSTUDIO_PROVIDER_ID,
      model: discoveredLmstudioModel,
    };
  }

  const registryLmstudioModel = pickAgentRegistryLmstudioAutonomyModel({
    cfg: params.cfg,
    agentId: params.agentId,
  });
  if (registryLmstudioModel) {
    return {
      provider: LMSTUDIO_PROVIDER_ID,
      model: registryLmstudioModel,
    };
  }

  return resolveDefaultModelForAgent({
    cfg: params.cfg,
    agentId: params.agentId,
  });
}

async function readAgentProviderConfigFromModelsJson(params: {
  agentDir: string;
  provider: string;
}): Promise<ProviderConfigMap[string] | null> {
  try {
    const raw = await fs.readFile(`${params.agentDir}\\models.json`, "utf8");
    const parsed = JSON.parse(raw) as {
      providers?: Record<string, ProviderConfigMap[string] | undefined>;
    };
    const providerConfig = parsed.providers?.[params.provider];
    return providerConfig && typeof providerConfig === "object" ? providerConfig : null;
  } catch {
    return null;
  }
}

export async function hydrateAutonomyExecutionConfigForSelectedProvider(params: {
  cfg: OpenClawConfig;
  agentDir: string;
  provider: string;
  timingOverrides?: AutonomyTimingOverrides;
}): Promise<OpenClawConfig> {
  const providerId = params.provider.trim().toLowerCase();
  if (!providerId) {
    return params.cfg;
  }

  const existingProviderConfig = params.cfg.models?.providers?.[providerId];
  const agentProviderConfig = await readAgentProviderConfigFromModelsJson({
    agentDir: params.agentDir,
    provider: providerId,
  });
  const cfgWithProvider =
    !agentProviderConfig || existingProviderConfig
      ? params.cfg
      : {
          ...params.cfg,
          models: {
            ...(params.cfg.models ?? {}),
            providers: {
              ...(params.cfg.models?.providers ?? {}),
              [providerId]: agentProviderConfig,
            },
          },
        };

  const timing = resolveAutonomyTiming(params.timingOverrides);
  return {
    ...cfgWithProvider,
    agents: {
      ...(cfgWithProvider.agents ?? {}),
      defaults: {
        ...(cfgWithProvider.agents?.defaults ?? {}),
        timeoutSeconds: timing.runTimeoutSeconds,
        llm: {
          ...(cfgWithProvider.agents?.defaults?.llm ?? {}),
          idleTimeoutSeconds: timing.llmIdleTimeoutSeconds,
        },
      },
    },
  };
}

function resolveAutonomyTerminalOutcome(params: {
  flowId: number;
  taskId: number;
}): "completed" | "failed" {
  const row = getDb()
    .prepare(
      `SELECT link_status
       FROM steward_flow_tasks
       WHERE flow_id = ? AND task_id = ?
       LIMIT 1`,
    )
    .get(params.flowId, params.taskId) as { link_status: string | null } | undefined;
  return row?.link_status === "succeeded" ? "completed" : "failed";
}

type AutonomyExecutionTelemetryState = {
  streamStarted: boolean;
  streamFirstEvent: boolean;
  hardFailCount: number;
  terminatedByPolicy: boolean;
};

function appendAutonomyStreamEvent(params: {
  kind: "runtime.stream_started" | "runtime.stream_first_event" | "runtime.stream_terminal";
  sessionId: string;
  flowId: number;
  sessionKey: string;
  hostTaskId: number;
  taskId: number;
  data?: Record<string, unknown>;
  now?: number;
}): void {
  appendStewardEvent({
    kind: params.kind,
    message: params.kind,
    sessionId: params.sessionId,
    flowId: params.flowId,
    now: params.now,
    data: {
      sessionKey: params.sessionKey,
      hostTaskId: params.hostTaskId,
      taskId: params.taskId,
      triggerSource: "autonomy",
      autonomySource: true,
      ...(params.data ?? {}),
    },
  });
}

function createAutonomyAgentEventObserver(params: {
  hostTask: ClaimedAutonomyTask;
  sessionKey: string;
  telemetry: AutonomyExecutionTelemetryState;
  abortController: AbortController;
}): NonNullable<Parameters<typeof runEmbeddedPiAgent>[0]["onAgentEvent"]> {
  return (evt) => {
    if (!params.telemetry.streamFirstEvent) {
      params.telemetry.streamFirstEvent = true;
      appendAutonomyStreamEvent({
        kind: "runtime.stream_first_event",
        sessionId: params.hostTask.sessionId,
        flowId: params.hostTask.flowId,
        sessionKey: params.sessionKey,
        hostTaskId: params.hostTask.hostTaskId,
        taskId: params.hostTask.taskId,
        data: {
          stream: evt.stream,
          ...(evt.data ? { event: evt.data } : {}),
        },
      });
    }

    if (params.telemetry.terminatedByPolicy) {
      return;
    }
    if (evt.stream === "tool") {
      const data =
        evt.data && typeof evt.data === "object" && !Array.isArray(evt.data)
          ? (evt.data as Record<string, unknown>)
          : null;
      if (data?.phase !== "result" || !data.name) {
        return;
      }
      const decision = evaluateAutonomyToolProgressDecision({
        sessionKey: params.sessionKey,
        toolName: String(data.name),
        toolCallId: typeof data.toolCallId === "string" ? data.toolCallId : null,
        result: data.result,
        hardFailCount: params.telemetry.hardFailCount,
      });
      if (!decision) {
        return;
      }
      if (decision.hardFailCount != null) {
        params.telemetry.hardFailCount = decision.hardFailCount;
      }
      appendAutonomyProgressDecisionEvent({
        sessionKey: params.sessionKey,
        decision,
      });
      if (decision.action === "terminate_turn") {
        params.telemetry.terminatedByPolicy = true;
        abortAutonomyRun(
          params.abortController,
          new Error(`Steward autonomy progress discipline: ${decision.reason}`),
        );
      }
      return;
    }
    if (evt.stream !== "assistant") {
      return;
    }
    const data =
      evt.data && typeof evt.data === "object" && !Array.isArray(evt.data)
        ? (evt.data as Record<string, unknown>)
        : null;
    const text = typeof data?.text === "string" ? data.text : "";
    const decision = evaluateAutonomyAssistantOutputDecision({
      sessionKey: params.sessionKey,
      text,
    });
    if (!decision) {
      return;
    }
    appendAutonomyProgressDecisionEvent({
      sessionKey: params.sessionKey,
      decision,
    });
    params.telemetry.terminatedByPolicy = true;
    abortAutonomyRun(
      params.abortController,
      new Error(`Steward autonomy progress discipline: ${decision.reason}`),
    );
  };
}

function createAutonomyWatchdogError(timeoutMs: number): Error {
  return new Error(
    `Steward autonomy execution watchdog timeout (${Math.floor(timeoutMs / 1000)}s)`,
  );
}

async function runAutonomyAgentWithWatchdog(params: {
  timeoutMs: number;
  runAgent: typeof runEmbeddedPiAgent;
  runParams: Parameters<typeof runEmbeddedPiAgent>[0];
  abortController: AbortController;
  watchdogGraceMs?: number;
}): Promise<EmbeddedPiRunResult> {
  const watchdogMs = Math.max(params.timeoutMs + (params.watchdogGraceMs ?? AUTONOMY_WATCHDOG_GRACE_MS), 1);
  return await new Promise<EmbeddedPiRunResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = createAutonomyWatchdogError(watchdogMs);
      abortAutonomyRun(params.abortController, error);
      reject(error);
    }, watchdogMs);

    void Promise.resolve(params.runAgent(params.runParams))
      .then((result) => {
        clearTimeout(timer);
        resolve(result as EmbeddedPiRunResult);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function abortAutonomyRun(controller: AbortController, error: Error): void {
  if (!controller.signal.aborted) {
    controller.abort(error);
  }
}

function appendAutonomyTerminalStreamEvent(params: {
  hostTask: ClaimedAutonomyTask;
  sessionKey: string;
  outcome: "completed" | "failed";
  telemetry: AutonomyExecutionTelemetryState;
  error?: unknown;
  now?: number;
}): void {
  appendAutonomyStreamEvent({
    kind: "runtime.stream_terminal",
    sessionId: params.hostTask.sessionId,
    flowId: params.hostTask.flowId,
    sessionKey: params.sessionKey,
    hostTaskId: params.hostTask.hostTaskId,
    taskId: params.hostTask.taskId,
    now: params.now,
    data: {
      outcome: params.outcome,
      sawFirstEvent: params.telemetry.streamFirstEvent,
      error:
        params.error instanceof Error
          ? (params.error.stack ?? params.error.message)
          : params.error
            ? String(params.error)
            : null,
    },
  });
}

function buildAutonomyPrompt(params: {
  hostTask: ClaimedAutonomyTask;
  triageArtifact: Awaited<ReturnType<typeof loadTriageArtifact>>;
}): string {
  return [
    "AUTONOMY EXECUTION HANDOFF",
    `work_class: ${params.hostTask.workClass}`,
    `classification_reason: ${params.triageArtifact.classificationReason}`,
    `goal_phase: ${params.triageArtifact.seedPlan.phase}`,
    `goal_kind: ${params.triageArtifact.seedPlan.goalKind}`,
    `task_title: ${params.hostTask.title}`,
    "",
    "Execute exactly one bounded steward task using the real tool/runtime path.",
    "Keep truth, proof, consequence, and operator safety intact.",
    "Do not invent evidence. Use tools when needed and return grounded output.",
    "",
    "TASK DETAILS",
    params.hostTask.details,
  ].join("\n");
}

function findPendingAutonomyTask(sessionId: string): ClaimedAutonomyTask | null {
  const row = getDb()
    .prepare(
      `SELECT
         ht.id,
         ht.session_id,
         ht.seed_flow_id,
         ht.work_class,
         ht.title,
         ht.details,
         ht.triage_artifact_path,
         ht.triage_knowledge_id,
         ft.flow_id,
         ft.task_id
       FROM steward_host_tasks ht
       JOIN steward_flow_tasks ft
         ON ft.flow_id = ht.seed_flow_id
        AND ft.task_id = ht.id
       JOIN steward_flows f
         ON f.id = ht.seed_flow_id
       WHERE ht.session_id = ?
         AND ht.source = 'autonomy'
         AND ht.status = 'pending'
         AND ht.seed_flow_id IS NOT NULL
       ORDER BY ht.id ASC
       LIMIT 1`,
    )
    .get(sessionId) as
    | {
        id: number;
        session_id: string;
        seed_flow_id: number | null;
        work_class: string;
        title: string;
        details: string;
        triage_artifact_path: string | null;
        triage_knowledge_id: number | null;
        flow_id: number;
        task_id: number;
      }
    | undefined;
  if (!row) {
    return null;
  }
  if (row.seed_flow_id == null || Number(row.seed_flow_id) !== Number(row.flow_id)) {
    return null;
  }
  return {
    hostTaskId: row.id,
    sessionId: row.session_id,
    seedFlowId: Number(row.seed_flow_id),
    flowId: row.flow_id,
    taskId: row.task_id,
    workClass: row.work_class,
    title: row.title,
    details: row.details,
    triageArtifactPath: row.triage_artifact_path,
    triageKnowledgeId: row.triage_knowledge_id,
  };
}

export function claimNextAutonomyTask(params: {
  sessionId: string;
  now?: number;
}): ClaimedAutonomyTask | null {
  const now = params.now ?? Date.now();
  return withImmediateTransaction(getDb(), () => {
    const pending = findPendingAutonomyTask(params.sessionId);
    if (!pending) {
      return null;
    }
    const claimed = getDb()
      .prepare(
        `UPDATE steward_host_tasks
         SET status = 'running',
             claimed_at = ?,
             updated_ts = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(now, now, pending.hostTaskId);
    if (Number(claimed.changes ?? 0) !== 1) {
      return null;
    }
    getDb()
      .prepare(
        `UPDATE steward_flow_tasks
         SET link_status = 'running',
             updated_ts = ?
         WHERE flow_id = ? AND task_id = ?`,
      )
      .run(now, pending.flowId, pending.taskId);
    getDb()
      .prepare(
        `UPDATE steward_flows
         SET status = 'running',
             owner_pid = ?,
             updated_ts = ?,
             heartbeat_ts = ?
         WHERE id = ?`,
      )
      .run(process.pid, now, now, pending.flowId);
    return pending;
  });
}

async function ensureAutonomySessionContext(params: {
  cfg: OpenClawConfig;
  storePath: string;
  sessionKey: string;
}): Promise<{
  sessionAgentId: string;
  sessionId: string;
  sessionFile: string;
}> {
  const { sessionAgentId } = resolveSessionAgentIds({
    sessionKey: params.sessionKey,
    config: params.cfg,
  });
  const entry = await updateSessionStore(params.storePath, (store) => {
    const next = mergeSessionEntry(store[params.sessionKey], {});
    store[params.sessionKey] = next;
    return next;
  });
  const sessionStore = loadSessionStore(params.storePath, { skipCache: true });
  const resolved = await resolveSessionTranscriptFile({
    sessionId: entry.sessionId,
    sessionKey: params.sessionKey,
    sessionEntry: sessionStore[params.sessionKey] ?? (entry as SessionEntry),
    sessionStore,
    storePath: params.storePath,
    agentId: sessionAgentId,
  });
  return {
    sessionAgentId,
    sessionId: entry.sessionId,
    sessionFile: resolved.sessionFile,
  };
}

export async function materializeAutonomyTurnParams(params: {
  cfg: OpenClawConfig;
  storePath: string;
  sessionKey: string;
  hostTask: ClaimedAutonomyTask;
  modelResolverDeps?: AutonomyModelResolverDeps;
  abortSignal?: AbortSignal;
  onAgentEvent?: Parameters<typeof runEmbeddedPiAgent>[0]["onAgentEvent"];
  timingOverrides?: AutonomyTimingOverrides;
}): Promise<Parameters<typeof runEmbeddedPiAgent>[0]> {
  if (!params.hostTask.triageArtifactPath) {
    throw new Error(`missing triage artifact path for host task ${params.hostTask.hostTaskId}`);
  }
  const triageArtifact = await loadTriageArtifact(params.hostTask.triageArtifactPath);
  const sessionContext = await ensureAutonomySessionContext({
    cfg: params.cfg,
    storePath: params.storePath,
    sessionKey: params.sessionKey,
  });
  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, sessionContext.sessionAgentId);
  const agentDir = resolveAgentDir(params.cfg, sessionContext.sessionAgentId);
  const modelRef = await resolveAutonomyModelRef({
    cfg: params.cfg,
    agentId: sessionContext.sessionAgentId,
    ...params.modelResolverDeps,
  });
  const executionConfig = await hydrateAutonomyExecutionConfigForSelectedProvider({
    cfg: params.cfg,
    agentDir,
    provider: modelRef.provider,
    timingOverrides: params.timingOverrides,
  });

  return {
    sessionId: sessionContext.sessionId,
    sessionKey: params.sessionKey,
    agentId: sessionContext.sessionAgentId,
    trigger: "autonomy",
    sessionFile: sessionContext.sessionFile,
    workspaceDir,
    agentDir,
    config: executionConfig,
    prompt: buildAutonomyPrompt({
      hostTask: params.hostTask,
      triageArtifact,
    }),
    provider: modelRef.provider,
    model: modelRef.model,
    timeoutMs: resolveAgentTimeoutMs({ cfg: executionConfig }),
    runId: `steward-autonomy-${crypto.randomUUID()}`,
    abortSignal: params.abortSignal,
    onAgentEvent: params.onAgentEvent,
  };
}

export function terminalizeAutonomyTask(params: {
  hostTask: ClaimedAutonomyTask;
  sessionKey: string;
  outcome: "completed" | "failed";
  error?: unknown;
  now?: number;
}): void {
  const now = params.now ?? Date.now();
  const status = params.outcome === "completed" ? "done" : "failed";
  const errorText =
    params.error instanceof Error
      ? params.error.stack ?? params.error.message
      : params.error
        ? String(params.error)
        : "";
  getDb()
    .prepare(
      `UPDATE steward_host_tasks
       SET status = ?,
           completed_at = CASE WHEN ? = 'done' THEN ? ELSE completed_at END,
           failed_at = CASE WHEN ? = 'failed' THEN ? ELSE failed_at END,
           error_json = ?,
           updated_ts = ?
       WHERE id = ?`,
    )
    .run(
      status,
      status,
      now,
      status,
      now,
      errorText ? JSON.stringify({ error: errorText }) : "",
      now,
      params.hostTask.hostTaskId,
    );
  appendStewardEvent({
    kind:
      params.outcome === "completed"
        ? "autonomy.execution.completed"
        : "autonomy.execution.failed",
    message:
      params.outcome === "completed"
        ? "autonomy execution completed"
        : "autonomy execution failed",
    sessionId: params.hostTask.sessionId,
    flowId: params.hostTask.flowId,
    now,
    data: {
      sessionKey: params.sessionKey,
      hostTaskId: params.hostTask.hostTaskId,
      triggerSource: "autonomy",
      autonomySource: true,
      outcome: params.outcome,
      error: errorText || null,
    },
  });
}

export async function runAutonomyExecuteCycle(params: {
  cfg: OpenClawConfig;
  storePath: string;
  sessionKey: string;
  now?: number;
  runAgent?: typeof runEmbeddedPiAgent;
  timingOverrides?: AutonomyTimingOverrides;
  modelResolverDeps?: AutonomyModelResolverDeps;
}): Promise<AutonomyExecuteOutcome> {
  const now = params.now ?? Date.now();
  initStewardDb(params.storePath);
  const authority = getOrCreateStewardSession(params.sessionKey, now);
  const pendingRuntime = getRuntimeState(authority.sessionId);
  if (pendingRuntime?.status === "running") {
    return {
      status: "blocked",
      reason: "runtime_active",
    };
  }
  const hostTask = claimNextAutonomyTask({
    sessionId: authority.sessionId,
    now,
  });
  if (!hostTask) {
    return {
      status: "none_pending",
    };
  }

  const abortController = new AbortController();
  const telemetry: AutonomyExecutionTelemetryState = {
    streamStarted: false,
    streamFirstEvent: false,
    hardFailCount: 0,
    terminatedByPolicy: false,
  };

  try {
    const runParams = await materializeAutonomyTurnParams({
      cfg: params.cfg,
      storePath: params.storePath,
      sessionKey: params.sessionKey,
      hostTask,
      abortSignal: abortController.signal,
      onAgentEvent: createAutonomyAgentEventObserver({
        hostTask,
        sessionKey: params.sessionKey,
        telemetry,
        abortController,
      }),
      timingOverrides: params.timingOverrides,
      modelResolverDeps: params.modelResolverDeps,
    });
    appendStewardEvent({
      kind: "autonomy.execution.requested",
      message: "autonomy execution requested",
      sessionId: hostTask.sessionId,
      flowId: hostTask.flowId,
      now,
      data: {
        sessionKey: params.sessionKey,
        hostTaskId: hostTask.hostTaskId,
        triggerSource: "autonomy",
        provider: runParams.provider ?? null,
        model: runParams.model ?? null,
      },
    });
    await recordStewardTurnStart({
      storePath: params.storePath,
      sessionKey: params.sessionKey,
      flowId: hostTask.flowId,
      taskId: hostTask.taskId,
      triggerSource: "autonomy",
      hostTaskId: hostTask.hostTaskId,
    });
    telemetry.streamStarted = true;
    appendAutonomyStreamEvent({
      kind: "runtime.stream_started",
      sessionId: hostTask.sessionId,
      flowId: hostTask.flowId,
      sessionKey: params.sessionKey,
      hostTaskId: hostTask.hostTaskId,
      taskId: hostTask.taskId,
      data: {
        provider: runParams.provider ?? null,
        model: runParams.model ?? null,
        timeoutMs: runParams.timeoutMs,
        llmIdleTimeoutSeconds:
          runParams.config?.agents?.defaults?.llm?.idleTimeoutSeconds ?? null,
      },
    });

    const runAgent = params.runAgent ?? runEmbeddedPiAgent;
    const result = await runAutonomyAgentWithWatchdog({
      timeoutMs: runParams.timeoutMs,
      runAgent,
      runParams,
      abortController,
      watchdogGraceMs: resolveAutonomyTiming(params.timingOverrides).watchdogGraceMs,
    });
    const sessionStore = loadSessionStore(params.storePath, { skipCache: true });
    await updateSessionStoreAfterAgentRun({
      cfg: params.cfg,
      sessionId: runParams.sessionId,
      sessionKey: params.sessionKey,
      storePath: params.storePath,
      sessionStore,
      defaultProvider: runParams.provider ?? "openai",
      defaultModel: runParams.model ?? "gpt-5",
      stewardContext: {
        triggerSource: "autonomy",
        hostTaskId: hostTask.hostTaskId,
        taskId: hostTask.taskId,
        taskType: "general",
        taskTitle: hostTask.title,
        taskDetails: hostTask.details,
      },
      result,
    });
    appendAutonomyTerminalStreamEvent({
      hostTask,
      sessionKey: params.sessionKey,
      outcome: "completed",
      telemetry,
    });
    const outcome = resolveAutonomyTerminalOutcome({
      flowId: hostTask.flowId,
      taskId: hostTask.taskId,
    });
    terminalizeAutonomyTask({
      hostTask,
      sessionKey: params.sessionKey,
      outcome,
    });
    return {
      status: "claimed",
      hostTaskId: hostTask.hostTaskId,
      outcome,
    };
  } catch (error) {
    const failureTime = Date.now();
    abortAutonomyRun(
      abortController,
      error instanceof Error ? error : new Error(String(error)),
    );
    appendAutonomyTerminalStreamEvent({
      hostTask,
      sessionKey: params.sessionKey,
      outcome: "failed",
      telemetry,
      error,
      now: failureTime,
    });
    await recordTurnComplete({
      storePath: params.storePath,
      sessionKey: params.sessionKey,
      triggerSource: "autonomy",
      hostTaskId: hostTask.hostTaskId,
      result: {
        aborted: true,
        finalAssistantText: "",
        taskId: hostTask.taskId,
        taskTitle: hostTask.title,
        taskType: "general",
        taskDetails: hostTask.details,
      },
    });
    markRuntimeIdle({
      sessionKey: authority.sessionId,
      now: failureTime,
      lastError: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
    terminalizeAutonomyTask({
      hostTask,
      sessionKey: params.sessionKey,
      outcome: "failed",
      error,
      now: failureTime,
    });
    return {
      status: "claimed",
      hostTaskId: hostTask.hostTaskId,
      outcome: "failed",
    };
  }
}
