import { describe, expect, it } from "vitest";
import { createDefaultCausalDependencyModel } from "./causal-model.js";

describe("WS-D causal model", () => {
  it("propagates negation transitively and blocks above threshold", () => {
    const result = createDefaultCausalDependencyModel().simulateNegation(["safe_execution"]);

    expect(result.negatedStates).toEqual(
      expect.arrayContaining(["safe_execution", "runtime_stable", "continuity_protected"]),
    );
    expect(result.blocked).toBe(true);
    expect(result.terminalWeight).toBeGreaterThanOrEqual(result.threshold);
  });
});
