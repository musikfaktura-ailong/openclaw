import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { getRemainingTimeSeconds } from "../mission/time-budget.js";
import { storeRelationshipMemory } from "../memory/relationship-memory.js";
import { runStrategyValidationJob } from "./strategy-validation.js";

describe("WS-JC strategy validation job", () => {
  const embedder = async (text: string) =>
    Float32Array.from(text.includes("approved") ? [1, 0, 0, 0] : [0, 1, 0, 0]);

  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("approves a grounded accepted proof, records evidence, and awards validation budget", async () => {
    const sessionKey = "agent:main:webchat:direct:strategy-validation-a";
    const authority = getOrCreateStewardSession(sessionKey, 1_000);
    const db = getDb();
    db.prepare(
      `INSERT INTO steward_proofs (
         task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
         verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
       ) VALUES (11, ?, NULL, 'contribution', 'Validated opportunity', 'proof', 'history', 'accepted', 0.91, '', 1, '', ?, NULL, '', ?)`,
    ).run(authority.sessionId, 2_000, 2_000);
    db.prepare(
      `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
       VALUES (?, ?, NULL, 'mission.task_value.adjudicated', 'task value', ?)`,
    ).run(
      2_100,
      authority.sessionId,
      JSON.stringify({ label: "high_value", score: 9 }),
    );
    const beforeBudget = getRemainingTimeSeconds();

    const result = await runStrategyValidationJob({
      sessionKey,
      now: 3_000,
      embedder,
    });
    const afterBudget = getRemainingTimeSeconds();
    const approvedEvent = db
      .prepare(`SELECT data_json FROM steward_events WHERE kind = 'job.strategy_validation.approved' LIMIT 1`)
      .get() as { data_json: string };
    const storedKnowledge = db
      .prepare(`SELECT metadata_json FROM steward_knowledge WHERE id = ?`)
      .get(result.validationKnowledgeId) as { metadata_json: string };

    expect(result.created).toBe(true);
    expect(result.decision.verdict).toBe("approved");
    expect(result.decision.reason).toBe("approved");
    expect(afterBudget).toBeGreaterThan(beforeBudget);
    expect(approvedEvent.data_json).toContain("\"validationDecision\":{\"verdict\":\"approved\"");
    expect(storedKnowledge.metadata_json).toContain("\"strategy_validation_ref\":true");
  });

  it("rejects blocked candidate state, emits reject evidence, and escalates rejection burn", async () => {
    const sessionKey = "agent:main:webchat:direct:strategy-validation-b";
    const authority = getOrCreateStewardSession(sessionKey, 1_000);
    const db = getDb();
    db.prepare(
      `INSERT INTO steward_proofs (
         task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
         verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
       ) VALUES (12, ?, NULL, 'contribution', 'Blocked opportunity', 'proof', 'history', 'accepted', 0.92, '', 1, '', ?, NULL, '', ?)`,
    ).run(authority.sessionId, 2_000, 2_000);
    await storeRelationshipMemory({
      sessionKey,
      memoryType: "truth_violation",
      payload: { key: "truth_gap", value: "recent truth gap" },
      summary: "TRUTH_VIOLATION truth_gap=recent truth gap",
      importance: 1,
      source: "truth_audit",
      taskId: 12,
      confidenceScore: 1,
      lastVerifiedTs: 2_500,
      truthAudit: {
        auditedAt: 2_500,
        summary: { critical: 1, warn: 0, info: 0 },
        decision: null,
        claimRecord: {
          selectedOpportunity: "blocked opportunity",
          category: "test",
          sourceUrl: "https://example.com/opportunity",
          sourceDomain: "example.com",
          sourceTitle: "Blocked opportunity",
          sourceExcerpt: "blocked",
          sourceExcerptHash: "hash",
          keyMetric: "metric",
          metricNumbers: ["1"],
          initialHypothesis: "hypothesis",
          claimType: "claim",
          uncertaintyBefore: "high",
          uncertaintyAfter: "high",
          nextTestBefore: "before",
          nextTestAfter: "after",
        },
        candidateRecord: {
          opportunityKind: "test",
          sourceKind: "web",
          metricKind: "count",
          metricValue: "1",
          commercialRelevance: "high",
          implementationRelevance: "high",
          decisionRelevance: "high",
          extractReadiness: "ready",
          supportsHypothesis: "yes",
          supportsNextTest: "yes",
        },
        epistemicDelta: {
          newSource: true,
          newMetric: true,
          newClaim: true,
          uncertaintyChanged: false,
          nextTestChanged: true,
          deltaScore: 1,
          mostSimilarSource: "none",
          mostSimilarTopic: "none",
        },
        familyOverlap: {
          familyOverlap: 0,
          sameCategory: false,
          sameDomainFamily: false,
          mostSimilarSource: "none",
          mostSimilarTopic: "none",
          matchedTokens: [],
        },
      },
      now: 2_500,
      embedder,
    });
    const first = await runStrategyValidationJob({
      sessionKey,
      now: 3_000,
      embedder,
    });
    const budgetAfterFirst = getRemainingTimeSeconds();
    const second = await runStrategyValidationJob({
      sessionKey,
      now: first.cooldownUntilTs + 1,
      embedder,
    });
    const budgetAfterSecond = getRemainingTimeSeconds();
    const rejectedEvents = db
      .prepare(`SELECT data_json FROM steward_events WHERE kind = 'job.strategy_validation.rejected' ORDER BY id ASC`)
      .all() as Array<{ data_json: string }>;

    expect(first.decision.verdict).toBe("rejected");
    expect(first.decision.reason).toBe("recent_truth_violation");
    expect(second.decision.verdict).toBe("rejected");
    expect(second.decision.rejectionCount).toBe(2);
    expect(budgetAfterSecond).toBeLessThan(budgetAfterFirst);
    expect(rejectedEvents).toHaveLength(2);
    expect(rejectedEvents[1]!.data_json).toContain("\"validationDecision\":{\"verdict\":\"rejected\"");
    expect(rejectedEvents[1]!.data_json).toContain("\"rejectionCount\":2");
  });

  it("reuses the existing decision while cooldown is still active", async () => {
    const sessionKey = "agent:main:webchat:direct:strategy-validation-c";
    const db = getDb();
    db.prepare(
      `INSERT INTO steward_proofs (
         task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
         verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
       ) VALUES (13, ?, NULL, 'contribution', 'Reusable opportunity', 'proof', 'history', 'accepted', 0.88, '', 1, '', ?, NULL, '', ?)`,
    ).run(getOrCreateStewardSession(sessionKey, 1_000).sessionId, 2_000, 2_000);

    const first = await runStrategyValidationJob({
      sessionKey,
      now: 3_000,
      embedder,
    });
    const second = await runStrategyValidationJob({
      sessionKey,
      now: 3_500,
      embedder,
    });
    const flowCount = db.prepare(`SELECT COUNT(*) AS count FROM steward_flows`).get() as { count: number };

    expect(first.created).toBe(true);
    expect(second.reused).toBe(true);
    expect(second.flowId).toBe(first.flowId);
    expect(second.validationKnowledgeId).toBe(first.validationKnowledgeId);
    expect(flowCount.count).toBe(1);
  });

  it("rejects when the latest proof is not strong enough to validate", async () => {
    const sessionKey = "agent:main:webchat:direct:strategy-validation-d";
    const authority = getOrCreateStewardSession(sessionKey, 1_000);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (14, ?, NULL, 'contribution', 'Weak opportunity', 'proof', 'history', 'accepted', 0.65, '', 1, '', ?, NULL, '', ?)`,
      )
      .run(authority.sessionId, 2_000, 2_000);

    const result = await runStrategyValidationJob({
      sessionKey,
      now: 3_000,
      embedder,
    });

    expect(result.decision.verdict).toBe("rejected");
    expect(result.decision.reason).toBe("proof_score_below_threshold");
  });

  it("writes budget audit events against the validation flow, not the proof flow", async () => {
    const sessionKey = "agent:main:webchat:direct:strategy-validation-flow-audit";
    const authority = getOrCreateStewardSession(sessionKey, 1_000);
    const db = getDb();
    const proofFlowResult = db
      .prepare(
        `INSERT INTO steward_flows (
           session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
         ) VALUES (?, 'research', 'completed', '{}', ?, ?, ?, ?)`,
      )
      .run(authority.sessionId, process.pid, 1_500, 1_500, 1_500) as {
      lastInsertRowid: number | bigint;
    };
    const proofFlowId = Number(proofFlowResult.lastInsertRowid);
    db.prepare(
      `INSERT INTO steward_proofs (
         task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
         verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
       ) VALUES (15, ?, ?, 'contribution', 'Flow audit opportunity', 'proof', 'history', 'accepted', 0.93, '', 1, '', ?, NULL, '', ?)`,
    ).run(authority.sessionId, proofFlowId, 2_000, 2_000);

    const result = await runStrategyValidationJob({
      sessionKey,
      now: 3_000,
      embedder,
    });
    const budgetEvent = db
      .prepare(`SELECT flow_id, data_json FROM steward_events WHERE kind = 'mission.time.updated' ORDER BY id DESC LIMIT 1`)
      .get() as { flow_id: number; data_json: string };

    expect(budgetEvent.flow_id).toBe(result.flowId);
    expect(budgetEvent.flow_id).not.toBe(proofFlowId);
    expect(budgetEvent.data_json).toContain(`"taskId":${result.taskId}`);
  });

  it("rejects when no candidate proof exists", async () => {
    const result = await runStrategyValidationJob({
      sessionKey: "agent:main:webchat:direct:strategy-validation-no-proof",
      now: 3_000,
      embedder,
    });

    expect(result.decision.verdict).toBe("rejected");
    expect(result.decision.reason).toBe("no_candidate_proof");
  });

  it("rejects when the latest proof is not accepted", async () => {
    const sessionKey = "agent:main:webchat:direct:strategy-validation-not-accepted";
    const authority = getOrCreateStewardSession(sessionKey, 1_000);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (16, ?, NULL, 'contribution', 'Rejected opportunity', 'proof', 'history', 'rejected', 0.93, '', 1, '', NULL, ?, 'rejected', ?)`,
      )
      .run(authority.sessionId, 2_000, 2_000);

    const result = await runStrategyValidationJob({
      sessionKey,
      now: 3_000,
      embedder,
    });

    expect(result.decision.verdict).toBe("rejected");
    expect(result.decision.reason).toBe("proof_not_accepted");
  });

  it("rejects when the latest proof is not grounded", async () => {
    const sessionKey = "agent:main:webchat:direct:strategy-validation-not-grounded";
    const authority = getOrCreateStewardSession(sessionKey, 1_000);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (17, ?, NULL, 'contribution', 'Ungrounded opportunity', 'proof', 'history', 'accepted', 0.93, '', 0, '', ?, NULL, '', ?)`,
      )
      .run(authority.sessionId, 2_000, 2_000);

    const result = await runStrategyValidationJob({
      sessionKey,
      now: 3_000,
      embedder,
    });

    expect(result.decision.verdict).toBe("rejected");
    expect(result.decision.reason).toBe("proof_not_grounded");
  });

  it("rejects when the latest task value is low or hollow", async () => {
    const sessionKey = "agent:main:webchat:direct:strategy-validation-low-task-value";
    const authority = getOrCreateStewardSession(sessionKey, 1_000);
    const db = getDb();
    db.prepare(
      `INSERT INTO steward_proofs (
         task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
         verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
       ) VALUES (18, ?, NULL, 'contribution', 'Low value opportunity', 'proof', 'history', 'accepted', 0.93, '', 1, '', ?, NULL, '', ?)`,
    ).run(authority.sessionId, 2_000, 2_000);
    db.prepare(
      `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
       VALUES (?, ?, NULL, 'mission.task_value.adjudicated', 'task value', ?)`,
    ).run(
      2_100,
      authority.sessionId,
      JSON.stringify({ label: "low_value", score: 3 }),
    );

    const result = await runStrategyValidationJob({
      sessionKey,
      now: 3_000,
      embedder,
    });

    expect(result.decision.verdict).toBe("rejected");
    expect(result.decision.reason).toBe("recent_task_value_low");
  });
});
