import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import {
  getAutonomyState,
  markAutonomyBootCompleted,
  markAutonomyTickRan,
  recordAutonomyBlocked,
  setAutonomyIdleBackoff,
  setAutonomyMode,
} from "./autonomy-state.js";

describe("WS-IA autonomy state", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("defaults to assistant_only with empty state", () => {
    expect(getAutonomyState()).toEqual({
      mode: "assistant_only",
      lastAutonomyTickTs: null,
      bootCompleted: false,
      idleBackoffMs: 0,
      lastBlockedReason: null,
      nextAllowedTickTs: null,
      updatedTs: null,
    });
  });

  it("persists mode changes and emits a typed event", () => {
    const state = setAutonomyMode({
      mode: "assistant_plus_autonomy",
      sessionId: "session-a",
      now: 1_000,
    });
    const event = getDb()
      .prepare(`SELECT kind, data_json FROM steward_events WHERE kind = 'autonomy.mode.updated' LIMIT 1`)
      .get() as { kind: string; data_json: string };

    expect(state.mode).toBe("assistant_plus_autonomy");
    expect(event.kind).toBe("autonomy.mode.updated");
    expect(event.data_json).toContain("\"mode\":\"assistant_plus_autonomy\"");
  });

  it("stores boot completion, backoff, blocked reason, and next allowed tick", () => {
    markAutonomyBootCompleted({ completed: true, now: 2_000 });
    setAutonomyIdleBackoff({ idleBackoffMs: 5_000, now: 2_100 });
    recordAutonomyBlocked({
      reason: "cooldown_active",
      now: 2_200,
      nextAllowedTickTs: 9_999,
    });
    markAutonomyTickRan({ now: 3_000, nextAllowedTickTs: 12_000 });

    expect(getAutonomyState()).toEqual({
      mode: "assistant_only",
      lastAutonomyTickTs: 3_000,
      bootCompleted: true,
      idleBackoffMs: 5_000,
      lastBlockedReason: null,
      nextAllowedTickTs: 12_000,
      updatedTs: 3_000,
    });
  });
});
