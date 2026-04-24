import { describe, expect, it } from "vitest";
import { evaluateOperatorHierarchy } from "./operator-hierarchy.js";

describe("WS-E operator hierarchy", () => {
  it("refuses truth violations before task goals", () => {
    const decision = evaluateOperatorHierarchy({
      proposedAction: "invent evidence to make revenue proof look better",
    });

    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.priority).toBe("truth");
      expect(decision.requiredAction).toBe("refuse");
    }
  });
});
