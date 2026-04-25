import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { getControlBudgetSnapshot, seedControlTask } from "./control-budget.js";

function insertPrimaryTask(sessionId: string, now: number): void {
  const db = getDb();
  const flowResult = db
    .prepare(
      `INSERT INTO steward_flows (
         session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
       ) VALUES (?, 'research', 'completed', '{}', ?, ?, ?, ?)` ,
    )
    .run(sessionId, process.pid, now, now, now) as { lastInsertRowid: number | bigint };
  const flowId = Number(flowResult.lastInsertRowid);
  db.prepare(
    `INSERT INTO steward_flow_tasks (
       flow_id, task_id, role, link_status, created_ts, updated_ts
     ) VALUES (?, ?, 'primary', 'succeeded', ?, ?)`,
  ).run(flowId, flowId, now, now);
}

describe("WS-H control budget", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("allows early control tasks before the ratio gate activates, then blocks at the max-task cap", () => {
    const sessionKey = "agent:main:webchat:direct:budget-a";

    const first = seedControlTask({
      sessionKey,
      title: "Metacog: analyze spin",
      details: "spin",
      source: "metacog",
      taskType: "analysis",
      now: 1_000,
    });
    const second = seedControlTask({
      sessionKey,
      title: "Governor: reroute",
      details: "reroute",
      source: "governor",
      taskType: "analysis",
      now: 2_000,
    });
    const third = seedControlTask({
      sessionKey,
      title: "Governor: diagnose",
      details: "diagnose",
      source: "governor",
      taskType: "diagnostic",
      now: 3_000,
    });
    const blocked = seedControlTask({
      sessionKey,
      title: "Too many",
      details: "blocked",
      source: "self_improvement",
      taskType: "hint_patch",
      now: 4_000,
    });

    expect(first?.taskId).toBeTruthy();
    expect(second?.taskId).toBeTruthy();
    expect(third?.taskId).toBeTruthy();
    expect(blocked).toBeNull();
  });

  it("enforces the 20 percent ratio after enough runtime work exists", () => {
    const sessionKey = "agent:main:webchat:direct:budget-b";
    const session = getOrCreateStewardSession(sessionKey, 1_000);
    for (let index = 0; index < 9; index += 1) {
      insertPrimaryTask(session.sessionId, 1_000 + index);
    }

    const first = seedControlTask({
      sessionKey,
      title: "Metacog: analyze stagnation",
      details: "stagnation",
      source: "metacog",
      taskType: "analysis",
      now: 2_000,
    });
    const second = seedControlTask({
      sessionKey,
      title: "Governor: diagnostic",
      details: "planner issue",
      source: "governor",
      taskType: "diagnostic",
      now: 2_100,
    });
    const blocked = seedControlTask({
      sessionKey,
      title: "Governor: strategy reset",
      details: "ratio capped",
      source: "governor",
      taskType: "strategy_reset",
      now: 2_200,
    });

    expect(first?.taskId).toBeTruthy();
    expect(second?.taskId).toBeTruthy();
    expect(blocked).toBeNull();
    expect(getControlBudgetSnapshot(2_200).ratioAfterNextSeed).toBeGreaterThan(0.2);
  });
});
