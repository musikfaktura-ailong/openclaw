import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import {
  START_SECONDS,
  adjustTimeBudget,
  applyRejectionBurn,
  getRemainingTimeSeconds,
  setRemainingTimeSeconds,
} from "./time-budget.js";

describe("WS-E time budget", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("initializes from steward_kv and persists adjustment events", () => {
    expect(getRemainingTimeSeconds()).toBe(START_SECONDS);

    const result = adjustTimeBudget({ deltaSeconds: 600, reason: "test_bonus" });

    expect(result.afterSeconds).toBe(START_SECONDS + 600);
    const row = getDb()
      .prepare(`SELECT kind, data_json FROM steward_events WHERE kind = 'mission.time.updated'`)
      .get() as { kind: string; data_json: string };
    expect(row.kind).toBe("mission.time.updated");
    expect(row.data_json).toContain("test_bonus");
  });

  it("uses percentage rejection burn above 48h and fixed burn below", () => {
    setRemainingTimeSeconds(72 * 3600);
    const high = applyRejectionBurn({ rejectionCount: 1 });
    expect(high.deltaSeconds).toBe(-Math.trunc(72 * 3600 * 0.02));

    setRemainingTimeSeconds(24 * 3600);
    const low = applyRejectionBurn({ rejectionCount: 1 });
    expect(low.deltaSeconds).toBe(-1800);
  });
});
