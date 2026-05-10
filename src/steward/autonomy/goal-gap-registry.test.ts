import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { recordCurrentAutonomyGoalGap } from "./goal-gap-registry.js";

describe("WS-Z1 goal gap registry", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("records a proof-first open goal gap when no proof exists", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z1-goal-gap", 1_000);

    const gap = await recordCurrentAutonomyGoalGap({
      sessionId: authority.sessionId,
      now: 1_100,
    });

    const gapRow = getDb()
      .prepare(
        `SELECT gap_kind, work_class, reason, status, title
         FROM steward_goal_gaps
         WHERE session_id = ?
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(authority.sessionId) as {
      gap_kind: string;
      work_class: string;
      reason: string;
      status: string;
      title: string;
    };
    const event = getDb()
      .prepare(
        `SELECT kind, data_json
         FROM steward_events
         WHERE session_id = ?
           AND kind = 'autonomy.gap.recorded'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(authority.sessionId) as { kind: string; data_json: string };

    expect(gap).toMatchObject({
      workClass: "goal_work",
      reason: "no_recorded_proof_yet",
      status: "open",
      reused: false,
    });
    expect(gapRow).toMatchObject({
      gap_kind: "no_recorded_proof_yet",
      work_class: "goal_work",
      reason: "no_recorded_proof_yet",
      status: "open",
    });
    expect(gapRow.title).toContain("no recorded proof");
    expect(event.kind).toBe("autonomy.gap.recorded");
    expect(event.data_json).toContain("\"gapKind\":\"no_recorded_proof_yet\"");
    expect(event.data_json).toContain("\"workClass\":\"goal_work\"");
  });

  it("resolves the prior open gap and records a new diagnostic gap after repeated bad maintenance outcomes", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z1-boundary-gap", 2_000);
    await recordCurrentAutonomyGoalGap({
      sessionId: authority.sessionId,
      now: 2_050,
    });

    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (NULL, ?, NULL, 'general', 'proof', 'accepted', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)`,
      )
      .run(authority.sessionId, 2_060, 2_060);
    appendStewardEvent({
      kind: "mission.audit.report",
      message: "audit",
      sessionId: authority.sessionId,
      now: 2_065,
      data: {},
    });

    const insertFailedMaintenance = (flowId: number, taskId: number, ts: number, taskValueLabel: string) => {
      getDb()
        .prepare(
          `INSERT INTO steward_flows (
             id, session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
           ) VALUES (?, ?, 'maintenance', 'completed', ?, ?, ?, ?, ?)`,
        )
        .run(
          flowId,
          authority.sessionId,
          JSON.stringify({ seeded_by: "autonomy", autonomy_work_class: "maintenance_work" }),
          process.pid,
          ts,
          ts,
          ts,
        );
      getDb()
        .prepare(
          `INSERT INTO steward_host_tasks (
             id, session_id, source, status, seed_flow_id, work_class, title, details, created_ts, updated_ts, failed_at
           ) VALUES (?, ?, 'autonomy', 'failed', ?, 'maintenance_work', 'Task', 'Details', ?, ?, ?)`,
        )
        .run(taskId, authority.sessionId, flowId, ts, ts, ts);
      appendStewardEvent({
        kind: "runtime.idle",
        message: "Turn completed",
        sessionId: authority.sessionId,
        flowId,
        now: ts + 1,
        data: {
          taskId,
          proofVerdict: "rejected",
          taskValueLabel,
        },
      });
    };

    insertFailedMaintenance(21, 21, 2_100, "hollow");
    insertFailedMaintenance(22, 22, 2_120, "low_value");

    const gap = await recordCurrentAutonomyGoalGap({
      sessionId: authority.sessionId,
      now: 2_200,
    });

    const rows = getDb()
      .prepare(
        `SELECT gap_kind, work_class, reason, status
         FROM steward_goal_gaps
         WHERE session_id = ?
         ORDER BY id`,
      )
      .all(authority.sessionId) as Array<{
      gap_kind: string;
      work_class: string;
      reason: string;
      status: string;
    }>;

    expect(gap).toMatchObject({
      workClass: "diagnostic_work",
      reason: "repeated_bad_outcomes_for_maintenance_work",
      status: "open",
      reused: false,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      gap_kind: "no_recorded_proof_yet",
      status: "resolved",
    });
    expect(rows[1]).toMatchObject({
      gap_kind: "repeated_bad_outcomes_for_maintenance_work",
      work_class: "diagnostic_work",
      reason: "repeated_bad_outcomes_for_maintenance_work",
      status: "open",
    });
  });

  it("keeps the gap open as goal_work with tester challenge evidence after a challenged tester verdict", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z2-challenge-gap", 4_000);
    await recordCurrentAutonomyGoalGap({
      sessionId: authority.sessionId,
      now: 4_010,
    });
    getDb()
      .prepare(
        `UPDATE steward_goal_gaps
         SET status = 'resolved', updated_ts = ?
         WHERE session_id = ?`,
      )
      .run(4_020, authority.sessionId);
    getDb()
      .prepare(
        `INSERT INTO steward_goal_gaps (
           id, session_id, source_flow_id, source_host_task_id, gap_kind, work_class, reason, status, title, details, evidence_json, created_ts, updated_ts
         ) VALUES (?, ?, ?, ?, 'tester_required_after_accepted_proof', 'tester_work', 'tester_required_after_accepted_proof', 'open', 'Tester gap', 'Details', ?, ?, ?)`,
      )
      .run(
        2,
        authority.sessionId,
        null,
        null,
        JSON.stringify({
          priorGapId: 1,
          workerProofId: 201,
          workerTaskId: 51,
          workerFlowId: 51,
        }),
        4_030,
        4_030,
      );
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (?, NULL, ?, NULL, 'general', 'Worker proof', 'accepted proof', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)`,
      )
      .run(201, authority.sessionId, 4_031, 4_031);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (?, NULL, ?, NULL, 'general', 'Tester proof', 'tester challenge', '', 'rejected', 0, 'ungrounded', 1, 'challenge', NULL, ?, ?, ?)`,
      )
      .run(301, authority.sessionId, "tester found contradiction", 4_032, 4_032);
    getDb()
      .prepare(
        `INSERT INTO steward_tester_verdicts (
           id, session_id, gap_id, worker_proof_id, tester_proof_id, verdict, challenge_summary, created_ts, updated_ts
         ) VALUES (?, ?, ?, ?, ?, 'challenged', ?, ?, ?)`,
      )
      .run(1, authority.sessionId, 2, 201, 301, "tester found contradiction", 4_040, 4_040);

    const gap = await recordCurrentAutonomyGoalGap({
      sessionId: authority.sessionId,
      now: 4_100,
    });

    expect(gap).toMatchObject({
      gapKind: "tester_challenged_worker_proof",
      workClass: "goal_work",
      reason: "tester_challenged_worker_proof",
      status: "open",
    });
    expect(gap.evidence).toMatchObject({
      workerProofId: 201,
      testerProofId: 301,
      challengeSummary: "tester found contradiction",
    });
  });

  it("seals a milestone row after a confirmed tester verdict and exposes the sealed count in gap evidence", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z3-confirmed-gap", 5_000);
    await recordCurrentAutonomyGoalGap({
      sessionId: authority.sessionId,
      now: 5_010,
    });
    getDb()
      .prepare(
        `UPDATE steward_goal_gaps
         SET status = 'resolved', updated_ts = ?
         WHERE session_id = ?`,
      )
      .run(5_020, authority.sessionId);
    getDb()
      .prepare(
        `INSERT INTO steward_goal_gaps (
           id, session_id, source_flow_id, source_host_task_id, gap_kind, work_class, reason, status, title, details, evidence_json, created_ts, updated_ts
         ) VALUES (?, ?, ?, ?, 'tester_required_after_accepted_proof', 'tester_work', 'tester_required_after_accepted_proof', 'open', 'Tester gap', 'Details', ?, ?, ?)`,
      )
      .run(
        2,
        authority.sessionId,
        null,
        null,
        JSON.stringify({
          priorGapId: 1,
          workerProofId: 401,
          workerTaskId: 61,
          workerFlowId: 61,
        }),
        5_030,
        5_030,
      );
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (?, NULL, ?, NULL, 'general', 'Worker Task', 'worker proof', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)` ,
      )
      .run(401, authority.sessionId, 5_035, 5_035);
    getDb()
      .prepare(
        `INSERT INTO steward_flows (
           id, session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
         ) VALUES (?, ?, 'control', 'completed', ?, ?, ?, ?, ?)`,
      )
      .run(
        62,
        authority.sessionId,
        JSON.stringify({
          seeded_by: "autonomy",
          autonomy_work_class: "tester_work",
          gap_evidence: {
            priorGapId: 2,
            workerProofId: 401,
            workerTaskId: 61,
            workerFlowId: 61,
          },
        }),
        process.pid,
        5_040,
        5_040,
        5_040,
      );
    getDb()
      .prepare(
        `INSERT INTO steward_host_tasks (
           id, session_id, source, status, seed_flow_id, work_class, title, details, created_ts, updated_ts, completed_at
         ) VALUES (?, ?, 'autonomy', 'done', ?, 'tester_work', 'Tester Task', 'Details', ?, ?, ?)`,
      )
      .run(62, authority.sessionId, 62, 5_040, 5_040, 5_040);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (?, ?, ?, ?, 'general', 'Tester Task', 'tester confirm', '', 'accepted', 1, '', 1, 'confirmed', ?, NULL, '', ?)` ,
      )
      .run(402, 62, authority.sessionId, 62, 5_050, 5_050);

    const gap = await recordCurrentAutonomyGoalGap({
      sessionId: authority.sessionId,
      now: 5_100,
    });

    const milestone = getDb()
      .prepare(
        `SELECT gap_id, verdict_id, status
         FROM steward_milestones
         WHERE session_id = ?
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(authority.sessionId) as { gap_id: number; verdict_id: number; status: string };
    const event = getDb()
      .prepare(
        `SELECT data_json
         FROM steward_events
         WHERE session_id = ?
           AND kind = 'autonomy.milestone.sealed'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(authority.sessionId) as { data_json: string };

    expect(milestone).toMatchObject({
      gap_id: 2,
      verdict_id: 1,
      status: "sealed",
    });
    expect(event.data_json).toContain("\"verdictId\":1");
    expect(gap.evidence).toMatchObject({
      sealedMilestoneCount: 1,
    });
  });

  it("extracts a reusable skill only once for a reused confirmed milestone", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z4-skill-once", 6_000);
    await recordCurrentAutonomyGoalGap({
      sessionId: authority.sessionId,
      now: 6_010,
    });
    getDb()
      .prepare(
        `UPDATE steward_goal_gaps
         SET status = 'resolved', updated_ts = ?
         WHERE session_id = ?`,
      )
      .run(6_020, authority.sessionId);
    getDb()
      .prepare(
        `INSERT INTO steward_goal_gaps (
           id, session_id, source_flow_id, source_host_task_id, gap_kind, work_class, reason, status, title, details, evidence_json, created_ts, updated_ts
         ) VALUES (?, ?, ?, ?, 'tester_required_after_accepted_proof', 'tester_work', 'tester_required_after_accepted_proof', 'open', 'Tester gap', 'Details', ?, ?, ?)`,
      )
      .run(
        2,
        authority.sessionId,
        null,
        null,
        JSON.stringify({
          priorGapId: 1,
          workerProofId: 501,
          workerTaskId: 71,
          workerFlowId: 71,
        }),
        6_030,
        6_030,
      );
    getDb()
      .prepare(
        `INSERT INTO steward_flows (
           id, session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
         ) VALUES (?, ?, 'research', 'completed', '{}', ?, ?, ?, ?)`,
      )
      .run(71, authority.sessionId, process.pid, 6_034, 6_034, 6_034);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (?, ?, ?, ?, 'general', 'Fix broken import', 'worker proof', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)` ,
      )
      .run(501, 71, authority.sessionId, 71, 6_035, 6_035);
    getDb()
      .prepare(
        `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
         VALUES (?, ?, ?, 'tool.postcheck.normalized', 'Tool postcheck normalized read', ?)`,
      )
      .run(6_036, authority.sessionId, 71, JSON.stringify({ toolName: "read" }));
    getDb()
      .prepare(
        `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
         VALUES (?, ?, ?, 'tool.postcheck.normalized', 'Tool postcheck normalized edit', ?)`,
      )
      .run(6_037, authority.sessionId, 71, JSON.stringify({ toolName: "edit" }));
    getDb()
      .prepare(
        `INSERT INTO steward_flows (
           id, session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
         ) VALUES (?, ?, 'control', 'completed', ?, ?, ?, ?, ?)`,
      )
      .run(
        72,
        authority.sessionId,
        JSON.stringify({
          seeded_by: "autonomy",
          autonomy_work_class: "tester_work",
          gap_evidence: {
            priorGapId: 2,
            workerProofId: 501,
            workerTaskId: 71,
            workerFlowId: 71,
          },
        }),
        process.pid,
        6_040,
        6_040,
        6_040,
      );
    getDb()
      .prepare(
        `INSERT INTO steward_host_tasks (
           id, session_id, source, status, seed_flow_id, work_class, title, details, created_ts, updated_ts, completed_at
         ) VALUES (?, ?, 'autonomy', 'done', ?, 'tester_work', 'Tester Task', 'Details', ?, ?, ?)` ,
      )
      .run(72, authority.sessionId, 72, 6_040, 6_040, 6_040);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (?, ?, ?, ?, 'general', 'Tester Task', 'tester confirm', '', 'accepted', 1, '', 1, 'confirmed', ?, NULL, '', ?)` ,
      )
      .run(502, 72, authority.sessionId, 72, 6_050, 6_050);

    await recordCurrentAutonomyGoalGap({
      sessionId: authority.sessionId,
      now: 6_100,
    });
    await recordCurrentAutonomyGoalGap({
      sessionId: authority.sessionId,
      now: 6_110,
    });

    const count = getDb()
      .prepare(
        `SELECT COUNT(*) AS count
         FROM steward_knowledge
         WHERE session_key = ?
           AND memory_type = 'skill_sequence'`,
      )
      .get(authority.sessionId) as { count: number };

    expect(Number(count.count)).toBe(1);
  });

  it("adds a matched skill reference into future gap evidence when a prior skill matches the proposed gap title", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z4-skill-match", 7_000);
    getDb()
      .prepare(
        `INSERT INTO steward_knowledge (
           session_key, memory_type, text, metadata_json, embedding_blob, embedding_dims, embedding_model, created_ts, updated_ts
         ) VALUES (?, 'skill_sequence', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        authority.sessionId,
        "SKILL_SEQUENCE Autonomy gap no recorded proof yet: read -> edit",
        JSON.stringify({
          title: "Autonomy gap no recorded proof yet",
          normalized: "autonomy gap no recorded proof yet",
          tool_sequence: ["read", "edit"],
        }),
        Buffer.alloc(4),
        1,
        "test",
        7_010,
        7_010,
      );

    const gap = await recordCurrentAutonomyGoalGap({
      sessionId: authority.sessionId,
      now: 7_100,
    });

    expect(gap.evidence).toMatchObject({
      matchedSkillTitle: "Autonomy gap no recorded proof yet",
    });
    expect(Number(gap.evidence.matchedSkillScore ?? 0)).toBeGreaterThanOrEqual(0.3);
    expect(Number(gap.evidence.matchedSkillId ?? 0)).toBeGreaterThan(0);
  });

  it("records a resolved goal_completed gap and decision event when a confirmed path has no remaining semantic gap", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z5-goal-stop", 8_000);
    getDb()
      .prepare(
        `INSERT INTO steward_goal_gaps (
           id, session_id, source_flow_id, source_host_task_id, gap_kind, work_class, reason, status, title, details, evidence_json, created_ts, updated_ts
         ) VALUES (2, ?, NULL, NULL, 'tester_required_after_accepted_proof', 'tester_work', 'tester_required_after_accepted_proof', 'open', 'Tester gap', 'Details', '{}', ?, ?)`,
      )
      .run(authority.sessionId, 8_005, 8_005);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES
           (601, NULL, ?, NULL, 'general', 'Goal Task', 'accepted proof', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?),
           (701, NULL, ?, NULL, 'general', 'Tester Task', 'confirmed proof', '', 'accepted', 1, '', 1, 'confirmed', ?, NULL, '', ?)`,
      )
      .run(authority.sessionId, 8_006, 8_006, authority.sessionId, 8_007, 8_007);
    getDb()
      .prepare(
        `INSERT INTO steward_tester_verdicts (
           id, session_id, gap_id, worker_proof_id, tester_proof_id, verdict, challenge_summary, created_ts, updated_ts
         ) VALUES (1, ?, 2, 601, 701, 'confirmed', '', ?, ?)`,
      )
      .run(authority.sessionId, 8_010, 8_010);
    getDb()
      .prepare(
        `INSERT INTO steward_milestones (
           session_id, gap_id, verdict_id, milestone_kind, title, status, evidence_json, created_ts, updated_ts
         ) VALUES (?, 2, 1, 'goal_gap_confirmed', 'Milestone sealed', 'sealed', '{}', ?, ?)`,
      )
      .run(authority.sessionId, 8_020, 8_020);
    appendStewardEvent({
      kind: "mission.audit.report",
      message: "audit",
      sessionId: authority.sessionId,
      now: 8_040,
      data: {},
    });

    const gap = await recordCurrentAutonomyGoalGap({
      sessionId: authority.sessionId,
      now: 8_100,
    });

    const goalRow = getDb()
      .prepare(
        `SELECT gap_kind, work_class, reason, status
         FROM steward_goal_gaps
         WHERE session_id = ?
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(authority.sessionId) as {
      gap_kind: string;
      work_class: string;
      reason: string;
      status: string;
    };
    const decisionEvent = getDb()
      .prepare(
        `SELECT data_json
         FROM steward_events
         WHERE session_id = ?
           AND kind = 'autonomy.goal.decision'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(authority.sessionId) as { data_json: string };

    expect(gap).toMatchObject({
      decision: "stop_completed",
      gapKind: "goal_completed",
      workClass: "goal_work",
      reason: "goal_completed_after_confirmed_tester_verdict",
      status: "resolved",
    });
    expect(goalRow).toMatchObject({
      gap_kind: "goal_completed",
      work_class: "goal_work",
      reason: "goal_completed_after_confirmed_tester_verdict",
      status: "resolved",
    });
    expect(decisionEvent.data_json).toContain("\"decision\":\"stop_completed\"");
  });

  it("records a diagnostic replanning gap after repeated challenged tester verdicts", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z5-replan-gap", 9_000);
    getDb()
      .prepare(
        `INSERT INTO steward_goal_gaps (
           id, session_id, source_flow_id, source_host_task_id, gap_kind, work_class, reason, status, title, details, evidence_json, created_ts, updated_ts
         ) VALUES
           (2, ?, NULL, NULL, 'tester_required_after_accepted_proof', 'tester_work', 'tester_required_after_accepted_proof', 'open', 'Tester gap', 'Details', '{}', ?, ?),
           (3, ?, NULL, NULL, 'tester_required_after_accepted_proof', 'tester_work', 'tester_required_after_accepted_proof', 'open', 'Tester gap 2', 'Details', '{}', ?, ?)`,
      )
      .run(authority.sessionId, 9_005, 9_005, authority.sessionId, 9_006, 9_006);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES
           (801, NULL, ?, NULL, 'general', 'Goal Task', 'accepted proof', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?),
           (802, NULL, ?, NULL, 'general', 'Goal Task 2', 'accepted proof', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)`,
      )
      .run(
        authority.sessionId,
        9_007,
        9_007,
        authority.sessionId,
        9_009,
        9_009,
      );
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES
           (901, NULL, ?, NULL, 'general', 'Tester Task 1', 'challenged proof', '', 'rejected', 0, 'ungrounded', 1, 'challenge', NULL, ?, 'challenge one', ?),
           (902, NULL, ?, NULL, 'general', 'Tester Task 2', 'challenged proof', '', 'rejected', 0, 'ungrounded', 1, 'challenge', NULL, ?, 'challenge two', ?)`,
      )
      .run(authority.sessionId, 9_008, 9_008, authority.sessionId, 9_010, 9_010);
    getDb()
      .prepare(
        `INSERT INTO steward_tester_verdicts (
           id, session_id, gap_id, worker_proof_id, tester_proof_id, verdict, challenge_summary, created_ts, updated_ts
         ) VALUES
           (1, ?, 2, 801, 901, 'challenged', 'challenge one', ?, ?),
           (2, ?, 3, 802, 902, 'challenged', 'challenge two', ?, ?)`,
      )
      .run(authority.sessionId, 9_010, 9_010, authority.sessionId, 9_020, 9_020);
    appendStewardEvent({
      kind: "mission.audit.report",
      message: "audit",
      sessionId: authority.sessionId,
      now: 9_040,
      data: {},
    });

    const gap = await recordCurrentAutonomyGoalGap({
      sessionId: authority.sessionId,
      now: 9_100,
    });

    const gapRow = getDb()
      .prepare(
        `SELECT gap_kind, work_class, reason, status
         FROM steward_goal_gaps
         WHERE session_id = ?
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(authority.sessionId) as {
      gap_kind: string;
      work_class: string;
      reason: string;
      status: string;
    };

    expect(gap).toMatchObject({
      decision: "replan_goal",
      gapKind: "replan_required_after_repeated_challenged_path",
      workClass: "diagnostic_work",
      reason: "replan_required_after_repeated_challenged_path",
      status: "open",
    });
    expect(gapRow).toMatchObject({
      gap_kind: "replan_required_after_repeated_challenged_path",
      work_class: "diagnostic_work",
      reason: "replan_required_after_repeated_challenged_path",
      status: "open",
    });
  });
});
