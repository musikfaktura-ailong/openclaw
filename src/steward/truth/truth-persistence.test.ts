import { afterEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { persistTruthAudit } from "./truth-persistence.js";
import { buildClaimRecord } from "./claim-record.js";
import { auditClaimRecord } from "./truth-audit.js";
import { storeKnowledge } from "../memory/knowledge-store.js";

describe("steward truth persistence", () => {
  afterEach(() => {
    resetDbForTest();
  });

  it("persists claim events and truth-violation memories with truth metadata", async () => {
    initStewardDb(":memory:");
    const claim = buildClaimRecord({
      selectedOpportunity: "Acme Pricing API",
      category: "api_service",
      sourceUrl: "https://acme.dev/pricing",
      sourceTitle: "Acme Pricing API",
      sourceContent:
        "Acme Pricing API charges $299 per month. The pricing page states enterprise buyers can start at $299 per month with annual contracts and commercial support. This product page describes pricing and buyer fit but does not support invented claims.",
      keyMetric: "$299 per month",
      initialHypothesis: "Acme Pricing API could support a repeatable operator-useful offer.",
      uncertaintyBefore: "Can this be grounded?",
      uncertaintyAfter: "Can this be grounded?",
      nextTestBefore: "Check direct pricing evidence",
      nextTestAfter: "Check direct pricing evidence",
    });
    const audit = auditClaimRecord({
      priorRecords: [],
      current: claim,
      sourceContent:
        "Acme Pricing API charges $299 per month. The pricing page states enterprise buyers can start at $299 per month with annual contracts and commercial support. This product page describes pricing and buyer fit but does not support invented claims.",
    });
    const persisted = await persistTruthAudit({
      sessionKey: "session-1",
      taskId: 42,
      audit,
      decision: {
        selectedOpportunity: claim.selectedOpportunity,
        sourceUrl: claim.sourceUrl,
        keyMetric: claim.keyMetric,
        score: 3,
        whyChosen: "extract_ready; direct_commercial_signal",
        alternativesConsidered: [],
      },
    });
    const eventKinds = getDb()
      .prepare(`SELECT kind FROM steward_events ORDER BY id`)
      .all() as Array<{ kind: string }>;
    expect(eventKinds.map((row) => row.kind)).toEqual([
      "truth.claim_record",
      "truth.candidate_decision",
    ]);
    const memoryRow = getDb()
      .prepare(
        `SELECT k.metadata_json
         FROM steward_memories m
         JOIN steward_knowledge k ON k.id = m.knowledge_id
         WHERE m.id = ?`,
      )
      .get(persisted.reinforcedMemoryId) as { metadata_json: string };
    const metadata = JSON.parse(memoryRow.metadata_json) as { truth_audit?: { auditedAt?: number } };
    expect(metadata.truth_audit?.auditedAt).toBeTypeOf("number");
  });

  it("rejects truth-sensitive knowledge writes without audit metadata", async () => {
    initStewardDb(":memory:");
    await expect(
      storeKnowledge({
        sessionKey: "session-1",
        memoryType: "truth_violation",
        text: "TRUTH_VIOLATION unsupported_claim",
        metadata: {
          payload: { key: "unsupported_claim", value: "claim lacked evidence" },
        },
      }),
    ).rejects.toThrow("truth_audit_required_for_truth_violation");
    closeStewardDb();
  });
});
