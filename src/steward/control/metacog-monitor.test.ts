import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { FRUSTRATION_THRESHOLD, runMetacogMonitorTick } from "./metacog-monitor.js";

describe("WS-H metacog monitor", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("detects spin and seeds one analysis task", () => {
    const sessionKey = "agent:main:webchat:direct:metacog-spin";
    const session = getOrCreateStewardSession(sessionKey, 100_000);
    for (let index = 0; index < 51; index += 1) {
      appendStewardEvent({
        kind: "runtime.started",
        message: "same-event",
        sessionId: session.sessionId,
        now: 100_000 - index,
      });
    }

    const result = runMetacogMonitorTick({
      sessionKey,
      now: 100_000,
    });

    expect(result.anomalies).toContain("spin");
    expect(result.tasksSeeded).toHaveLength(1);
    const row = getDb()
      .prepare(`SELECT kind FROM steward_events WHERE kind = 'control.anomaly.detected'`)
      .get() as { kind: string };
    expect(row.kind).toBe("control.anomaly.detected");
  });

  it("detects frustration after more than five consecutive low-value outcomes", () => {
    const sessionKey = "agent:main:webchat:direct:metacog-frustration";
    const session = getOrCreateStewardSession(sessionKey, 10_000);
    for (let index = 0; index < FRUSTRATION_THRESHOLD; index += 1) {
      appendStewardEvent({
        kind: "mission.task_value.adjudicated",
        message: "task_value.adjudicated",
        sessionId: session.sessionId,
        now: 10_000 + index,
        data: {
          score: 1,
          label: "hollow",
        },
      });
    }

    const result = runMetacogMonitorTick({
      sessionKey,
      now: 20_000,
    });

    expect(result.anomalies).toContain("frustration");
    expect(result.tasksSeeded).toHaveLength(1);
  });
});
