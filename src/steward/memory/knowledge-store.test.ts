import { afterEach, describe, expect, it } from "vitest";
import { closeStewardDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { searchKnowledge, storeKnowledge } from "./knowledge-store.js";

afterEach(() => {
  closeStewardDb();
  resetDbForTest();
});

describe("WS-G knowledge store", () => {
  it("stores and recalls knowledge entries from the steward DB", async () => {
    initStewardDb(":memory:");
    const embedder = async (text: string) =>
      Float32Array.from(
        text.includes("boundary")
          ? [1, 0, 0, 0]
          : text.includes("routine")
            ? [0, 1, 0, 0]
            : [0, 0, 1, 0],
      );

    await storeKnowledge({
      sessionKey: "agent:main:webchat:direct:user-1",
      text: "operator boundary truth first",
      memoryType: "operator_boundary",
      metadata: { label: "boundary" },
      embedder,
    });
    await storeKnowledge({
      sessionKey: "agent:main:webchat:direct:user-1",
      text: "household routine morning review",
      memoryType: "household_routine",
      metadata: { label: "routine" },
      embedder,
    });

    const results = await searchKnowledge({
      sessionKey: "agent:main:webchat:direct:user-1",
      query: "boundary check",
      topK: 2,
      embedder,
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.memoryType).toBe("operator_boundary");
    expect(results[0]?.metadata).toMatchObject({ label: "boundary" });
  });
});
