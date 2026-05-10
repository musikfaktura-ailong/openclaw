import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { countSealedMilestones, sealCurrentMilestone } from "./milestone-registry.js";
import type { RecordedTesterVerdict } from "./tester-policy.js";

describe("WS-Z3 milestone registry", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  function insertGap(sessionId: string, gapId: number, title: string, now: number): void {
    getDb()
      .prepare(
        `INSERT INTO steward_goal_gaps (
           id, session_id, source_flow_id, source_host_task_id, gap_kind, work_class, reason, status, title, details, evidence_json, created_ts, updated_ts
         ) VALUES (?, ?, NULL, NULL, 'tester_required_after_accepted_proof', 'tester_work', 'tester_required_after_accepted_proof', 'resolved', ?, 'Details', '{}', ?, ?)`,
      )
      .run(gapId, sessionId, title, now, now);
  }

  function insertProofRows(sessionId: string, verdictId: number, now: number): void {
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (?, NULL, ?, NULL, 'general', 'Worker proof', 'accepted', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)`,
      )
      .run(100 + verdictId, sessionId, now, now);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (?, NULL, ?, NULL, 'general', 'Tester proof', 'tester result', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)`,
      )
      .run(200 + verdictId, sessionId, now + 1, now + 1);
  }

  function insertVerdictRow(params: {
    sessionId: string;
    gapId: number;
    verdictId: number;
    verdict: "confirmed" | "challenged";
    now: number;
  }): void {
    insertProofRows(params.sessionId, params.verdictId, params.now);
    getDb()
      .prepare(
        `INSERT INTO steward_tester_verdicts (
           id, session_id, gap_id, worker_proof_id, tester_proof_id, verdict, challenge_summary, created_ts, updated_ts
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        params.verdictId,
        params.sessionId,
        params.gapId,
        100 + params.verdictId,
        200 + params.verdictId,
        params.verdict,
        params.verdict === "challenged" ? "contradiction found" : "",
        params.now,
        params.now,
      );
  }

  function confirmedVerdict(sessionId: string, gapId: number, verdictId: number): RecordedTesterVerdict {
    return {
      verdictId,
      sessionId,
      gapId,
      workerProofId: 100 + verdictId,
      testerProofId: 200 + verdictId,
      verdict: "confirmed",
      challengeSummary: "",
    };
  }

  it("seals a milestone after a confirmed tester verdict and emits queryable evidence", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z3-seal", 1_000);
    insertGap(authority.sessionId, 1, "Tester gap", 1_050);
    insertVerdictRow({
      sessionId: authority.sessionId,
      gapId: 1,
      verdictId: 10,
      verdict: "confirmed",
      now: 1_090,
    });

    const milestone = sealCurrentMilestone({
      sessionId: authority.sessionId,
      verdict: confirmedVerdict(authority.sessionId, 1, 10),
      now: 1_100,
    });

    const row = getDb()
      .prepare(
        `SELECT gap_id, verdict_id, milestone_kind, title, status, evidence_json
         FROM steward_milestones
         WHERE session_id = ?`,
      )
      .get(authority.sessionId) as {
      gap_id: number;
      verdict_id: number;
      milestone_kind: string;
      title: string;
      status: string;
      evidence_json: string;
    };
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
      sessionId: authority.sessionId,
      gapId: 1,
      verdictId: 10,
      milestoneKind: "goal_gap_confirmed",
      status: "sealed",
      reused: false,
    });
    expect(row).toMatchObject({
      gap_id: 1,
      verdict_id: 10,
      milestone_kind: "goal_gap_confirmed",
      status: "sealed",
    });
    expect(row.title).toContain("Milestone sealed");
    expect(row.evidence_json).toContain("\"workerProofId\":110");
    expect(event.data_json).toContain("\"verdictId\":10");
    expect(event.data_json).toContain("\"gapId\":1");
    expect(event.data_json).toContain("\"milestoneKind\":\"goal_gap_confirmed\"");
  });

  it("does not seal a milestone after a challenged tester verdict", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z3-challenged", 2_000);
    insertGap(authority.sessionId, 2, "Tester gap", 2_050);
    insertVerdictRow({
      sessionId: authority.sessionId,
      gapId: 2,
      verdictId: 20,
      verdict: "challenged",
      now: 2_090,
    });

    const milestone = sealCurrentMilestone({
      sessionId: authority.sessionId,
      verdict: {
        verdictId: 20,
        sessionId: authority.sessionId,
        gapId: 2,
        workerProofId: 120,
        testerProofId: 220,
        verdict: "challenged",
        challengeSummary: "contradiction found",
      },
      now: 2_100,
    });

    const count = getDb()
      .prepare(`SELECT COUNT(*) AS count FROM steward_milestones WHERE session_id = ?`)
      .get(authority.sessionId) as { count: number };

    expect(milestone).toBeNull();
    expect(Number(count.count)).toBe(0);
  });

  it("counts sealed milestones across sequential confirmed cycles", () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z3-count", 3_000);
    insertGap(authority.sessionId, 3, "Gap 1", 3_010);
    insertGap(authority.sessionId, 4, "Gap 2", 3_020);
    insertVerdictRow({
      sessionId: authority.sessionId,
      gapId: 3,
      verdictId: 30,
      verdict: "confirmed",
      now: 3_090,
    });
    insertVerdictRow({
      sessionId: authority.sessionId,
      gapId: 4,
      verdictId: 31,
      verdict: "confirmed",
      now: 3_091,
    });

    expect(countSealedMilestones(authority.sessionId)).toBe(0);

    sealCurrentMilestone({
      sessionId: authority.sessionId,
      verdict: confirmedVerdict(authority.sessionId, 3, 30),
      now: 3_100,
    });
    expect(countSealedMilestones(authority.sessionId)).toBe(1);

    sealCurrentMilestone({
      sessionId: authority.sessionId,
      verdict: confirmedVerdict(authority.sessionId, 4, 31),
      now: 3_200,
    });
    expect(countSealedMilestones(authority.sessionId)).toBe(2);
  });
});
