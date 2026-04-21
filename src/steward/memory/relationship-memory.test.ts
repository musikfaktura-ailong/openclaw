import { afterEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import {
  injectRelationshipContext,
  recallRelationshipMemory,
  reinforceTruthMemory,
  storeRelationshipMemory,
} from "./relationship-memory.js";

afterEach(() => {
  closeStewardDb();
  resetDbForTest();
});

describe("WS-G relationship memory", () => {
  it("stores relationship memory with provenance and recalls salience-sorted entries", async () => {
    initStewardDb(":memory:");
    const sessionKey = "agent:main:webchat:direct:user-1";
    const embedder = async (text: string) =>
      Float32Array.from(
        text.includes("truth") ? [1, 0, 0, 0] : text.includes("coffee") ? [0, 1, 0, 0] : [0, 0, 1, 0],
      );

    const truthMemoryId = await storeRelationshipMemory({
      sessionKey,
      memoryType: "truth_violation",
      payload: { key: "pricing_claim", value: "unsupported" },
      summary: "truth claim unsupported",
      importance: 0.9,
      confidenceScore: 0.7,
      lastVerifiedTs: Date.now(),
      embedder,
    });
    await storeRelationshipMemory({
      sessionKey,
      memoryType: "operator_preference",
      payload: { key: "coffee", value: "black" },
      summary: "operator likes black coffee",
      importance: 0.95,
      embedder,
    });

    const results = await recallRelationshipMemory({
      sessionKey,
      query: "truth check",
      topK: 3,
      embedder,
    });

    expect(results[0]?.memoryType).toBe("truth_violation");
    expect(results.map((entry) => entry.memoryId)).toContain(truthMemoryId);

    const coffeeRecall = await recallRelationshipMemory({
      sessionKey,
      query: "coffee",
      topK: 6,
      embedder,
    });
    expect(
      coffeeRecall.some(
        (entry) =>
          entry.memoryType === "operator_preference" &&
          entry.payload.key === "coffee" &&
          entry.payload.value === "black",
      ),
    ).toBe(true);

    const injected = await injectRelationshipContext({
      sessionKey,
      query: "coffee truth",
      topK: 6,
      embedder,
    });
    expect(injected).toContain("## Steward Relationship Memory");
    expect(injected).toContain("[truth_violation] pricing_claim=unsupported");
  });

  it("reinforces truth memories in both memory and knowledge rows", async () => {
    initStewardDb(":memory:");
    const memoryId = await storeRelationshipMemory({
      sessionKey: "agent:main:webchat:direct:user-2",
      memoryType: "truth_reinforced",
      payload: { key: "policy", value: "verified" },
      summary: "policy verified",
      importance: 0.8,
      confidenceScore: 0.5,
      lastVerifiedTs: Date.now(),
    });

    expect(reinforceTruthMemory({ memoryId, delta: 0.2, source: "test" })).toBe(true);

    const row = getDb()
      .prepare(
        `SELECT m.confidence_score, k.metadata_json
         FROM steward_memories m
         JOIN steward_knowledge k ON k.id = m.knowledge_id
         WHERE m.id = ?`,
      )
      .get(memoryId) as {
      confidence_score: number;
      metadata_json: string;
    };

    expect(row.confidence_score).toBeCloseTo(0.7, 5);
    expect(JSON.parse(row.metadata_json)).toMatchObject({
      confidence_score: 0.7,
      reinforced_by: "test",
    });
  });
});
