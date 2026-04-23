import { describe, expect, it } from "vitest";
import { evaluateTruthGate } from "./truth-gate.js";

describe("WS-D truth gate", () => {
  it("refuses writes to protected steward paths", () => {
    const result = evaluateTruthGate({
      toolName: "apply_patch",
      args: {
        patch:
          "*** Begin Patch\n*** Update File: src/steward/mission/stewardship-core.ts\n-test\n+test\n*** End Patch\n",
      },
    });

    expect(result.recommendation).toBe("REFUSE");
    expect(result.reason).toContain("protected steward paths");
  });

  it("reroutes knowledge.store when provenance is missing", () => {
    const result = evaluateTruthGate({
      toolName: "knowledge_store",
      args: {
        text: "Store unsupported claim",
        confidence: 0.9,
      },
    });

    expect(result.recommendation).toBe("REROUTE");
    expect("rerouteToolName" in result ? result.rerouteToolName : null).toBe("web_fetch");
  });
});
