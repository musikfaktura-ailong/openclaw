import { wrapStreamFnWithStewardLmstudioLifecycle } from "../lmstudio/embedded-runner-seam.js";
import { ensureStewardLmstudioLifecycle, withStewardLmstudioQueryLock } from "../lmstudio/lifecycle-bridge.js";
import { auditClaimRecord } from "../truth/truth-audit.js";
import { persistTruthAudit } from "../truth/truth-persistence.js";

export type StartupReadinessSnapshot = {
  truthCoreReady: boolean;
  lmStudioLifecycleReady: boolean;
};

export function resolveStewardStartupReadiness(): StartupReadinessSnapshot {
  return {
    truthCoreReady:
      typeof auditClaimRecord === "function" && typeof persistTruthAudit === "function",
    lmStudioLifecycleReady:
      typeof ensureStewardLmstudioLifecycle === "function" &&
      typeof withStewardLmstudioQueryLock === "function" &&
      typeof wrapStreamFnWithStewardLmstudioLifecycle === "function",
  };
}
