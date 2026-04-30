import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { setAutonomyMode } from "./autonomy-state.js";
import { recordAutonomyBootSequence } from "./boot-sequence.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { markRuntimeRunning } from "../runtime/runtime-state-repo.js";

describe("WS-IB boot sequence", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("records a first boot snapshot with a classified next action", () => {
    setAutonomyMode({ mode: "assistant_plus_autonomy", now: 1_000 });

    const record = recordAutonomyBootSequence({
      sessionKey: "agent:main:webchat:direct:boot-a",
      now: 2_000,
    });
    const event = getDb()
      .prepare(
        `SELECT data_json
         FROM steward_events
         WHERE kind = 'autonomy.boot.recorded'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get() as { data_json: string };
    const parsed = JSON.parse(event.data_json) as {
      snapshot: { dbReady: boolean; runtimeStatus: string; autonomyMode: string };
      nextActionClass: string;
      reason: string;
    };
    const bootState = getDb()
      .prepare(`SELECT v FROM steward_kv WHERE k = 'autonomy.boot_completed'`)
      .get() as { v: string };

    expect(record.recorded).toBe(true);
    expect(record.nextActionClass).toBe("seed_first_task");
    expect(record.snapshot.runtimeStatus).toBe("missing");
    expect(parsed.snapshot.dbReady).toBe(true);
    expect(parsed.snapshot.autonomyMode).toBe("assistant_plus_autonomy");
    expect(parsed.nextActionClass).toBe("seed_first_task");
    expect(bootState.v).toBe("true");
  });

  it("is idempotent after boot completion and does not create a second boot record", () => {
    setAutonomyMode({ mode: "assistant_plus_autonomy", now: 1_000 });
    recordAutonomyBootSequence({
      sessionKey: "agent:main:webchat:direct:boot-b",
      now: 2_000,
    });

    const repeat = recordAutonomyBootSequence({
      sessionKey: "agent:main:webchat:direct:boot-b",
      now: 3_000,
    });
    const recordedCount = getDb()
      .prepare(`SELECT COUNT(*) AS count FROM steward_events WHERE kind = 'autonomy.boot.recorded'`)
      .get() as { count: number };
    const skippedCount = getDb()
      .prepare(`SELECT COUNT(*) AS count FROM steward_events WHERE kind = 'autonomy.boot.skipped'`)
      .get() as { count: number };

    expect(repeat.skipped).toBe(true);
    expect(repeat.alreadyCompleted).toBe(true);
    expect(recordedCount.count).toBe(1);
    expect(skippedCount.count).toBe(1);
  });

  it("records blocked/observed boot states in the next action classification", () => {
    const sessionKey = "agent:main:webchat:direct:boot-c";
    setAutonomyMode({ mode: "assistant_plus_autonomy", now: 1_000 });
    const authority = getOrCreateStewardSession(sessionKey, 1_100);
    markRuntimeRunning({
      sessionKey: authority.sessionId,
      flowId: 17,
      taskId: 17,
      now: 1_200,
    });

    const runningRecord = recordAutonomyBootSequence({
      sessionKey,
      now: 1_300,
    });

    expect(runningRecord.snapshot.runtimeStatus).toBe("running");
    expect(runningRecord.nextActionClass).toBe("wait_for_idle");
    expect(runningRecord.reason).toBe("user_turn_active");
  });
});
