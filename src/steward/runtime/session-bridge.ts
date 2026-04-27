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
import { adjudicateTaskValue } from "../mission/task-value.js";
import { runMetacogMonitorTick } from "../control/metacog-monitor.js";
import { runMaintenanceGovernorTick } from "../control/maintenance-governor.js";
import { runSelfImprovementTick } from "../control/self-improvement.js";

function resolveTerminalTaskStatus(params: {
  aborted: boolean;
  proofVerdict?: "accepted" | "rejected" | null;
}): "succeeded" | "failed" {
  if (params.aborted) {
    return "failed";
  }
  if (params.proofVerdict === "rejected") {
    return "failed";
  }
  return "succeeded";
}

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
  const aborted = params.result?.aborted === true;
  const proofResult =
    aborted
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
  const taskValueResult =
    aborted
      ? null
      : await adjudicateTaskValue({
          sessionId: authority.sessionId,
          sessionKey: params.sessionKey,
          flowId: current?.activeFlowId ?? null,
          taskId: params.result?.taskId ?? null,
          taskType: params.result?.taskType ?? "general",
          taskTitle: params.result?.taskTitle ?? "Agent turn completion",
          taskDetails: params.result?.taskDetails ?? "",
          taskResult: params.result?.finalAssistantText ?? "",
          proofVerdict: proofResult?.verdict ?? null,
          proofScore: proofResult?.score ?? null,
          now,
        });
  const controlResult =
    aborted
      ? null
      : {
          metacog: runMetacogMonitorTick({
            sessionKey: params.sessionKey,
            now,
          }),
          governor: runMaintenanceGovernorTick({
            sessionKey: params.sessionKey,
            now,
          }),
          selfImprovement: runSelfImprovementTick({
            sessionId: authority.sessionId,
            now,
          }),
        };
  const terminalTaskStatus = resolveTerminalTaskStatus({
    aborted,
    proofVerdict: proofResult?.verdict ?? null,
  });
  completeRuntimeFlow({
    flowId: current?.activeFlowId,
    taskId: current?.activeTaskId,
    linkStatus: terminalTaskStatus,
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
      aborted,
      proofId: proofResult?.proofId ?? null,
      proofVerdict: proofResult?.verdict ?? null,
      proofScore: proofResult?.score ?? null,
      taskValueScore: taskValueResult?.score ?? null,
      taskValueLabel: taskValueResult?.label ?? null,
      terminalTaskStatus,
      controlResult,
    },
    now,
  });
  await recordSessionContinuityMemory({
    sessionKey: params.sessionKey,
    aborted,
    now,
  });
  await projectSessionToCompatibilityStore({
    storePath: params.storePath,
    sessionKey: params.sessionKey,
    stewardSessionId: authority.sessionId,
  });
}
