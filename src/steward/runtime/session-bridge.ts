// Seam: hooks after recordSessionMetaFromInbound in src/config/sessions/store.ts
// and after updateSessionStoreAfterAgentRun in src/agents/command/session-store.ts.
// This adapter injects steward DB authority without replacing OpenClaw session writes.
import { initStewardDb } from "../db/db-bootstrap.js";
import { createRuntimeFlow, completeRuntimeFlow } from "./runtime-flow.js";
import { appendStewardEvent } from "./runtime-events.js";
import { getRuntimeState } from "./runtime-state.js";
import { markRuntimeIdle, markRuntimeRunning } from "./runtime-state-repo.js";
import { recordSessionContinuityMemory } from "../memory/relationship-memory.js";
import { getOrCreateStewardSession } from "./session-authority.js";
import { projectSessionToCompatibilityStore } from "./session-projection.js";
import { judgeAndPersistProof } from "../proof/proof-judge.js";
import type { ProofTaskType, StewardClassifier } from "../proof/proof-types.js";

export async function recordInboundTurnStart(params: {
  storePath: string;
  sessionKey: string;
}): Promise<void> {
  initStewardDb(params.storePath);
  const authority = getOrCreateStewardSession(params.sessionKey);
  const { flowId, taskId } = createRuntimeFlow({ sessionId: authority.sessionId });
  markRuntimeRunning({
    sessionKey: authority.sessionId,
    flowId,
    taskId,
  });
  appendStewardEvent({
    kind: "runtime.started",
    message: "Inbound turn started",
    sessionId: authority.sessionId,
    flowId,
    data: {
      sessionKey: params.sessionKey,
      taskId,
    },
  });
  await projectSessionToCompatibilityStore({
    storePath: params.storePath,
    sessionKey: params.sessionKey,
    stewardSessionId: authority.sessionId,
  });
}

export async function recordTurnComplete(params: {
  storePath: string;
  sessionKey: string;
  result?: {
    aborted?: boolean;
    finalAssistantText?: string;
    taskId?: number | null;
    taskType?: ProofTaskType;
    taskTitle?: string;
    taskDetails?: string;
    classifier?: StewardClassifier | null;
  };
}): Promise<void> {
  initStewardDb(params.storePath);
  const authority = getOrCreateStewardSession(params.sessionKey);
  const current = getRuntimeState(authority.sessionId);
  const now = Date.now();
  const proofResult =
    params.result?.aborted === true
      ? null
      : await judgeAndPersistProof({
          sessionId: authority.sessionId,
          sessionKey: params.sessionKey,
          flowId: current?.activeFlowId ?? null,
          proofText: params.result?.finalAssistantText ?? "",
          classifier: params.result?.classifier ?? null,
          now,
          task: {
            taskId: params.result?.taskId ?? null,
            taskType: params.result?.taskType ?? "general",
            title: params.result?.taskTitle ?? "Agent turn completion",
            details: params.result?.taskDetails ?? "",
          },
        });
  completeRuntimeFlow({
    flowId: current?.activeFlowId,
    taskId: current?.activeTaskId,
  });
  markRuntimeIdle({
    sessionKey: authority.sessionId,
  });
  appendStewardEvent({
    kind: "runtime.idle",
    message: "Turn completed",
    sessionId: authority.sessionId,
    flowId: current?.activeFlowId ?? null,
    data: {
      sessionKey: params.sessionKey,
      aborted: params.result?.aborted ?? false,
      proofId: proofResult?.proofId ?? null,
      proofVerdict: proofResult?.verdict ?? null,
      proofScore: proofResult?.score ?? null,
    },
    now,
  });
  await recordSessionContinuityMemory({
    sessionKey: params.sessionKey,
    aborted: params.result?.aborted ?? false,
    now,
  });
  await projectSessionToCompatibilityStore({
    storePath: params.storePath,
    sessionKey: params.sessionKey,
    stewardSessionId: authority.sessionId,
  });
}
