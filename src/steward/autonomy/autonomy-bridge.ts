import { resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { resolveAgentMainSessionKey } from "../../config/sessions/main-session.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getAutonomyState } from "./autonomy-state.js";
import { recordAutonomyBootSequence, type BootRecord } from "./boot-sequence.js";
import { runAutonomyTick, type AutonomyTickOutcome } from "./autonomy-runner.js";

const DEFAULT_AUTONOMY_INTERVAL_MS = 60_000;

export type AutonomyBridgeRunner = {
  stop: () => void;
  updateConfig: (cfg: OpenClawConfig) => void;
};

export type AutonomyBridgeCycleResult = {
  sessionKey: string;
  boot: BootRecord;
  tick: AutonomyTickOutcome | null;
};

function resolveAutonomySessionKeys(cfg: OpenClawConfig): string[] {
  const listed = (cfg.agents?.list ?? [])
    .map((entry) => entry?.id?.trim())
    .filter((value): value is string => Boolean(value))
    .map((agentId) => resolveAgentMainSessionKey({ cfg, agentId }));
  if (listed.length > 0) {
    return Array.from(new Set(listed));
  }
  return [resolveAgentMainSessionKey({ cfg, agentId: resolveDefaultAgentId(cfg) })];
}

export async function runAutonomyBridgeCycle(params: {
  sessionKey: string;
  now?: number;
  artifactRoot?: string;
  truthCoreReady?: boolean;
  lmStudioLifecycleReady?: boolean;
}): Promise<AutonomyBridgeCycleResult> {
  const now = params.now ?? Date.now();
  const boot = recordAutonomyBootSequence({
    sessionKey: params.sessionKey,
    now,
    truthCoreReady: params.truthCoreReady,
    lmStudioLifecycleReady: params.lmStudioLifecycleReady,
  });
  const shouldRunTick =
    boot.nextActionClass === "seed_first_task" ||
    (boot.alreadyCompleted && getAutonomyState().bootCompleted);
  const tick = shouldRunTick
    ? await runAutonomyTick({
        sessionKey: params.sessionKey,
        artifactRoot: params.artifactRoot,
        now,
      })
    : null;
  appendStewardEvent({
    kind: "autonomy.bridge.tick",
    message: "autonomy bridge cycle completed",
    sessionId: boot.sessionId,
    flowId: tick?.flowId ?? null,
    now,
    data: {
      sessionKey: params.sessionKey,
      bootNextActionClass: boot.nextActionClass,
      bootReason: boot.reason,
      tickStatus: tick?.status ?? "skipped_after_boot",
      tickReason: tick?.reason ?? boot.reason,
    },
  });
  return {
    sessionKey: params.sessionKey,
    boot,
    tick,
  };
}

export function startStewardAutonomyBridge(params: {
  cfg: OpenClawConfig;
  artifactRoot?: string;
  intervalMs?: number;
  nowMs?: () => number;
}): AutonomyBridgeRunner {
  const state = {
    cfg: params.cfg,
    sessionKeys: resolveAutonomySessionKeys(params.cfg),
    stopped: false,
    running: false,
    timer: null as NodeJS.Timeout | null,
  };
  const nowMs = params.nowMs ?? (() => Date.now());
  const intervalMs = Math.max(1_000, params.intervalMs ?? DEFAULT_AUTONOMY_INTERVAL_MS);

  const clearTimer = () => {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  };

  const tickAll = async () => {
    if (state.stopped || state.running) {
      return;
    }
    state.running = true;
    try {
      for (const sessionKey of state.sessionKeys) {
        await runAutonomyBridgeCycle({
          sessionKey,
          now: nowMs(),
          artifactRoot: params.artifactRoot,
        });
      }
    } finally {
      state.running = false;
    }
  };

  const arm = () => {
    clearTimer();
    if (state.stopped) {
      return;
    }
    state.timer = setInterval(() => {
      void tickAll();
    }, intervalMs);
    state.timer.unref?.();
  };

  const updateConfig = (cfg: OpenClawConfig) => {
    state.cfg = cfg;
    state.sessionKeys = resolveAutonomySessionKeys(cfg);
  };

  arm();
  return {
    stop: () => {
      state.stopped = true;
      clearTimer();
    },
    updateConfig,
  };
}
