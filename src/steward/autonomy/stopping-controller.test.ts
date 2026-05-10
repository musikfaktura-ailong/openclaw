import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { evaluateAutonomyProgressDecision } from "./stopping-controller.js";

describe("WS-Z5 stopping controller", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("returns stop_completed when a confirmed tester verdict plus sealed milestone closes the current path", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z5-stop", 1_000);
    getDb()
      .prepare(
        `INSERT INTO steward_goal_gaps (
           id, session_id, source_flow_id, source_host_task_id, gap_kind, work_class, reason, status, title, details, evidence_json, created_ts, updated_ts
         ) VALUES (2, ?, NULL, NULL, 'tester_required_after_accepted_proof', 'tester_work', 'tester_required_after_accepted_proof', 'open', 'Tester gap', 'Details', '{}', ?, ?)`,
      )
      .run(authority.sessionId, 1_005, 1_005);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES
           (101, NULL, ?, NULL, 'general', 'Worker proof', 'accepted', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?),
           (201, NULL, ?, NULL, 'general', 'Tester proof', 'confirmed', '', 'accepted', 1, '', 1, 'confirmed', ?, NULL, '', ?)`,
      )
      .run(authority.sessionId, 1_006, 1_006, authority.sessionId, 1_007, 1_007);
    getDb()
      .prepare(
        `INSERT INTO steward_tester_verdicts (
           id, session_id, gap_id, worker_proof_id, tester_proof_id, verdict, challenge_summary, created_ts, updated_ts
         ) VALUES (1, ?, 2, 101, 201, 'confirmed', '', ?, ?)`,
      )
      .run(authority.sessionId, 1_010, 1_010);
    getDb()
      .prepare(
        `INSERT INTO steward_milestones (
           session_id, gap_id, verdict_id, milestone_kind, title, status, evidence_json, created_ts, updated_ts
         ) VALUES (?, 2, 1, 'goal_gap_confirmed', 'Milestone sealed', 'sealed', '{}', ?, ?)`,
      )
      .run(authority.sessionId, 1_020, 1_020);
    const decision = evaluateAutonomyProgressDecision({
      sessionId: authority.sessionId,
      sealedMilestoneCount: 1,
      proposedGap: {
        gapKind: "baseline_maintenance_window",
        workClass: "maintenance_work",
        reason: "baseline_maintenance_window",
        title: "Autonomy gap: bounded maintenance follow-up",
        details: "Details",
        sourceFlowId: null,
        sourceHostTaskId: null,
        evidence: {},
      },
    });

    expect(decision).toMatchObject({
      decision: "stop_completed",
      reason: "goal_completed_after_confirmed_tester_verdict",
    });
  });

  it("returns continue_current_gap when an unresolved tester requirement still exists", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z5-continue", 2_000);

    const decision = evaluateAutonomyProgressDecision({
      sessionId: authority.sessionId,
      sealedMilestoneCount: 0,
      proposedGap: {
        gapKind: "tester_required_after_accepted_proof",
        workClass: "tester_work",
        reason: "tester_required_after_accepted_proof",
        title: "Autonomy gap: independent tester required",
        details: "Details",
        sourceFlowId: 11,
        sourceHostTaskId: 11,
        evidence: {},
      },
    });

    expect(decision).toMatchObject({
      decision: "continue_current_gap",
      reason: "unresolved_gap_remains",
    });
  });

  it("returns replan_goal after repeated challenged tester verdicts", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z5-replan", 3_000);
    getDb()
      .prepare(
        `INSERT INTO steward_goal_gaps (
           id, session_id, source_flow_id, source_host_task_id, gap_kind, work_class, reason, status, title, details, evidence_json, created_ts, updated_ts
         ) VALUES
           (2, ?, NULL, NULL, 'tester_required_after_accepted_proof', 'tester_work', 'tester_required_after_accepted_proof', 'open', 'Tester gap', 'Details', '{}', ?, ?),
           (3, ?, NULL, NULL, 'tester_required_after_accepted_proof', 'tester_work', 'tester_required_after_accepted_proof', 'open', 'Tester gap 2', 'Details', '{}', ?, ?)`,
      )
      .run(authority.sessionId, 3_005, 3_005, authority.sessionId, 3_006, 3_006);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES
           (101, NULL, ?, NULL, 'general', 'Worker proof 1', 'accepted', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?),
           (102, NULL, ?, NULL, 'general', 'Worker proof 2', 'accepted', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)`,
      )
      .run(
        authority.sessionId,
        3_007,
        3_007,
        authority.sessionId,
        3_009,
        3_009,
      );
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES
           (201, NULL, ?, NULL, 'general', 'Tester proof 1', 'challenged', '', 'rejected', 0, 'ungrounded', 1, 'challenge', NULL, ?, 'c1', ?),
           (202, NULL, ?, NULL, 'general', 'Tester proof 2', 'challenged', '', 'rejected', 0, 'ungrounded', 1, 'challenge', NULL, ?, 'c2', ?)`,
      )
      .run(authority.sessionId, 3_008, 3_008, authority.sessionId, 3_010, 3_010);
    getDb()
      .prepare(
        `INSERT INTO steward_tester_verdicts (
           id, session_id, gap_id, worker_proof_id, tester_proof_id, verdict, challenge_summary, created_ts, updated_ts
         ) VALUES
           (1, ?, 2, 101, 201, 'challenged', 'c1', ?, ?),
           (2, ?, 3, 102, 202, 'challenged', 'c2', ?, ?)`,
      )
      .run(authority.sessionId, 3_010, 3_010, authority.sessionId, 3_020, 3_020);
    const decision = evaluateAutonomyProgressDecision({
      sessionId: authority.sessionId,
      sealedMilestoneCount: 0,
      proposedGap: {
        gapKind: "tester_challenged_worker_proof",
        workClass: "goal_work",
        reason: "tester_challenged_worker_proof",
        title: "Autonomy gap: tester challenged worker proof",
        details: "Details",
        sourceFlowId: null,
        sourceHostTaskId: null,
        evidence: {},
      },
    });

    expect(decision).toMatchObject({
      decision: "replan_goal",
      reason: "replan_required_after_repeated_challenged_path",
    });
  });
});
