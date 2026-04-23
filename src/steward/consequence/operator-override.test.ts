import { afterEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { persistOperatorOverride } from "./operator-override.js";

afterEach(() => {
  closeStewardDb();
  resetDbForTest();
});

describe("WS-D operator override", () => {
  it("persists override memory and applies fatigue at the fourth override", async () => {
    initStewardDb(":memory:");
    const sessionKey = "agent:main:webchat:direct:user-1";
    let fatigue = await persistOperatorOverride({
      sessionKey,
      toolName: "exec",
      approvalClass: "exec_capable",
      recommendation: "WARN",
      reason: "manual approval",
      now: 1_000,
    });
    fatigue = await persistOperatorOverride({
      sessionKey,
      toolName: "exec",
      approvalClass: "exec_capable",
      recommendation: "WARN",
      reason: "manual approval",
      now: 2_000,
    });
    fatigue = await persistOperatorOverride({
      sessionKey,
      toolName: "exec",
      approvalClass: "exec_capable",
      recommendation: "WARN",
      reason: "manual approval",
      now: 3_000,
    });
    fatigue = await persistOperatorOverride({
      sessionKey,
      toolName: "exec",
      approvalClass: "exec_capable",
      recommendation: "WARN",
      reason: "manual approval",
      now: 4_000,
    });

    expect(fatigue.overrideCount7d).toBe(4);
    expect(fatigue.penaltySeconds).toBe(1800);
    expect(fatigue.requiresReview).toBe(false);

    const row = getDb()
      .prepare(
        `SELECT COUNT(*) AS count
         FROM steward_memories
         WHERE session_key = ?
           AND memory_type = 'operator_override'`,
      )
      .get(sessionKey) as { count: number };
    expect(row.count).toBe(4);
  });
});
