import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { markRuntimeRunning } from "../runtime/runtime-state-repo.js";
import {
  evaluateAutonomyAssistantOutputDecision,
  evaluateAutonomyToolProgressDecision,
  resolveAutonomyWorkClassBoundary,
} from "./progress-discipline.js";

function seedAutonomyHostTask(params: {
  sessionId: string;
  workClass: string;
  status?: string;
  flowId?: number;
  taskId?: number;
  now?: number;
}) {
  const now = params.now ?? Date.now();
  const flowId = params.flowId ?? params.taskId ?? 1;
  const taskId = params.taskId ?? flowId;
  getDb()
    .prepare(
      `INSERT INTO steward_flows (
         id, session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
       ) VALUES (?, ?, 'maintenance', 'completed', '{}', ?, ?, ?, ?)`,
    )
    .run(flowId, params.sessionId, process.pid, now, now, now);
  getDb()
    .prepare(
      `INSERT INTO steward_host_tasks (
         id, session_id, source, status, seed_flow_id, work_class, title, details, created_ts, updated_ts
       ) VALUES (?, ?, 'autonomy', ?, ?, ?, 'Task', 'Details', ?, ?)`,
    )
    .run(taskId, params.sessionId, params.status ?? "pending", flowId, params.workClass, now, now);
  return { flowId, taskId };
}

describe("WS-PD progress discipline", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("allows only one hard-fail tool continuation for goal_work autonomy", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:pd-goal", 1_000);
    const { flowId, taskId } = seedAutonomyHostTask({
      sessionId: authority.sessionId,
      workClass: "goal_work",
      flowId: 11,
      taskId: 11,
      now: 1_050,
    });
    markRuntimeRunning({
      sessionKey: authority.sessionId,
      flowId,
      taskId,
      triggerSource: "autonomy",
      now: 1_100,
    });

    const first = evaluateAutonomyToolProgressDecision({
      sessionKey: "agent:main:webchat:direct:pd-goal",
      toolName: "web_fetch",
      toolCallId: "call-1",
      hardFailCount: 0,
      result: {
        details: {
          stewardPostcheck: {
            verdict: "hard_fail",
            reason: "unusable fetched document",
          },
        },
      },
    });
    const second = evaluateAutonomyToolProgressDecision({
      sessionKey: "agent:main:webchat:direct:pd-goal",
      toolName: "web_fetch",
      toolCallId: "call-2",
      hardFailCount: 1,
      result: {
        details: {
          stewardPostcheck: {
            verdict: "hard_fail",
            reason: "unusable fetched document",
          },
        },
      },
    });

    expect(first).toMatchObject({
      action: "continue",
      reason: "single_hard_fail_budget_consumed",
      hardFailCount: 1,
      workClass: "goal_work",
    });
    expect(second).toMatchObject({
      action: "terminate_turn",
      reason: "repeated_hard_fail_same_turn",
      hardFailCount: 2,
      workClass: "goal_work",
    });
  });

  it("terminates maintenance autonomy immediately on permission-seeking assistant output", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:pd-maintenance", 2_000);
    const { flowId, taskId } = seedAutonomyHostTask({
      sessionId: authority.sessionId,
      workClass: "maintenance_work",
      flowId: 21,
      taskId: 21,
      now: 2_050,
    });
    markRuntimeRunning({
      sessionKey: authority.sessionId,
      flowId,
      taskId,
      triggerSource: "autonomy",
      now: 2_100,
    });

    const decision = evaluateAutonomyAssistantOutputDecision({
      sessionKey: "agent:main:webchat:direct:pd-maintenance",
      text: "Please reply with 1 to approve the healthcheck before I continue.",
    });

    expect(decision).toMatchObject({
      action: "terminate_turn",
      reason: "permission_seeking_not_allowed_for_autonomy_work_class",
      workClass: "maintenance_work",
    });
  });

  it("reroutes repeated bad maintenance outcomes into a different host-owned work class", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:pd-boundary", 3_000);
    seedAutonomyHostTask({
      sessionId: authority.sessionId,
      workClass: "maintenance_work",
      status: "failed",
      flowId: 31,
      taskId: 31,
      now: 3_050,
    });
    appendStewardEvent({
      kind: "runtime.idle",
      message: "Turn completed",
      sessionId: authority.sessionId,
      flowId: 31,
      now: 3_060,
      data: {
        proofVerdict: "rejected",
        taskValueLabel: "hollow",
      },
    });
    seedAutonomyHostTask({
      sessionId: authority.sessionId,
      workClass: "maintenance_work",
      status: "failed",
      flowId: 32,
      taskId: 32,
      now: 3_150,
    });
    appendStewardEvent({
      kind: "runtime.idle",
      message: "Turn completed",
      sessionId: authority.sessionId,
      flowId: 32,
      now: 3_160,
      data: {
        proofVerdict: "rejected",
        taskValueLabel: "low_value",
      },
    });

    const boundary = resolveAutonomyWorkClassBoundary({
      sessionId: authority.sessionId,
      proposedWorkClass: "maintenance_work",
    });

    expect(boundary).toMatchObject({
      boundaryApplied: true,
      workClass: "diagnostic_work",
      reason: "repeated_bad_outcomes_for_maintenance_work",
    });
  });

  it("does not leak autonomy-only hard-fail policy into user turns", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:pd-user", 4_000);
    seedAutonomyHostTask({
      sessionId: authority.sessionId,
      workClass: "maintenance_work",
      flowId: 41,
      taskId: 41,
      now: 4_050,
    });
    markRuntimeRunning({
      sessionKey: authority.sessionId,
      flowId: 41,
      taskId: 41,
      triggerSource: "user",
      now: 4_100,
    });

    const decision = evaluateAutonomyToolProgressDecision({
      sessionKey: "agent:main:webchat:direct:pd-user",
      toolName: "web_fetch",
      toolCallId: "call-user",
      hardFailCount: 0,
      result: {
        details: {
          stewardPostcheck: {
            verdict: "hard_fail",
            reason: "bad fetch",
          },
        },
      },
    });

    expect(decision).toBeNull();
  });
});
