import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { markAutonomyBootCompleted, setAutonomyMode } from "./autonomy-state.js";
import { runAutonomyTick } from "./autonomy-runner.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { markRuntimeRunning } from "../runtime/runtime-state-repo.js";

describe("WS-IC autonomy runner", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("blocks autonomy seeding when a user turn is active", async () => {
    const sessionKey = "agent:main:webchat:direct:auto-blocked";
    setAutonomyMode({ mode: "assistant_plus_autonomy", now: 1_000 });
    markAutonomyBootCompleted({ completed: true, now: 1_050 });
    const authority = getOrCreateStewardSession(sessionKey, 1_100);
    markRuntimeRunning({
      sessionKey: authority.sessionId,
      flowId: 17,
      taskId: 17,
      now: 1_150,
    });

    const result = await runAutonomyTick({
      sessionKey,
      now: 1_200,
    });
    const event = getDb()
      .prepare(
        `SELECT kind, data_json
         FROM steward_events
         WHERE kind = 'autonomy.tick.blocked'
         ORDER BY id DESC
         LIMIT 1` ,
      )
      .get() as { kind: string; data_json: string };

    expect(result.status).toBe("blocked");
    expect(result.reason).toBe("user_turn_active");
    expect(event.kind).toBe("autonomy.tick.blocked");
    expect(event.data_json).toContain("\"reason\":\"user_turn_active\"");
  });

  it("seeds exactly one goal-oriented task when autonomy is eligible", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-runner-"));
    try {
      const sessionKey = "agent:main:webchat:direct:auto-seed";
      const authority = getOrCreateStewardSession(sessionKey, 1_000);
      setAutonomyMode({ mode: "assistant_plus_autonomy", now: 1_050 });
      markAutonomyBootCompleted({ completed: true, now: 1_100 });

      const result = await runAutonomyTick({
        sessionKey,
        artifactRoot: tempRoot,
        now: 1_200,
      });
      const flow = getDb()
        .prepare(`SELECT flow_type, status, state_json FROM steward_flows WHERE session_id = ? ORDER BY id DESC LIMIT 1`)
        .get(authority.sessionId) as { flow_type: string; status: string; state_json: string };
      const tasks = getDb()
        .prepare(`SELECT task_id FROM steward_flow_tasks ORDER BY id DESC LIMIT 1`)
        .get() as { task_id: number };
      const hostTask = getDb()
        .prepare(`SELECT id, title FROM steward_host_tasks ORDER BY id DESC LIMIT 1`)
        .get() as { id: number; title: string };
      const seededEvent = getDb()
        .prepare(`SELECT data_json FROM steward_events WHERE kind = 'autonomy.task.seeded' ORDER BY id DESC LIMIT 1`)
        .get() as { data_json: string };
      const gapEvent = getDb()
        .prepare(`SELECT data_json FROM steward_events WHERE kind = 'autonomy.gap.recorded' ORDER BY id DESC LIMIT 1`)
        .get() as { data_json: string };
      const gapRow = getDb()
        .prepare(`SELECT gap_kind, work_class, status FROM steward_goal_gaps WHERE session_id = ? ORDER BY id DESC LIMIT 1`)
        .get(authority.sessionId) as { gap_kind: string; work_class: string; status: string };

      expect(result).toMatchObject({
        status: "seeded",
        workClass: "goal_work",
        reason: "no_recorded_proof_yet",
      });
      expect(flow.flow_type).toBe("research");
      expect(flow.status).toBe("resumable");
      expect(flow.state_json).toContain("\"seeded_by\":\"autonomy\"");
      expect(flow.state_json).toContain("\"autonomy_work_class\":\"goal_work\"");
      expect(tasks.task_id).toBe(hostTask.id);
      expect(hostTask.title).toContain("Research");
      expect(seededEvent.data_json).toContain("\"workClass\":\"goal_work\"");
      expect(seededEvent.data_json).toContain("\"triageArtifactPath\"");
      expect(gapEvent.data_json).toContain("\"gapKind\":\"no_recorded_proof_yet\"");
      expect(gapRow).toMatchObject({
        gap_kind: "no_recorded_proof_yet",
        work_class: "goal_work",
        status: "open",
      });
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("suppresses duplicate autonomy work and persists noop backoff evidence", async () => {
    const sessionKey = "agent:main:webchat:direct:auto-noop";
    const authority = getOrCreateStewardSession(sessionKey, 1_000);
    setAutonomyMode({ mode: "assistant_plus_autonomy", now: 1_050 });
    markAutonomyBootCompleted({ completed: true, now: 1_100 });
    getDb()
      .prepare(
        `INSERT INTO steward_flows (
           session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
         ) VALUES (?, 'research', 'resumable', ?, ?, ?, ?, ?)` ,
      )
      .run(
        authority.sessionId,
        JSON.stringify({
          seeded_by: "autonomy",
          autonomy_work_class: "goal_work",
          classification_reason: "no_recorded_proof_yet",
        }),
        process.pid,
        1_150,
        1_150,
        1_150,
      );

    const result = await runAutonomyTick({
      sessionKey,
      now: 1_200,
    });
    const noopEvent = getDb()
      .prepare(`SELECT data_json FROM steward_events WHERE kind = 'autonomy.tick.noop' ORDER BY id DESC LIMIT 1`)
      .get() as { data_json: string };
    const nextAllowed = getDb()
      .prepare(`SELECT v FROM steward_kv WHERE k = 'autonomy.next_allowed_tick_ts'`)
      .get() as { v: string };

    expect(result.status).toBe("noop");
    expect(result.reason).toBe("duplicate_seed_suppressed");
    expect(Number(nextAllowed.v)).toBeGreaterThan(1_200);
    expect(noopEvent.data_json).toContain("\"reason\":\"duplicate_seed_suppressed\"");
  });

  it("applies a host-owned class boundary after repeated bad maintenance outcomes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-runner-boundary-"));
    try {
      const sessionKey = "agent:main:webchat:direct:auto-boundary";
      const authority = getOrCreateStewardSession(sessionKey, 2_000);
      setAutonomyMode({ mode: "assistant_plus_autonomy", now: 2_050 });
      markAutonomyBootCompleted({ completed: true, now: 2_100 });
      getDb()
        .prepare(
          `INSERT INTO steward_proofs (
             task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
             verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
           ) VALUES (NULL, ?, NULL, 'general', 'proof', 'accepted', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)` ,
        )
        .run(authority.sessionId, 2_110, 2_110);
      getDb()
        .prepare(
          `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
           VALUES (?, ?, NULL, 'mission.audit.report', 'audit', '{}')` ,
        )
        .run(2_115, authority.sessionId);

      getDb()
        .prepare(
          `INSERT INTO steward_flows (
             id, session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
           ) VALUES (?, ?, 'maintenance', 'completed', ?, ?, ?, ?, ?)` ,
        )
        .run(
          41,
          authority.sessionId,
          JSON.stringify({ seeded_by: "autonomy", autonomy_work_class: "maintenance_work" }),
          process.pid,
          2_120,
          2_120,
          2_120,
        );
      getDb()
        .prepare(
          `INSERT INTO steward_host_tasks (
             id, session_id, source, status, seed_flow_id, work_class, title, details, created_ts, updated_ts
           ) VALUES (?, ?, 'autonomy', 'failed', ?, 'maintenance_work', 'Task 1', 'Details', ?, ?)` ,
        )
        .run(41, authority.sessionId, 41, 2_120, 2_120);
      getDb()
        .prepare(
          `INSERT INTO steward_flows (
             id, session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
           ) VALUES (?, ?, 'maintenance', 'completed', ?, ?, ?, ?, ?)` ,
        )
        .run(
          42,
          authority.sessionId,
          JSON.stringify({ seeded_by: "autonomy", autonomy_work_class: "maintenance_work" }),
          process.pid,
          2_140,
          2_140,
          2_140,
        );
      getDb()
        .prepare(
          `INSERT INTO steward_host_tasks (
             id, session_id, source, status, seed_flow_id, work_class, title, details, created_ts, updated_ts
           ) VALUES (?, ?, 'autonomy', 'failed', ?, 'maintenance_work', 'Task 2', 'Details', ?, ?)` ,
        )
        .run(42, authority.sessionId, 42, 2_140, 2_140);
      getDb()
        .prepare(
          `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
           VALUES (?, ?, ?, 'runtime.idle', 'Turn completed', ?)` ,
        )
        .run(2_141, authority.sessionId, 41, JSON.stringify({ proofVerdict: "rejected", taskValueLabel: "hollow" }));
      getDb()
        .prepare(
          `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
           VALUES (?, ?, ?, 'runtime.idle', 'Turn completed', ?)` ,
        )
        .run(2_142, authority.sessionId, 42, JSON.stringify({ proofVerdict: "rejected", taskValueLabel: "low_value" }));

      const result = await runAutonomyTick({
        sessionKey,
        artifactRoot: tempRoot,
        now: 2_200,
      });
      const seededEvent = getDb()
        .prepare(`SELECT data_json FROM steward_events WHERE kind = 'autonomy.task.seeded' ORDER BY id DESC LIMIT 1`)
        .get() as { data_json: string };
      const boundaryEvent = getDb()
        .prepare(`SELECT data_json FROM steward_events WHERE kind = 'autonomy.progress.policy' ORDER BY id DESC LIMIT 1`)
        .get() as { data_json: string };
      const gapEvent = getDb()
        .prepare(`SELECT data_json FROM steward_events WHERE kind = 'autonomy.gap.recorded' ORDER BY id DESC LIMIT 1`)
        .get() as { data_json: string };

      expect(result).toMatchObject({
        status: "seeded",
        workClass: "diagnostic_work",
        reason: "repeated_bad_outcomes_for_maintenance_work",
      });
      expect(boundaryEvent.data_json).toContain("\"scope\":\"work_class_boundary\"");
      expect(boundaryEvent.data_json).toContain("\"reason\":\"repeated_bad_outcomes_for_maintenance_work\"");
      expect(gapEvent.data_json).toContain("\"gapKind\":\"repeated_bad_outcomes_for_maintenance_work\"");
      expect(seededEvent.data_json).toContain("\"workClass\":\"diagnostic_work\"");
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("seeds tester_work after an accepted goal-work proof", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-runner-tester-"));
    try {
      const sessionKey = "agent:main:webchat:direct:auto-tester";
      const authority = getOrCreateStewardSession(sessionKey, 3_000);
      setAutonomyMode({ mode: "assistant_plus_autonomy", now: 3_050 });
      markAutonomyBootCompleted({ completed: true, now: 3_100 });
      getDb()
        .prepare(
          `INSERT INTO steward_goal_gaps (
             id, session_id, source_flow_id, source_host_task_id, gap_kind, work_class, reason, status, title, details, evidence_json, created_ts, updated_ts
           ) VALUES (?, ?, NULL, NULL, 'no_recorded_proof_yet', 'goal_work', 'no_recorded_proof_yet', 'open', 'Gap', 'Details', '{}', ?, ?)`,
        )
        .run(1, authority.sessionId, 3_110, 3_110);
      getDb()
        .prepare(
          `INSERT INTO steward_flows (
             id, session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
           ) VALUES (?, ?, 'research', 'completed', ?, ?, ?, ?, ?)`,
        )
        .run(
          51,
          authority.sessionId,
          JSON.stringify({ seeded_by: "autonomy", autonomy_work_class: "goal_work", host_task_id: 51 }),
          process.pid,
          3_120,
          3_120,
          3_120,
        );
      getDb()
        .prepare(
          `INSERT INTO steward_host_tasks (
             id, session_id, source, status, seed_flow_id, work_class, title, details, created_ts, updated_ts, completed_at
           ) VALUES (?, ?, 'autonomy', 'done', ?, 'goal_work', 'Goal Task', 'Details', ?, ?, ?)`,
        )
        .run(51, authority.sessionId, 51, 3_120, 3_120, 3_120);
      getDb()
        .prepare(
          `INSERT INTO steward_proofs (
             id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
             verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
           ) VALUES (?, ?, ?, ?, 'general', 'Goal Task', 'accepted proof', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)`,
        )
        .run(201, 51, authority.sessionId, 51, 3_130, 3_130);

      const result = await runAutonomyTick({
        sessionKey,
        artifactRoot: tempRoot,
        now: 3_200,
      });
      const seededEvent = getDb()
        .prepare(`SELECT data_json FROM steward_events WHERE kind = 'autonomy.task.seeded' ORDER BY id DESC LIMIT 1`)
        .get() as { data_json: string };
      const latestFlow = getDb()
        .prepare(`SELECT state_json FROM steward_flows WHERE session_id = ? ORDER BY id DESC LIMIT 1`)
        .get(authority.sessionId) as { state_json: string };

      expect(result).toMatchObject({
        status: "seeded",
        workClass: "tester_work",
        reason: "tester_required_after_accepted_proof",
      });
      expect(seededEvent.data_json).toContain("\"workClass\":\"tester_work\"");
      expect(latestFlow.state_json).toContain("\"gap_kind\":\"tester_required_after_accepted_proof\"");
      expect(latestFlow.state_json).toContain("\"workerProofId\":201");
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("records a queryable no-seed outcome after a host-owned stop decision", async () => {
    const sessionKey = "agent:main:webchat:direct:auto-stop";
    const authority = getOrCreateStewardSession(sessionKey, 4_000);
    setAutonomyMode({ mode: "assistant_plus_autonomy", now: 4_010 });
    markAutonomyBootCompleted({ completed: true, now: 4_020 });
    getDb()
      .prepare(
        `INSERT INTO steward_goal_gaps (
           id, session_id, source_flow_id, source_host_task_id, gap_kind, work_class, reason, status, title, details, evidence_json, created_ts, updated_ts
         ) VALUES (2, ?, NULL, NULL, 'tester_required_after_accepted_proof', 'tester_work', 'tester_required_after_accepted_proof', 'open', 'Tester gap', 'Details', '{}', ?, ?)`,
      )
      .run(authority.sessionId, 4_025, 4_025);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES
           (301, NULL, ?, NULL, 'general', 'Goal Task', 'accepted proof', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?),
           (401, NULL, ?, NULL, 'general', 'Tester Task', 'confirmed proof', '', 'accepted', 1, '', 1, 'confirmed', ?, NULL, '', ?)`,
      )
      .run(authority.sessionId, 4_026, 4_026, authority.sessionId, 4_027, 4_027);
    getDb()
      .prepare(
        `INSERT INTO steward_tester_verdicts (
           id, session_id, gap_id, worker_proof_id, tester_proof_id, verdict, challenge_summary, created_ts, updated_ts
         ) VALUES (1, ?, 2, 301, 401, 'confirmed', '', ?, ?)`,
      )
      .run(authority.sessionId, 4_030, 4_030);
    getDb()
      .prepare(
        `INSERT INTO steward_milestones (
           session_id, gap_id, verdict_id, milestone_kind, title, status, evidence_json, created_ts, updated_ts
         ) VALUES (?, 2, 1, 'goal_gap_confirmed', 'Milestone sealed', 'sealed', '{}', ?, ?)`,
      )
      .run(authority.sessionId, 4_040, 4_040);
    getDb()
      .prepare(
        `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
         VALUES (?, ?, NULL, 'mission.audit.report', 'audit', '{}')`,
      )
      .run(4_060, authority.sessionId);

    const result = await runAutonomyTick({
      sessionKey,
      now: 4_100,
    });
    const decisionEvent = getDb()
      .prepare(`SELECT data_json FROM steward_events WHERE kind = 'autonomy.goal.decision' ORDER BY id DESC LIMIT 1`)
      .get() as { data_json: string };
    const noopEvent = getDb()
      .prepare(`SELECT data_json FROM steward_events WHERE kind = 'autonomy.tick.noop' ORDER BY id DESC LIMIT 1`)
      .get() as { data_json: string };

    expect(result).toMatchObject({
      status: "noop",
      reason: "goal_completed",
      workClass: null,
    });
    expect(decisionEvent.data_json).toContain("\"decision\":\"stop_completed\"");
    expect(noopEvent.data_json).toContain("\"reason\":\"goal_completed\"");
  });
});
