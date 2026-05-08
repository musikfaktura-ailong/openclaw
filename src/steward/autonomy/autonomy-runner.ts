import { appendStewardEvent } from "../runtime/runtime-events.js";
import {
  getAutonomyState,
  markAutonomyTickRan,
  setAutonomyIdleBackoff,
} from "./autonomy-state.js";
import { evaluateAutonomyRunPolicy } from "./autonomy-policy.js";
import { classifyAutonomyWork, type AutonomyWorkClass } from "./work-classifier.js";
import { seedIdleAutonomyTask } from "./idle-seeding.js";
import { appendAutonomyProgressDecisionEvent } from "./progress-discipline.js";

const INITIAL_IDLE_BACKOFF_MS = 60_000;
const MAX_IDLE_BACKOFF_MS = 15 * 60 * 1000;

export type AutonomyTickOutcome =
  | {
      status: "blocked";
      sessionId: string;
      reason: string;
      nextAllowedTickTs: number | null;
      workClass: null;
      flowId: null;
      taskId: null;
    }
  | {
      status: "noop";
      sessionId: string;
      reason: "duplicate_seed_suppressed";
      nextAllowedTickTs: number;
      workClass: AutonomyWorkClass;
      flowId: number | null;
      taskId: null;
    }
  | {
      status: "seeded";
      sessionId: string;
      reason: string;
      nextAllowedTickTs: number;
      workClass: AutonomyWorkClass;
      flowId: number;
      taskId: number;
    };

function nextBackoffDelay(currentBackoffMs: number): number {
  if (currentBackoffMs <= 0) {
    return INITIAL_IDLE_BACKOFF_MS;
  }
  return Math.min(currentBackoffMs * 2, MAX_IDLE_BACKOFF_MS);
}

export async function runAutonomyTick(params: {
  sessionKey: string;
  artifactRoot?: string;
  now?: number;
}): Promise<AutonomyTickOutcome> {
  const now = params.now ?? Date.now();
  const decision = evaluateAutonomyRunPolicy({
    sessionKey: params.sessionKey,
    now,
  });
  if (!decision.allowed) {
    appendStewardEvent({
      kind: "autonomy.tick.blocked",
      message: "autonomy tick blocked",
      sessionId: decision.sessionId,
      now,
      data: {
        reason: decision.reason,
        runtimeStatus: decision.runtimeStatus,
        mode: decision.mode,
        nextAllowedTickTs: decision.nextAllowedTickTs,
      },
    });
    return {
      status: "blocked",
      sessionId: decision.sessionId,
      reason: decision.reason,
      nextAllowedTickTs: decision.nextAllowedTickTs,
      workClass: null,
      flowId: null,
      taskId: null,
    };
  }

  const classification = classifyAutonomyWork({
    sessionId: decision.sessionId,
    now,
  });
  if (classification.reason.startsWith("repeated_bad_outcomes_for_")) {
    appendAutonomyProgressDecisionEvent({
      sessionKey: params.sessionKey,
      now,
      decision: {
        action: "continue",
        reason: classification.reason,
        scope: "work_class_boundary",
        workClass: classification.workClass,
        hostTaskId: null,
        flowId: null,
        details: {
          classificationReason: classification.reason,
        },
      },
    });
  }
  const seeded = await seedIdleAutonomyTask({
    sessionId: decision.sessionId,
    sessionKey: params.sessionKey,
    workClass: classification.workClass,
    classificationReason: classification.reason,
    artifactRoot: params.artifactRoot,
    now,
  });

  if (!seeded.seeded) {
    const state = getAutonomyState();
    const nextDelay = nextBackoffDelay(state.idleBackoffMs);
    const nextAllowedTickTs = now + nextDelay;
    setAutonomyIdleBackoff({
      idleBackoffMs: nextDelay,
      now,
    });
    markAutonomyTickRan({
      now,
      nextAllowedTickTs,
    });
    appendStewardEvent({
      kind: "autonomy.tick.noop",
      message: "autonomy tick produced no new task",
      sessionId: decision.sessionId,
      flowId: seeded.duplicateFlowId,
      now,
      data: {
        reason: seeded.reason,
        workClass: seeded.workClass,
        duplicateFlowId: seeded.duplicateFlowId,
        nextAllowedTickTs,
      },
    });
    return {
      status: "noop",
      sessionId: decision.sessionId,
      reason: seeded.reason,
      nextAllowedTickTs,
      workClass: seeded.workClass,
      flowId: seeded.duplicateFlowId,
      taskId: null,
    };
  }

  setAutonomyIdleBackoff({
    idleBackoffMs: INITIAL_IDLE_BACKOFF_MS,
    now,
  });
  const nextAllowedTickTs = now + INITIAL_IDLE_BACKOFF_MS;
  markAutonomyTickRan({
    now,
    nextAllowedTickTs,
  });
  return {
    status: "seeded",
    sessionId: decision.sessionId,
    reason: seeded.reason,
    nextAllowedTickTs,
    workClass: seeded.workClass,
    flowId: seeded.task.flowId,
    taskId: seeded.task.taskId,
  };
}
