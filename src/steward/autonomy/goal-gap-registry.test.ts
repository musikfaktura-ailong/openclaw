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

  it("records a proof-first open goal gap when no proof exists", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z1-goal-gap", 1_000);

    const gap = recordCurrentAutonomyGoalGap({
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

  it("resolves the prior open gap and records a new diagnostic gap after repeated bad maintenance outcomes", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z1-boundary-gap", 2_000);
    recordCurrentAutonomyGoalGap({
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

    const gap = recordCurrentAutonomyGoalGap({
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
});
