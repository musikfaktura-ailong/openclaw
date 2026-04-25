import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import {
  SELF_IMPROVEMENT_COOLDOWN_MS,
  applyImprovementHints,
  buildSelfImprovementPromptContext,
  getHintForTitle,
  runSelfImprovementTick,
} from "./self-improvement.js";

function insertProof(params: {
  sessionId: string;
  taskTitle: string;
  verdict: "accepted" | "rejected";
  reason: string;
  failureClass: string;
  createdTs: number;
}): void {
  getDb()
    .prepare(
      `INSERT INTO steward_proofs (
         task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
         verdict, score, failure_class, grounded, reason, accepted_at, rejected_at,
         rejection_reason, created_ts
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      null,
      params.sessionId,
      null,
      "self_improvement",
      params.taskTitle,
      params.reason,
      "",
      params.verdict,
      params.verdict === "accepted" ? 0.9 : 0.2,
      params.failureClass,
      params.verdict === "accepted" ? 1 : 0,
      params.reason,
      params.verdict === "accepted" ? params.createdTs : null,
      params.verdict === "rejected" ? params.createdTs : null,
      params.verdict === "rejected" ? params.reason : "",
      params.createdTs,
    );
}

describe("WS-H self improvement", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("builds reusable hints from repeated failures and injects them into prompt context", () => {
    const sessionKey = "agent:main:webchat:direct:self-improve";
    const session = getOrCreateStewardSession(sessionKey, 1_000);
    insertProof({
      sessionId: session.sessionId,
      taskTitle: "Fix provider retry loop",
      verdict: "rejected",
      reason: "Missing retry evidence",
      failureClass: "history_mismatch",
      createdTs: 1_000,
    });
    insertProof({
      sessionId: session.sessionId,
      taskTitle: "Fix provider retry loop",
      verdict: "rejected",
      reason: "Missing retry evidence",
      failureClass: "history_mismatch",
      createdTs: 2_000,
    });
    insertProof({
      sessionId: session.sessionId,
      taskTitle: "Fix provider retry loop",
      verdict: "accepted",
      reason: "Used execution history",
      failureClass: "",
      createdTs: 3_000,
    });
    appendStewardEvent({
      kind: "consequence.warning",
      message: "warn",
      sessionId: session.sessionId,
      now: 3_100,
      data: { toolName: "edit" },
    });

    const tick = runSelfImprovementTick({
      sessionId: session.sessionId,
      now: 4_000,
    });
    const promptContext = buildSelfImprovementPromptContext({
      sessionKey,
    });

    expect(tick.improvementsFound).toBe(1);
    expect(tick.applied).toBe(1);
    expect(getHintForTitle("fix provider retry loop")).toContain("Learned from previous attempts");
    expect(promptContext).toContain("## Steward Self-Improvement Hints");
    expect(promptContext).toContain("fix provider retry loop");
  });

  it("enforces cooldown so the same hint is not rewritten every turn", () => {
    const sessionKey = "agent:main:webchat:direct:self-improve-cooldown";
    const session = getOrCreateStewardSession(sessionKey, 1_000);
    insertProof({
      sessionId: session.sessionId,
      taskTitle: "Repair truth evidence",
      verdict: "rejected",
      reason: "No provenance",
      failureClass: "source_missing",
      createdTs: 1_000,
    });
    insertProof({
      sessionId: session.sessionId,
      taskTitle: "Repair truth evidence",
      verdict: "rejected",
      reason: "No provenance",
      failureClass: "source_missing",
      createdTs: 2_000,
    });
    insertProof({
      sessionId: session.sessionId,
      taskTitle: "Repair truth evidence",
      verdict: "accepted",
      reason: "Cited proof history",
      failureClass: "",
      createdTs: 3_000,
    });

    expect(applyImprovementHints({ sessionId: session.sessionId, now: 5_000 })).toBe(1);
    expect(
      applyImprovementHints({
        sessionId: session.sessionId,
        now: 5_000 + SELF_IMPROVEMENT_COOLDOWN_MS - 1,
      }),
    ).toBe(0);
  });
});
