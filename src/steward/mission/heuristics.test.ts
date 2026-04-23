import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import {
  getHeuristicPromptContext,
  getHeuristicState,
  onTaskLowValue,
  resetHeuristics,
  shouldForceResearch,
} from "./heuristics.js";

describe("WS-E heuristics", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
    resetHeuristics();
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("updates DB-backed state and exposes prompt context", () => {
    onTaskLowValue();
    onTaskLowValue();
    onTaskLowValue();

    const state = getHeuristicState();
    expect(state.frustration).toBeGreaterThan(0.8);
    expect(state.curiosity).toBeGreaterThan(0.6);
    expect(shouldForceResearch()).toBe(true);
    expect(getHeuristicPromptContext()).toContain("FRUSTRATED");
  });
});
