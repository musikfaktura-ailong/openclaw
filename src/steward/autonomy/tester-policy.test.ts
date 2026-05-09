import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { recordCurrentAutonomyGoalGap } from "./goal-gap-registry.js";
import { recordLatestTesterVerdict, resolveTesterGapRequirement } from "./tester-policy.js";

describe("WS-Z2 tester policy", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("requires a tester turn after an accepted goal-work proof", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z2-seed-tester", 1_000);
    const gap = recordCurrentAutonomyGoalGap({
      sessionId: authority.sessionId,
      now: 1_050,
    });
    getDb()
      .prepare(
        `INSERT INTO steward_flows (
           id, session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
         ) VALUES (?, ?, 'research', 'completed', ?, ?, ?, ?, ?)`,
      )
      .run(
        10,
        authority.sessionId,
        JSON.stringify({ seeded_by: "autonomy", autonomy_work_class: "goal_work", host_task_id: 10 }),
        process.pid,
        1_100,
        1_100,
        1_100,
      );
    getDb()
      .prepare(
        `INSERT INTO steward_host_tasks (
           id, session_id, source, status, seed_flow_id, work_class, title, details, created_ts, updated_ts, completed_at
         ) VALUES (?, ?, 'autonomy', 'done', ?, 'goal_work', 'Goal Task', 'Details', ?, ?, ?)`,
      )
      .run(10, authority.sessionId, 10, 1_100, 1_100, 1_100);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (?, ?, ?, ?, 'general', 'Goal Task', 'claim', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)`,
      )
      .run(100, 10, authority.sessionId, 10, 1_120, 1_120);

    const requirement = resolveTesterGapRequirement({
      sessionId: authority.sessionId,
      now: 1_200,
    });

    expect(gap.workClass).toBe("goal_work");
    expect(requirement).toMatchObject({
      kind: "tester_required",
      workClass: "tester_work",
      reason: "tester_required_after_accepted_proof",
      gapId: gap.gapId,
      workerProofId: 100,
      workerTaskId: 10,
    });
  });

  it("records a challenged tester verdict from persisted tester flow state", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z2-record-verdict", 2_000);
    const goalGap = recordCurrentAutonomyGoalGap({
      sessionId: authority.sessionId,
      now: 2_050,
    });
    getDb()
      .prepare(
        `INSERT INTO steward_flows (
           id, session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
         ) VALUES (?, ?, 'research', 'completed', ?, ?, ?, ?, ?)`,
      )
      .run(
        10,
        authority.sessionId,
        JSON.stringify({ seeded_by: "autonomy", autonomy_work_class: "goal_work", host_task_id: 10 }),
        process.pid,
        2_060,
        2_060,
        2_060,
      );
    getDb()
      .prepare(
        `INSERT INTO steward_host_tasks (
           id, session_id, source, status, seed_flow_id, work_class, title, details, created_ts, updated_ts, completed_at
         ) VALUES (?, ?, 'autonomy', 'done', ?, 'goal_work', 'Goal Task', 'Details', ?, ?, ?)`,
      )
      .run(10, authority.sessionId, 10, 2_060, 2_060, 2_060);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (?, ?, ?, ?, 'general', 'Goal Task', 'accepted proof', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)`,
      )
      .run(100, 10, authority.sessionId, 10, 2_070, 2_070);
    getDb()
      .prepare(
        `UPDATE steward_goal_gaps
         SET status = 'resolved', updated_ts = ?
         WHERE id = ?`,
      )
      .run(2_090, goalGap.gapId);
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
          priorGapId: goalGap.gapId,
          workerProofId: 100,
          workerTaskId: 10,
          workerFlowId: 10,
          challengeSummary: "tester found contradiction",
        }),
        2_100,
        2_100,
      );
    getDb()
      .prepare(
        `INSERT INTO steward_flows (
           id, session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
         ) VALUES (?, ?, 'control', 'completed', ?, ?, ?, ?, ?)`,
      )
      .run(
        11,
        authority.sessionId,
        JSON.stringify({
          seeded_by: "autonomy",
          autonomy_work_class: "tester_work",
          gap_evidence: {
            priorGapId: 2,
            workerProofId: 100,
            workerTaskId: 10,
            workerFlowId: 10,
            challengeSummary: "tester found contradiction",
          },
        }),
        process.pid,
        2_120,
        2_120,
        2_120,
      );
    getDb()
      .prepare(
        `INSERT INTO steward_host_tasks (
           id, session_id, source, status, seed_flow_id, work_class, title, details, created_ts, updated_ts, failed_at
         ) VALUES (?, ?, 'autonomy', 'failed', ?, 'tester_work', 'Tester Task', 'Details', ?, ?, ?)`,
      )
      .run(11, authority.sessionId, 11, 2_120, 2_120, 2_120);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (?, ?, ?, ?, 'general', 'Tester Task', 'tester challenge', '', 'rejected', 0, 'ungrounded', 1, 'challenge', NULL, ?, ?, ?)`,
      )
      .run(101, 11, authority.sessionId, 11, 2_130, "tester challenge", 2_130);

    const verdict = recordLatestTesterVerdict({
      sessionId: authority.sessionId,
      now: 2_200,
    });

    const row = getDb()
      .prepare(
        `SELECT gap_id, worker_proof_id, tester_proof_id, verdict, challenge_summary
         FROM steward_tester_verdicts
         WHERE session_id = ?
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(authority.sessionId) as {
      gap_id: number;
      worker_proof_id: number;
      tester_proof_id: number;
      verdict: string;
      challenge_summary: string;
    };
    const event = getDb()
      .prepare(
        `SELECT data_json
         FROM steward_events
         WHERE session_id = ?
           AND kind = 'autonomy.tester.verdict'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(authority.sessionId) as { data_json: string };

    expect(verdict).toMatchObject({
      gapId: 2,
      workerProofId: 100,
      testerProofId: 101,
      verdict: "challenged",
      challengeSummary: "tester found contradiction",
    });
    expect(row).toMatchObject({
      gap_id: 2,
      worker_proof_id: 100,
      tester_proof_id: 101,
      verdict: "challenged",
      challenge_summary: "tester found contradiction",
    });
    expect(event.data_json).toContain("\"verdict\":\"challenged\"");
  });
});
