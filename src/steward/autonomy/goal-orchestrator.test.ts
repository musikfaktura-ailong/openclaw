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

  it("routes rejected latest proof into repair_rejected_proof planning", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:ws-k-goal-c", 1_000);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (21, ?, NULL, 'contribution', ?, 'proof', 'history', 'rejected', ?, ?, 0, '', NULL, ?, 'rejected', ?)` ,
      )
      .run(authority.sessionId, "Candidate proof", 0.42, "grounding_gap", 2_000, 2_000);

    const plan = resolveAutonomySeedPlan({
      sessionId: authority.sessionId,
      workClass: "goal_work",
      classificationReason: "latest_proof_rejected",
      now: 2_100,
    });

    expect(plan.goalKind).toBe("repair_rejected_proof");
    expect(plan.phase).toBe("prove");
    expect(plan.title).toContain("repair rejected steward proof");
    expect(plan.details).toContain("grounding_gap");
  });

  it("routes accepted latest proof into advance_validated_opportunity planning", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:ws-k-goal-d", 1_000);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (22, ?, NULL, 'contribution', ?, 'proof', 'history', 'accepted', ?, '', 1, '', ?, NULL, '', ?)` ,
      )
      .run(authority.sessionId, "Validated operator-safe opportunity", 0.93, 2_000, 2_000);

    const plan = resolveAutonomySeedPlan({
      sessionId: authority.sessionId,
      workClass: "goal_work",
      classificationReason: "latest_proof_accepted",
      now: 2_100,
    });

    expect(plan.goalKind).toBe("advance_validated_opportunity");
    expect(plan.phase).toBe("commit");
    expect(plan.title).toContain("advance strongest steward opportunity");
    expect(plan.details).toContain("Validated operator-safe opportunity");
  });
});
