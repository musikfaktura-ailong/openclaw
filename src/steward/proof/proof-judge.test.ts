import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { retrieveSimilarProofExamples } from "./proof-examples.js";
import { judgeAndPersistProof } from "./proof-judge.js";

describe("WS-C proof judge", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("accepts a contribution proof through the deterministic fallback when metrics are preserved", async () => {
    const session = getOrCreateStewardSession("session-proof-a");
    appendStewardEvent({
      kind: "runtime.started",
      message: "validate metrics_observed artifact_validated",
      sessionId: session.sessionId,
      data: {
        metrics: {
          sharpe: 1.24,
          brier: 0.11,
        },
        source: "code.run.stdout",
      },
    });

    const result = await judgeAndPersistProof({
      sessionId: session.sessionId,
      sessionKey: "session-proof-a",
      task: {
        taskType: "contribution",
        title: "Validate stewardship scoring",
      },
      proofText: [
        "evidence_basis=code.run.stdout validate artifact_validated",
        "result=sharpe=1.24 brier=0.11",
        "implication=the scoring change improved the measured output",
        "remaining_uncertainty=needs broader live coverage",
      ].join("\n"),
    });

    expect(result.verdict).toBe("accepted");
    expect(result.failureClass).toBe("");
    expect(result.score).toBeGreaterThanOrEqual(0.65);

    const examples = await retrieveSimilarProofExamples({
      query: "sharpe brier validation output",
      taskType: "contribution",
      labels: ["good"],
      topK: 3,
    });
    expect(examples.length).toBeGreaterThan(0);
  });

  it("rejects an ungrounded learning proof that omits a source", async () => {
    const session = getOrCreateStewardSession("session-proof-b");
    appendStewardEvent({
      kind: "truth.claim_record",
      message: "truth claim recorded",
      sessionId: session.sessionId,
      data: {
        summary: "Fetched a grounded source",
      },
    });

    const result = await judgeAndPersistProof({
      sessionId: session.sessionId,
      sessionKey: "session-proof-b",
      task: {
        taskType: "learning",
        title: "Research integration details",
      },
      proofText: "I learned what to do next and stored it.",
    });

    expect(result.verdict).toBe("rejected");
    expect(result.failureClass).toBe("source_missing");
  });

  it("records novel claim events when the classifier flags a high-confidence novel proof", async () => {
    const session = getOrCreateStewardSession("session-proof-c");
    appendStewardEvent({
      kind: "runtime.started",
      message: "validation history available",
      sessionId: session.sessionId,
    });

    const fakeClassifier = {
      async classifyJson<T>() {
        return {
          grounded: true,
          score: 0.91,
          reason: "Novel grounded proof",
          novel_flag: true,
          novel_confidence: 0.92,
          failure_class: "",
        } as T;
      },
    };

    const result = await judgeAndPersistProof({
      sessionId: session.sessionId,
      sessionKey: "session-proof-c",
      classifier: fakeClassifier,
      task: {
        taskType: "general",
        title: "Novel proof case",
      },
      proofText: "The proof cites the recorded validation history in a new way.",
    });

    expect(result.verdict).toBe("accepted");

    const examples = await retrieveSimilarProofExamples({
      query: "Novel grounded proof",
      taskType: "general",
      topK: 10,
    });
    expect(examples.some((example) => example.metadata.novel_flag === true)).toBe(true);
  });
});
