import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { buildStewardshipDriftReport, scoreRecentStewardshipEvents } from "./stewardship-audit.js";

describe("WS-E stewardship audit", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("scores recent mission events and persists audit events", () => {
    const session = getOrCreateStewardSession("session-audit");
    appendStewardEvent({
      kind: "mission.task_value.adjudicated",
      message: "task_value.adjudicated",
      sessionId: session.sessionId,
      data: {
        score: 9,
        reflection: { truthViolationCount: 0, operatorServed: true, truthPreserved: true },
      },
      now: 1_000,
    });

    const report = buildStewardshipDriftReport({ sessionId: session.sessionId, now: 2_000 });
    const score = scoreRecentStewardshipEvents({ sessionId: session.sessionId });

    expect(report.averageStewardshipScore).toBe(9);
    expect(report.passed).toBe(true);
    expect(score.eventsScored).toBeGreaterThan(0);
  });
});
