import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { markAutonomyBootCompleted, setAutonomyMode } from "./autonomy-state.js";
import { evaluateAutonomyRunPolicy } from "./autonomy-policy.js";
import { markRuntimeRunning } from "../runtime/runtime-state-repo.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";

describe("WS-IA autonomy policy", () => {
  const sessionKey = "agent:main:webchat:direct:autonomy-user";

  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("blocks in assistant_only mode by default and persists the reason", () => {
    const decision = evaluateAutonomyRunPolicy({
      sessionKey,
      now: 1_000,
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason: "assistant_only_mode",
      mode: "assistant_only",
      runtimeStatus: "missing",
    });

    const blockedRow = getDb()
      .prepare(`SELECT v FROM steward_kv WHERE k = 'autonomy.last_blocked_reason'`)
      .get() as { v: string };
    expect(blockedRow.v).toBe("assistant_only_mode");
  });

  it("blocks when boot is incomplete even after autonomy is enabled", () => {
    setAutonomyMode({ mode: "assistant_plus_autonomy", now: 1_000 });

    const decision = evaluateAutonomyRunPolicy({
      sessionKey,
      now: 1_100,
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason: "boot_not_complete",
      mode: "assistant_plus_autonomy",
    });
  });

  it("blocks with user_turn_active when the steward runtime is running", () => {
    setAutonomyMode({ mode: "assistant_plus_autonomy", now: 1_000 });
    markAutonomyBootCompleted({ completed: true, now: 1_100 });
    const authority = getOrCreateStewardSession(sessionKey, 1_200);
    markRuntimeRunning({
      sessionKey: authority.sessionId,
      flowId: 17,
      taskId: 17,
      now: 1_300,
    });

    const decision = evaluateAutonomyRunPolicy({
      sessionKey,
      now: 1_400,
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason: "user_turn_active",
      blockedByUserTurn: true,
      runtimeStatus: "running",
    });
  });

  it("returns a typed allowed decision when autonomy is enabled, boot is complete, and no user turn is active", () => {
    setAutonomyMode({ mode: "assistant_plus_autonomy", now: 2_000 });
    markAutonomyBootCompleted({ completed: true, now: 2_100 });

    const decision = evaluateAutonomyRunPolicy({
      sessionKey,
      now: 2_200,
    });

    expect(decision).toMatchObject({
      allowed: true,
      reason: "allowed",
      mode: "assistant_plus_autonomy",
      runtimeStatus: "missing",
      blockedByUserTurn: false,
    });

    const event = getDb()
      .prepare(`SELECT kind FROM steward_events WHERE kind = 'autonomy.policy.allowed' LIMIT 1`)
      .get() as { kind: string };
    expect(event.kind).toBe("autonomy.policy.allowed");
  });

  it("blocks on cooldown and budget when those policy conditions apply", () => {
    setAutonomyMode({ mode: "assistant_plus_autonomy", now: 3_000 });
    markAutonomyBootCompleted({ completed: true, now: 3_100 });
    getDb()
      .prepare(
        `INSERT INTO steward_kv (k, v) VALUES ('autonomy.next_allowed_tick_ts', '5000')
         ON CONFLICT(k) DO UPDATE SET v = excluded.v`,
      )
      .run();

    const cooldownDecision = evaluateAutonomyRunPolicy({
      sessionKey,
      now: 4_000,
    });
    const budgetDecision = evaluateAutonomyRunPolicy({
      sessionKey,
      now: 6_000,
      budgetAvailable: false,
    });

    expect(cooldownDecision.reason).toBe("cooldown_active");
    expect(budgetDecision.reason).toBe("budget_blocked");
  });
});
