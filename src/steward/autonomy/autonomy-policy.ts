import type { StewardRuntimeStatus } from "../db/runtime-schema.js";
import { getRuntimeState } from "../runtime/runtime-state.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import {
  getAutonomyState,
  recordAutonomyBlocked,
  type AutonomyBlockedReason,
  type AutonomyMode,
} from "./autonomy-state.js";

export type AutonomyPolicyReason = "allowed" | AutonomyBlockedReason;

export type AutonomyRunDecision = {
  allowed: boolean;
  reason: AutonomyPolicyReason;
  mode: AutonomyMode;
  sessionId: string;
  runtimeStatus: StewardRuntimeStatus | "missing";
  blockedByUserTurn: boolean;
  nextAllowedTickTs: number | null;
};

function buildBlockedDecision(params: {
  sessionId: string;
  mode: AutonomyMode;
  reason: AutonomyBlockedReason;
  runtimeStatus: StewardRuntimeStatus | "missing";
  nextAllowedTickTs: number | null;
  blockedByUserTurn: boolean;
  now: number;
  persistDecision: boolean;
}): AutonomyRunDecision {
  if (params.persistDecision) {
    recordAutonomyBlocked({
      reason: params.reason,
      now: params.now,
      nextAllowedTickTs: params.nextAllowedTickTs,
    });
    appendStewardEvent({
      kind: "autonomy.policy.blocked",
      message: "autonomy policy blocked",
      sessionId: params.sessionId,
      now: params.now,
      data: {
        mode: params.mode,
        reason: params.reason,
        runtimeStatus: params.runtimeStatus,
        nextAllowedTickTs: params.nextAllowedTickTs,
      },
    });
  }
  return {
    allowed: false,
    reason: params.reason,
    mode: params.mode,
    sessionId: params.sessionId,
    runtimeStatus: params.runtimeStatus,
    blockedByUserTurn: params.blockedByUserTurn,
    nextAllowedTickTs: params.nextAllowedTickTs,
  };
}

export function evaluateAutonomyRunPolicy(params: {
  sessionKey: string;
  now?: number;
  budgetAvailable?: boolean;
  requireBootComplete?: boolean;
  persistDecision?: boolean;
}): AutonomyRunDecision {
  const now = params.now ?? Date.now();
  const persistDecision = params.persistDecision ?? true;
  const budgetAvailable = params.budgetAvailable ?? true;
  const requireBootComplete = params.requireBootComplete ?? true;
  const authority = getOrCreateStewardSession(params.sessionKey, now);
  const state = getAutonomyState();
  const runtime = getRuntimeState(authority.sessionId);
  const runtimeStatus = runtime?.status ?? "missing";

  if (state.mode === "assistant_only") {
    return buildBlockedDecision({
      sessionId: authority.sessionId,
      mode: state.mode,
      reason: "assistant_only_mode",
      runtimeStatus,
      nextAllowedTickTs: state.nextAllowedTickTs,
      blockedByUserTurn: false,
      now,
      persistDecision,
    });
  }
  if (state.mode === "autonomy_paused") {
    return buildBlockedDecision({
      sessionId: authority.sessionId,
      mode: state.mode,
      reason: "autonomy_paused",
      runtimeStatus,
      nextAllowedTickTs: state.nextAllowedTickTs,
      blockedByUserTurn: false,
      now,
      persistDecision,
    });
  }
  if (runtime?.status === "running") {
    return buildBlockedDecision({
      sessionId: authority.sessionId,
      mode: state.mode,
      reason: "user_turn_active",
      runtimeStatus,
      nextAllowedTickTs: state.nextAllowedTickTs,
      blockedByUserTurn: true,
      now,
      persistDecision,
    });
  }
  if (requireBootComplete && !state.bootCompleted) {
    return buildBlockedDecision({
      sessionId: authority.sessionId,
      mode: state.mode,
      reason: "boot_not_complete",
      runtimeStatus,
      nextAllowedTickTs: state.nextAllowedTickTs,
      blockedByUserTurn: false,
      now,
      persistDecision,
    });
  }
  if (state.nextAllowedTickTs != null && now < state.nextAllowedTickTs) {
    return buildBlockedDecision({
      sessionId: authority.sessionId,
      mode: state.mode,
      reason: "cooldown_active",
      runtimeStatus,
      nextAllowedTickTs: state.nextAllowedTickTs,
      blockedByUserTurn: false,
      now,
      persistDecision,
    });
  }
  if (!budgetAvailable) {
    return buildBlockedDecision({
      sessionId: authority.sessionId,
      mode: state.mode,
      reason: "budget_blocked",
      runtimeStatus,
      nextAllowedTickTs: state.nextAllowedTickTs,
      blockedByUserTurn: false,
      now,
      persistDecision,
    });
  }

  if (persistDecision) {
    appendStewardEvent({
      kind: "autonomy.policy.allowed",
      message: "autonomy policy allowed",
      sessionId: authority.sessionId,
      now,
      data: {
        mode: state.mode,
        runtimeStatus,
        nextAllowedTickTs: state.nextAllowedTickTs,
      },
    });
  }
  return {
    allowed: true,
    reason: "allowed",
    mode: state.mode,
    sessionId: authority.sessionId,
    runtimeStatus,
    blockedByUserTurn: false,
    nextAllowedTickTs: state.nextAllowedTickTs,
  };
}
