import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { classifyAutonomyWork } from "./work-classifier.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";

describe("WS-IC work classifier", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("classifies goal work when the session has no proof yet", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:auto-goal", 1_000);

    await expect(classifyAutonomyWork({ sessionId: authority.sessionId, now: 2_000 })).resolves.toMatchObject({
      workClass: "goal_work",
      reason: "no_recorded_proof_yet",
    });
    const gap = getDb()
      .prepare(`SELECT gap_kind, work_class, status FROM steward_goal_gaps WHERE session_id = ? ORDER BY id DESC LIMIT 1`)
      .get(authority.sessionId) as { gap_kind: string; work_class: string; status: string };
    expect(gap).toMatchObject({
      gap_kind: "no_recorded_proof_yet",
      work_class: "goal_work",
      status: "open",
    });
  });

  it("classifies diagnostic work when an active blocker exists", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:auto-diagnostic", 1_000);
    const db = getDb();
    db.prepare(
      `INSERT INTO steward_flows (
         session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
       ) VALUES (?, 'control', 'blocked_deterministic', '{}', ?, ?, ?, ?)` ,
    ).run(authority.sessionId, process.pid, 1_000, 1_000, 1_000);
    const flowId = Number((db.prepare(`SELECT id FROM steward_flows ORDER BY id DESC LIMIT 1`).get() as { id: number }).id);
    db.prepare(
      `INSERT INTO steward_blockers (
         flow_id, task_id, blocker_type, status, retry_count, data_json, created_ts, updated_ts
       ) VALUES (?, ?, 'operator_required', 'active', 0, '{}', ?, ?)` ,
    ).run(flowId, flowId, 1_100, 1_100);

    await expect(classifyAutonomyWork({ sessionId: authority.sessionId, now: 2_000 })).resolves.toMatchObject({
      workClass: "diagnostic_work",
      reason: "active_blockers_present",
    });
  });

  it("classifies review work when proofs exist but no audit report has been recorded", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:auto-review", 1_000);
    const db = getDb();
    db.prepare(
      `INSERT INTO steward_proofs (
         task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
         verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
       ) VALUES (NULL, ?, NULL, 'general', 'proof', 'claim', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)` ,
    ).run(authority.sessionId, 1_100, 1_100);
    db.prepare(
      `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
       VALUES (?, ?, NULL, 'runtime.idle', 'idle', '{}')` ,
    ).run(1_200, authority.sessionId);

    await expect(classifyAutonomyWork({ sessionId: authority.sessionId, now: 2_000 })).resolves.toMatchObject({
      workClass: "review_or_consolidation",
      reason: "audit_missing",
    });
  });

  it("classifies tester work after an accepted goal-work proof with no tester verdict yet", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:auto-tester", 1_000);
    getDb()
      .prepare(
        `INSERT INTO steward_goal_gaps (
           id, session_id, source_flow_id, source_host_task_id, gap_kind, work_class, reason, status, title, details, evidence_json, created_ts, updated_ts
         ) VALUES (?, ?, NULL, NULL, 'no_recorded_proof_yet', 'goal_work', 'no_recorded_proof_yet', 'open', 'Gap', 'Details', '{}', ?, ?)`,
      )
      .run(1, authority.sessionId, 1_010, 1_010);
    getDb()
      .prepare(
        `INSERT INTO steward_flows (
           id, session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
         ) VALUES (?, ?, 'research', 'completed', ?, ?, ?, ?, ?)`,
      )
      .run(
        11,
        authority.sessionId,
        JSON.stringify({ seeded_by: "autonomy", autonomy_work_class: "goal_work", host_task_id: 11 }),
        process.pid,
        1_020,
        1_020,
        1_020,
      );
    getDb()
      .prepare(
        `INSERT INTO steward_host_tasks (
           id, session_id, source, status, seed_flow_id, work_class, title, details, created_ts, updated_ts, completed_at
         ) VALUES (?, ?, 'autonomy', 'done', ?, 'goal_work', 'Goal Task', 'Details', ?, ?, ?)`,
      )
      .run(11, authority.sessionId, 11, 1_020, 1_020, 1_020);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (?, ?, ?, ?, 'general', 'Goal Task', 'accepted proof', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)`,
      )
      .run(100, 11, authority.sessionId, 11, 1_030, 1_030);

    await expect(classifyAutonomyWork({ sessionId: authority.sessionId, now: 2_000 })).resolves.toMatchObject({
      decision: "continue_current_gap",
      workClass: "tester_work",
      reason: "tester_required_after_accepted_proof",
      status: "open",
    });
  });

  it("classifies diagnostic work after consecutive failed primary tasks", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:auto-frustration", 1_000);
    const db = getDb();
    db.prepare(
      `INSERT INTO steward_proofs (
         task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
         verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
       ) VALUES (NULL, ?, NULL, 'general', 'proof', 'accepted', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)` ,
    ).run(authority.sessionId, 1_050, 1_050);
    db.prepare(
      `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
       VALUES (?, ?, NULL, 'mission.audit.report', 'audit', '{}')` ,
    ).run(1_060, authority.sessionId);
    for (let index = 0; index < 2; index += 1) {
      db.prepare(
        `INSERT INTO steward_flows (
           session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
         ) VALUES (?, 'research', 'completed', '{}', ?, ?, ?, ?)` ,
      ).run(authority.sessionId, process.pid, 1_100 + index, 1_100 + index, 1_100 + index);
      const flowId = Number((db.prepare(`SELECT id FROM steward_flows ORDER BY id DESC LIMIT 1`).get() as { id: number }).id);
      db.prepare(
        `INSERT INTO steward_flow_tasks (
           flow_id, task_id, role, link_status, created_ts, updated_ts
         ) VALUES (?, ?, 'primary', 'failed', ?, ?)` ,
      ).run(flowId, flowId, 1_100 + index, 1_100 + index);
    }

    await expect(classifyAutonomyWork({ sessionId: authority.sessionId, now: 2_000 })).resolves.toMatchObject({
      workClass: "diagnostic_work",
      reason: "consecutive_primary_failures",
    });
  });

  it("falls through to maintenance work when no higher-priority condition is active", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:auto-maintenance", 1_000);
    const db = getDb();
    db.prepare(
      `INSERT INTO steward_proofs (
         task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
         verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
       ) VALUES (NULL, ?, NULL, 'general', 'proof', 'accepted', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)` ,
    ).run(authority.sessionId, 1_050, 1_050);
    db.prepare(
      `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
       VALUES (?, ?, NULL, 'mission.audit.report', 'audit', '{}')` ,
    ).run(1_060, authority.sessionId);

    await expect(classifyAutonomyWork({ sessionId: authority.sessionId, now: 2_000 })).resolves.toMatchObject({
      decision: "continue_current_gap",
      workClass: "maintenance_work",
      reason: "baseline_maintenance_window",
      status: "open",
    });
  });

  it("returns a resolved stop decision when the goal is complete", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:auto-stop-classifier", 3_000);
    getDb()
      .prepare(
        `INSERT INTO steward_goal_gaps (
           id, session_id, source_flow_id, source_host_task_id, gap_kind, work_class, reason, status, title, details, evidence_json, created_ts, updated_ts
         ) VALUES (2, ?, NULL, NULL, 'tester_required_after_accepted_proof', 'tester_work', 'tester_required_after_accepted_proof', 'open', 'Tester gap', 'Details', '{}', ?, ?)`,
      )
      .run(authority.sessionId, 3_005, 3_005);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES
           (901, NULL, ?, NULL, 'general', 'Goal Task', 'accepted proof', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?),
           (902, NULL, ?, NULL, 'general', 'Tester Task', 'confirmed proof', '', 'accepted', 1, '', 1, 'confirmed', ?, NULL, '', ?)`,
      )
      .run(authority.sessionId, 3_030, 3_030, authority.sessionId, 3_031, 3_031);
    getDb()
      .prepare(
        `INSERT INTO steward_tester_verdicts (
           id, session_id, gap_id, worker_proof_id, tester_proof_id, verdict, challenge_summary, created_ts, updated_ts
         ) VALUES (1, ?, 2, 901, 902, 'confirmed', '', ?, ?)`,
      )
      .run(authority.sessionId, 3_010, 3_010);
    getDb()
      .prepare(
        `INSERT INTO steward_milestones (
           session_id, gap_id, verdict_id, milestone_kind, title, status, evidence_json, created_ts, updated_ts
         ) VALUES (?, 2, 1, 'goal_gap_confirmed', 'Milestone sealed', 'sealed', '{}', ?, ?)`,
      )
      .run(authority.sessionId, 3_020, 3_020);
    getDb()
      .prepare(
        `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
         VALUES (?, ?, NULL, 'mission.audit.report', 'audit', '{}')`,
      )
      .run(3_040, authority.sessionId);

    await expect(classifyAutonomyWork({ sessionId: authority.sessionId, now: 3_100 })).resolves.toMatchObject({
      decision: "stop_completed",
      workClass: "goal_work",
      reason: "goal_completed_after_confirmed_tester_verdict",
      status: "resolved",
      gapKind: "goal_completed",
    });
  });

  it("returns a replanning decision after repeated challenged tester verdicts", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:auto-replan-classifier", 4_000);
    getDb()
      .prepare(
        `INSERT INTO steward_goal_gaps (
           id, session_id, source_flow_id, source_host_task_id, gap_kind, work_class, reason, status, title, details, evidence_json, created_ts, updated_ts
         ) VALUES
           (2, ?, NULL, NULL, 'tester_required_after_accepted_proof', 'tester_work', 'tester_required_after_accepted_proof', 'open', 'Tester gap', 'Details', '{}', ?, ?),
           (3, ?, NULL, NULL, 'tester_required_after_accepted_proof', 'tester_work', 'tester_required_after_accepted_proof', 'open', 'Tester gap 2', 'Details', '{}', ?, ?)`,
      )
      .run(authority.sessionId, 4_005, 4_005, authority.sessionId, 4_006, 4_006);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES
           (1001, NULL, ?, NULL, 'general', 'Goal Task', 'accepted proof', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?),
           (1002, NULL, ?, NULL, 'general', 'Goal Task 2', 'accepted proof', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)`,
      )
      .run(
        authority.sessionId,
        4_030,
        4_030,
        authority.sessionId,
        4_032,
        4_032,
      );
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES
           (1101, NULL, ?, NULL, 'general', 'Tester Task 1', 'challenged proof', '', 'rejected', 0, 'ungrounded', 1, 'challenge', NULL, ?, 'one', ?),
           (1102, NULL, ?, NULL, 'general', 'Tester Task 2', 'challenged proof', '', 'rejected', 0, 'ungrounded', 1, 'challenge', NULL, ?, 'two', ?)`,
      )
      .run(authority.sessionId, 4_031, 4_031, authority.sessionId, 4_033, 4_033);
    getDb()
      .prepare(
        `INSERT INTO steward_tester_verdicts (
           id, session_id, gap_id, worker_proof_id, tester_proof_id, verdict, challenge_summary, created_ts, updated_ts
         ) VALUES
           (1, ?, 2, 1001, 1101, 'challenged', 'one', ?, ?),
           (2, ?, 3, 1002, 1102, 'challenged', 'two', ?, ?)`,
      )
      .run(authority.sessionId, 4_010, 4_010, authority.sessionId, 4_020, 4_020);
    getDb()
      .prepare(
        `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
         VALUES (?, ?, NULL, 'mission.audit.report', 'audit', '{}')`,
      )
      .run(4_040, authority.sessionId);

    await expect(classifyAutonomyWork({ sessionId: authority.sessionId, now: 4_100 })).resolves.toMatchObject({
      decision: "replan_goal",
      workClass: "diagnostic_work",
      reason: "replan_required_after_repeated_challenged_path",
      status: "open",
      gapKind: "replan_required_after_repeated_challenged_path",
    });
  });
});
