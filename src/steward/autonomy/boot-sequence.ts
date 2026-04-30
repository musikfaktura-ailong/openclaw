import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getRuntimeState } from "../runtime/runtime-state.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { getAutonomyState, markAutonomyBootCompleted, type AutonomyMode } from "./autonomy-state.js";

export type BootNextActionClass =
  | "wait_for_autonomy_enable"
  | "wait_for_operator_unpause"
  | "wait_for_idle"
  | "seed_first_task";

export type BootCapabilitySnapshot = {
  dbReady: boolean;
  runtimeStatus: "missing" | "idle" | "running" | "waiting" | "blocked";
  truthCoreReady: boolean;
  lmStudioLifecycleReady: boolean;
  autonomyMode: AutonomyMode;
};

export type BootRecord = {
  recorded: boolean;
  skipped: boolean;
  alreadyCompleted: boolean;
  sessionId: string;
  snapshot: BootCapabilitySnapshot;
  nextActionClass: BootNextActionClass;
  reason: string;
  ts: number;
};

function classifyNextAction(snapshot: BootCapabilitySnapshot): {
  nextActionClass: BootNextActionClass;
  reason: string;
} {
  if (snapshot.autonomyMode === "assistant_only") {
    return {
      nextActionClass: "wait_for_autonomy_enable",
      reason: "assistant_only_mode",
    };
  }
  if (snapshot.autonomyMode === "autonomy_paused") {
    return {
      nextActionClass: "wait_for_operator_unpause",
      reason: "autonomy_paused",
    };
  }
  if (snapshot.runtimeStatus === "running") {
    return {
      nextActionClass: "wait_for_idle",
      reason: "user_turn_active",
    };
  }
  return {
    nextActionClass: "seed_first_task",
    reason: "boot_ready",
  };
}

function buildSnapshot(params: {
  sessionId: string;
  autonomyMode: AutonomyMode;
  lmStudioLifecycleReady?: boolean;
  truthCoreReady?: boolean;
}): BootCapabilitySnapshot {
  const runtime = getRuntimeState(params.sessionId);
  return {
    dbReady: true,
    runtimeStatus: runtime?.status ?? "missing",
    truthCoreReady: params.truthCoreReady ?? true,
    lmStudioLifecycleReady: params.lmStudioLifecycleReady ?? true,
    autonomyMode: params.autonomyMode,
  };
}

export function recordAutonomyBootSequence(params: {
  sessionKey: string;
  now?: number;
  lmStudioLifecycleReady?: boolean;
  truthCoreReady?: boolean;
}): BootRecord {
  const now = params.now ?? Date.now();
  const authority = getOrCreateStewardSession(params.sessionKey, now);
  const autonomyState = getAutonomyState();
  const snapshot = buildSnapshot({
    sessionId: authority.sessionId,
    autonomyMode: autonomyState.mode,
    lmStudioLifecycleReady: params.lmStudioLifecycleReady,
    truthCoreReady: params.truthCoreReady,
  });
  const decision = classifyNextAction(snapshot);

  if (autonomyState.bootCompleted) {
    appendStewardEvent({
      kind: "autonomy.boot.skipped",
      message: "autonomy boot already completed",
      sessionId: authority.sessionId,
      now,
      data: {
        snapshot,
        nextActionClass: decision.nextActionClass,
        reason: "already_completed",
      },
    });
    return {
      recorded: false,
      skipped: true,
      alreadyCompleted: true,
      sessionId: authority.sessionId,
      snapshot,
      nextActionClass: decision.nextActionClass,
      reason: "already_completed",
      ts: now,
    };
  }

  markAutonomyBootCompleted({
    completed: true,
    now,
  });
  appendStewardEvent({
    kind: "autonomy.boot.recorded",
    message: "autonomy boot recorded",
    sessionId: authority.sessionId,
    now,
    data: {
      snapshot,
      nextActionClass: decision.nextActionClass,
      reason: decision.reason,
    },
  });
  return {
    recorded: true,
    skipped: false,
    alreadyCompleted: false,
    sessionId: authority.sessionId,
    snapshot,
    nextActionClass: decision.nextActionClass,
    reason: decision.reason,
    ts: now,
  };
}
