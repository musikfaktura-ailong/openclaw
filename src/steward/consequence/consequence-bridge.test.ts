import { describe, expect, it } from "vitest";
import { resolveBridgeDecision } from "./consequence-bridge.js";

describe("WS-D consequence bridge", () => {
  it("maps ALLOW without blocking", () => {
    const result = resolveBridgeDecision("ALLOW", "mutating");

    expect(result.approve).toBe(true);
    expect(result.requireOperatorEscalation).toBe(false);
    expect(result.persistConsequenceEvent).toBe(true);
  });

  it("maps WARN on exec to approval plus escalation", () => {
    const result = resolveBridgeDecision("WARN", "exec_capable");

    expect(result.approve).toBe(true);
    expect(result.requireOperatorEscalation).toBe(true);
    expect(result.persistConsequenceEvent).toBe(true);
  });

  it("maps REROUTE to denial", () => {
    const result = resolveBridgeDecision("REROUTE", "mutating");

    expect(result.approve).toBe(false);
  });

  it("maps REFUSE to denial", () => {
    const result = resolveBridgeDecision("REFUSE", "control_plane");

    expect(result.approve).toBe(false);
    expect(result.persistConsequenceEvent).toBe(true);
  });

  it("maps operator override to approval with metadata", () => {
    const result = resolveBridgeDecision("ALLOW_BY_OPERATOR_OVERRIDE", "mutating");

    expect(result.approve).toBe(true);
    expect(result.operatorOverride).toBe(true);
    expect(result.persistConsequenceEvent).toBe(true);
  });
});
