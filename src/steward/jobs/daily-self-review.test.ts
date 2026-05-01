import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import {
  buildDailySelfReviewPrompt,
  buildDailySelfReviewSnapshot,
  extractDailySelfReviewCandidates,
  runDailySelfReviewJob,
} from "./daily-self-review.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";

describe("WS-JA daily self-review job", () => {
  const embedder = async (text: string) =>
    Float32Array.from(
      text.includes("rule") ? [1, 0, 0, 0] : text.includes("pattern") ? [0, 1, 0, 0] : [0, 0, 1, 0],
    );

  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("records one daily review and extracts explicit typed memory lines", async () => {
    const sessionKey = "agent:main:webchat:direct:self-review-a";
    const authority = getOrCreateStewardSession(sessionKey, 1_000);
    getDb()
      .prepare(
        `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
         VALUES (?, ?, NULL, 'runtime.idle', 'idle', '{}')` ,
      )
      .run(1_100, authority.sessionId);

    const result = await runDailySelfReviewJob({
      sessionKey,
      now: Date.UTC(2026, 3, 30, 12, 0, 0),
      embedder,
      reportText: [
        "Concise report",
        "RULE: Never claim proof without grounded evidence",
        "PREF: Keep steward outputs concise",
        "FACT: The autonomy tick is now host-owned",
        "PATTERN[risk=low]: Duplicate autonomy work should back off instead of fan out",
        "PROC[risk=med]: Run focused steward tests before advancement",
      ].join("\n"),
    });

    const flow = getDb()
      .prepare(`SELECT status, state_json FROM steward_flows WHERE id = ?`)
      .get(result.flowId) as { status: string; state_json: string };
    const memories = getDb()
      .prepare(`SELECT memory_type FROM steward_memories ORDER BY id ASC`)
      .all() as Array<{ memory_type: string }>;
    const recordedEvent = getDb()
      .prepare(`SELECT data_json FROM steward_events WHERE kind = 'job.daily_self_review.recorded' LIMIT 1`)
      .get() as { data_json: string };

    expect(result.created).toBe(true);
    expect(result.extractedCount).toBe(5);
    expect(flow.status).toBe("completed");
    expect(flow.state_json).toContain("\"job_type\":\"daily_self_review\"");
    expect(memories.map((row) => row.memory_type)).toEqual([
      "steward_rule",
      "steward_preference",
      "steward_fact",
      "steward_pattern",
      "steward_procedure",
    ]);
    expect(recordedEvent.data_json).toContain("\"extractedCount\":5");
  });

  it("dedupes per UTC day and reuses the existing review record", async () => {
    const sessionKey = "agent:main:webchat:direct:self-review-b";
    const now = Date.UTC(2026, 3, 30, 12, 0, 0);

    const first = await runDailySelfReviewJob({
      sessionKey,
      now,
      embedder,
      reportText: "RULE: Steward rules stay explicit",
    });
    const second = await runDailySelfReviewJob({
      sessionKey,
      now: now + 60_000,
      embedder,
      reportText: "RULE: This second run should reuse",
    });
    const flowCount = getDb()
      .prepare(`SELECT COUNT(*) AS count FROM steward_flows`)
      .get() as { count: number };
    const reusedEvent = getDb()
      .prepare(`SELECT data_json FROM steward_events WHERE kind = 'job.daily_self_review.reused' LIMIT 1`)
      .get() as { data_json: string };

    expect(first.created).toBe(true);
    expect(second.reused).toBe(true);
    expect(second.flowId).toBe(first.flowId);
    expect(flowCount.count).toBe(1);
    expect(reusedEvent.data_json).toContain(`"flowId":${first.flowId}`);
  });

  it("creates a new review flow after the UTC day boundary rolls over", async () => {
    const sessionKey = "agent:main:webchat:direct:self-review-day-rollover";
    const firstNow = Date.UTC(2026, 3, 30, 23, 59, 0);
    const secondNow = Date.UTC(2026, 4, 1, 0, 1, 0);

    const first = await runDailySelfReviewJob({
      sessionKey,
      now: firstNow,
      embedder,
      reportText: "RULE: Last review of the day",
    });
    const second = await runDailySelfReviewJob({
      sessionKey,
      now: secondNow,
      embedder,
      reportText: "RULE: First review of the next UTC day",
    });
    const flowCount = getDb()
      .prepare(`SELECT COUNT(*) AS count FROM steward_flows`)
      .get() as { count: number };
    const reusedCount = getDb()
      .prepare(`SELECT COUNT(*) AS count FROM steward_events WHERE kind = 'job.daily_self_review.reused'`)
      .get() as { count: number };

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(second.reused).toBe(false);
    expect(second.flowId).not.toBe(first.flowId);
    expect(flowCount.count).toBe(2);
    expect(reusedCount.count).toBe(0);
  });

  it("builds a bounded 24h snapshot and prompt and ignores invalid extraction lines", () => {
    const sessionKey = "agent:main:webchat:direct:self-review-c";
    const authority = getOrCreateStewardSession(sessionKey, 1_000);
    getDb()
      .prepare(
        `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
         VALUES (?, ?, NULL, 'proof.accepted', 'accepted', '{}')` ,
      )
      .run(1_200, authority.sessionId);
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (NULL, ?, NULL, 'general', 'proof', 'accepted proof', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)` ,
      )
      .run(authority.sessionId, 1_300, 1_300);

    const snapshot = buildDailySelfReviewSnapshot({
      sessionId: authority.sessionId,
      now: 2_000,
    });
    const prompt = buildDailySelfReviewPrompt(snapshot);
    const candidates = extractDailySelfReviewCandidates(
      [
        "RULE: Keep evidence grounded",
        "RULE: Keep evidence grounded",
        "freeform line",
        `FACT: ${"x".repeat(241)}`,
        "PROC[risk=low]: Run verification before advancement",
      ].join("\n"),
    );

    expect(snapshot.eventCount24h).toBe(1);
    expect(snapshot.acceptedProofCount24h).toBe(1);
    expect(prompt).toContain("Output format:");
    expect(candidates.map((candidate) => candidate.memoryType)).toEqual([
      "steward_rule",
      "steward_procedure",
    ]);
  });

  it("does not emit memory_extracted when the report contains no explicit candidates", async () => {
    const sessionKey = "agent:main:webchat:direct:self-review-no-candidates";

    const result = await runDailySelfReviewJob({
      sessionKey,
      now: Date.UTC(2026, 4, 1, 10, 0, 0),
      embedder,
      reportText: "Concise report only\nSuggested next actions only",
    });
    const extractedCount = getDb()
      .prepare(`SELECT COUNT(*) AS count FROM steward_events WHERE kind = 'job.daily_self_review.memory_extracted'`)
      .get() as { count: number };

    expect(result.extractedCount).toBe(0);
    expect(extractedCount.count).toBe(0);
  });
});
