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

  it("classifies goal work when the session has no proof yet", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:auto-goal", 1_000);

    expect(classifyAutonomyWork({ sessionId: authority.sessionId, now: 2_000 })).toMatchObject({
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

  it("classifies diagnostic work when an active blocker exists", () => {
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

    expect(classifyAutonomyWork({ sessionId: authority.sessionId, now: 2_000 })).toMatchObject({
      workClass: "diagnostic_work",
      reason: "active_blockers_present",
    });
  });

  it("classifies review work when proofs exist but no audit report has been recorded", () => {
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

    expect(classifyAutonomyWork({ sessionId: authority.sessionId, now: 2_000 })).toMatchObject({
      workClass: "review_or_consolidation",
      reason: "audit_missing",
    });
  });

  it("classifies diagnostic work after consecutive failed primary tasks", () => {
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

    expect(classifyAutonomyWork({ sessionId: authority.sessionId, now: 2_000 })).toMatchObject({
      workClass: "diagnostic_work",
      reason: "consecutive_primary_failures",
    });
  });

  it("falls through to maintenance work when no higher-priority condition is active", () => {
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

    expect(classifyAutonomyWork({ sessionId: authority.sessionId, now: 2_000 })).toMatchObject({
      workClass: "maintenance_work",
      reason: "baseline_maintenance_window",
    });
  });
});
