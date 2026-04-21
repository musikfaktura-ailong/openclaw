import { afterEach, describe, expect, it } from "vitest";
import { closeStewardDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { storeRelationshipMemory } from "./relationship-memory.js";
import { mergeStewardMemoryIntoExtraSystemPrompt } from "./prompt-context.js";

afterEach(() => {
  closeStewardDb();
  resetDbForTest();
});

describe("WS-G prompt seam", () => {
  it("injects steward DB-backed recall into extra system prompt text", async () => {
    initStewardDb(":memory:");
    const sessionKey = "agent:main:webchat:direct:user-3";

    await storeRelationshipMemory({
      sessionKey,
      memoryType: "operator_boundary",
      payload: { key: "truth_first", value: "required" },
      summary: "truth first required",
      importance: 1,
    });

    const merged = await mergeStewardMemoryIntoExtraSystemPrompt({
      sessionKey,
      extraSystemPrompt: "Existing operator note",
    });

    expect(merged).toContain("Existing operator note");
    expect(merged).toContain("## Steward Relationship Memory");
    expect(merged).toContain("[operator_boundary] truth_first=required");
  });
});
