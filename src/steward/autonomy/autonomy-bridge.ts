import { resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { resolveStorePath } from "../../config/sessions/paths.js";
import { resolveAgentMainSessionKey } from "../../config/sessions/main-session.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { initStewardDb } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getOrCreateStewardSession, resolveSessionAuthority } from "../runtime/session-authority.js";
import { recordAutonomyBootSequence, type BootRecord } from "./boot-sequence.js";
import { runAutonomyTick, type AutonomyTickOutcome } from "./autonomy-runner.js";
import {
  runAutonomyExecuteCycle,
  type AutonomyExecuteOutcome,
} from "./autonomy-executor.js";
import {
  resolveStewardStartupReadiness,
  type StartupReadinessSnapshot,
} from "./startup-readiness.js";

const DEFAULT_AUTONOMY_INTERVAL_MS = 60_000;

export type AutonomyBridgeRunner = {
  stop: () => void;
  updateConfig: (cfg: OpenClawConfig) => void;
};

export type AutonomyBridgeCycleResult = {
  sessionKey: string;
  boot: BootRecord;
  tick: AutonomyTickOutcome | null;
  execute: AutonomyExecuteOutcome | null;
};

export function recordAutonomyBridgeFailure(params: {
  sessionKey: string;
  storePath: string;
  now: number;
  error: unknown;
}): void {
  const authority = resolveSessionAuthority(params.sessionKey);
  const errorText = String(params.error);
  try {
    initStewardDb(params.storePath);
    const persistedAuthority = getOrCreateStewardSession(params.sessionKey, params.now);
    appendStewardEvent({
      kind: "autonomy.bridge.failed",
      message: "autonomy bridge cycle failed",
      sessionId: persistedAuthority.sessionId,
      now: params.now,
      data: {
        sessionKey: params.sessionKey,
        error: errorText,
      },
    });
  } catch (eventError) {
    console.error(
      `[steward/autonomy] failed to persist bridge failure for ${params.sessionKey}: ${String(eventError)}; original error: ${errorText}`,
    );
  }
}

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

function resolveAutonomyStorePath(cfg: OpenClawConfig): string {
  return resolveStorePath(cfg.session?.store, {
    agentId: resolveDefaultAgentId(cfg),
  });
}

export async function runAutonomyBridgeCycle(params: {
  cfg?: OpenClawConfig;
  sessionKey: string;
  storePath: string;
  now?: number;
  artifactRoot?: string;
  resolveStartupReadiness?: () => StartupReadinessSnapshot;
  runAgent?: Parameters<typeof runAutonomyExecuteCycle>[0]["runAgent"];
}): Promise<AutonomyBridgeCycleResult> {
  const now = params.now ?? Date.now();
  initStewardDb(params.storePath);
  const readiness = (params.resolveStartupReadiness ?? resolveStewardStartupReadiness)();
  const boot = recordAutonomyBootSequence({
    sessionKey: params.sessionKey,
    now,
    truthCoreReady: readiness.truthCoreReady,
    lmStudioLifecycleReady: readiness.lmStudioLifecycleReady,
  });
  const shouldRunTick =
    boot.nextActionClass === "seed_first_task" || boot.alreadyCompleted;
  const tick = shouldRunTick
    ? await runAutonomyTick({
        sessionKey: params.sessionKey,
        artifactRoot: params.artifactRoot,
        now,
      })
    : null;
  const execute =
    shouldRunTick &&
    params.cfg &&
    (tick?.status === "seeded" || tick == null || tick.status === "noop")
      ? await runAutonomyExecuteCycle({
          cfg: params.cfg,
          sessionKey: params.sessionKey,
          storePath: params.storePath,
          now,
          runAgent: params.runAgent,
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
      executeStatus: execute?.status ?? "not_run",
      executeOutcome: execute?.status === "claimed" ? execute.outcome : null,
      executeHostTaskId: execute?.status === "claimed" ? execute.hostTaskId : null,
    },
  });
  return {
    sessionKey: params.sessionKey,
    boot,
    tick,
    execute,
  };
}

export function startStewardAutonomyBridge(params: {
  cfg: OpenClawConfig;
  storePath?: string;
  artifactRoot?: string;
  intervalMs?: number;
  nowMs?: () => number;
}): AutonomyBridgeRunner {
  const state = {
    cfg: params.cfg,
    sessionKeys: resolveAutonomySessionKeys(params.cfg),
    storePath: params.storePath ?? resolveAutonomyStorePath(params.cfg),
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
        const tickNow = nowMs();
        try {
          await runAutonomyBridgeCycle({
            cfg: state.cfg,
            sessionKey,
            storePath: state.storePath,
            now: tickNow,
            artifactRoot: params.artifactRoot,
          });
        } catch (error) {
          recordAutonomyBridgeFailure({
            sessionKey,
            storePath: state.storePath,
            now: tickNow,
            error,
          });
        }
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
    state.storePath = resolveAutonomyStorePath(cfg);
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
