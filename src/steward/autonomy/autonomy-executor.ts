import crypto from "node:crypto";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { resolveSessionTranscriptFile } from "../../config/sessions/transcript.js";
import { loadSessionStore, updateSessionStore } from "../../config/sessions/store.js";
import { mergeSessionEntry, type SessionEntry } from "../../config/sessions/types.js";
import { resolveDefaultModelForAgent } from "../../agents/model-selection.js";
import { runEmbeddedPiAgent, type EmbeddedPiRunResult } from "../../agents/pi-embedded.js";
import { resolveAgentTimeoutMs } from "../../agents/timeout.js";
import { updateSessionStoreAfterAgentRun } from "../../agents/command/session-store.js";
import { resolveAgentWorkspaceDir, resolveSessionAgentIds } from "../../agents/agent-scope.js";
import { getDb, initStewardDb } from "../db/db-bootstrap.js";
import { withImmediateTransaction } from "../db/tx.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { completeRuntimeFlow } from "../runtime/runtime-flow.js";
import { getRuntimeState } from "../runtime/runtime-state.js";
import { markRuntimeIdle } from "../runtime/runtime-state-repo.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { recordStewardTurnStart, recordTurnComplete } from "../runtime/runtime-bridge.js";
import { loadTriageArtifact } from "./triage-artifacts.js";

type ClaimedAutonomyTask = {
  hostTaskId: number;
  sessionId: string;
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
         ht.work_class,
         ht.title,
         ht.details,
         ht.triage_artifact_path,
         ht.triage_knowledge_id,
         ft.flow_id,
         ft.task_id
       FROM steward_host_tasks ht
       JOIN steward_flow_tasks ft ON ft.task_id = ht.id
       JOIN steward_flows f ON f.id = ft.flow_id
       WHERE ht.session_id = ?
         AND ht.source = 'autonomy'
         AND ht.status = 'pending'
       ORDER BY ht.id ASC
       LIMIT 1`,
    )
    .get(sessionId) as
    | {
        id: number;
        session_id: string;
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
  return {
    hostTaskId: row.id,
    sessionId: row.session_id,
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
  const modelRef = resolveDefaultModelForAgent({
    cfg: params.cfg,
    agentId: sessionContext.sessionAgentId,
  });

  return {
    sessionId: sessionContext.sessionId,
    sessionKey: params.sessionKey,
    agentId: sessionContext.sessionAgentId,
    trigger: "autonomy",
    sessionFile: sessionContext.sessionFile,
    workspaceDir,
    config: params.cfg,
    prompt: buildAutonomyPrompt({
      hostTask: params.hostTask,
      triageArtifact,
    }),
    provider: modelRef.provider,
    model: modelRef.model,
    timeoutMs: resolveAgentTimeoutMs({ cfg: params.cfg }),
    runId: `steward-autonomy-${crypto.randomUUID()}`,
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

  try {
    const runParams = await materializeAutonomyTurnParams({
      cfg: params.cfg,
      storePath: params.storePath,
      sessionKey: params.sessionKey,
      hostTask,
    });
    await recordStewardTurnStart({
      storePath: params.storePath,
      sessionKey: params.sessionKey,
      flowId: hostTask.flowId,
      taskId: hostTask.taskId,
      triggerSource: "autonomy",
      hostTaskId: hostTask.hostTaskId,
    });

    const runAgent = params.runAgent ?? runEmbeddedPiAgent;
    const result = (await runAgent(runParams)) as EmbeddedPiRunResult;
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
    terminalizeAutonomyTask({
      hostTask,
      sessionKey: params.sessionKey,
      outcome: "completed",
      now,
    });
    return {
      status: "claimed",
      hostTaskId: hostTask.hostTaskId,
      outcome: "completed",
    };
  } catch (error) {
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
    completeRuntimeFlow({
      flowId: hostTask.flowId,
      taskId: hostTask.taskId,
      linkStatus: "failed",
      now,
    });
    markRuntimeIdle({
      sessionKey: authority.sessionId,
      now,
      lastError: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
    terminalizeAutonomyTask({
      hostTask,
      sessionKey: params.sessionKey,
      outcome: "failed",
      error,
      now,
    });
    return {
      status: "claimed",
      hostTaskId: hostTask.hostTaskId,
      outcome: "failed",
    };
  }
}
