import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { createAutonomyHostTask, resolveAutonomySeedPlan } from "./goal-orchestrator.js";

describe("WS-K goal orchestrator", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("derives a proof-first research plan when no steward proof exists", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:ws-k-goal-a", 1_000);

    const plan = resolveAutonomySeedPlan({
      sessionId: authority.sessionId,
      workClass: "goal_work",
      classificationReason: "no_recorded_proof_yet",
      now: Date.UTC(2026, 4, 1, 8, 0, 0),
    });

    expect(plan.flowType).toBe("research");
    expect(plan.role).toBe("primary");
    expect(plan.phase).toBe("pick");
    expect(plan.details).toContain("truth first");
  });

  it("creates a real host-owned autonomy task reference", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:ws-k-goal-b", 1_000);

    const task = createAutonomyHostTask({
      sessionId: authority.sessionId,
      workClass: "goal_work",
      title: "Research pick: steward-vetted opportunity",
      details: "bounded proof-first task",
      now: 2_000,
    });
    const row = getDb()
      .prepare(`SELECT work_class, title, source FROM steward_host_tasks WHERE id = ?`)
      .get(task.taskId) as { work_class: string; title: string; source: string };

    expect(row.work_class).toBe("goal_work");
    expect(row.title).toContain("Research");
    expect(row.source).toBe("autonomy");
  });
});
