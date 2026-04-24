import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { adjudicateTaskValue } from "./task-value.js";

describe("WS-E task value and reflection", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("scores truthful operator-serving work and persists event plus ledger memory", async () => {
    const sessionKey = "agent:main:webchat:direct:user-1";
    const session = getOrCreateStewardSession(sessionKey);
    appendStewardEvent({
      kind: "runtime.started",
      message: "operator support continuity protected",
      sessionId: session.sessionId,
      data: { note: "operator support continuity protected" },
    });
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at,
           rejection_reason, created_ts
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        42,
        session.sessionId,
        null,
        "general",
        "Support operator",
        "operator support continuity protected",
        "",
        "accepted",
        0.9,
        "",
        1,
        "grounded",
        1_000,
        null,
        "",
        1_000,
      );

    const result = await adjudicateTaskValue({
      sessionId: session.sessionId,
      sessionKey,
      taskId: 42,
      taskTitle: "Support operator",
      taskResult: "operator support continuity protected",
      proofVerdict: "accepted",
      proofScore: 0.9,
      now: 1_000,
    });

    expect(result.label).toBe("high_value");
    expect(result.reflection.operatorServed).toBe(true);
    const event = getDb()
      .prepare(`SELECT kind FROM steward_events WHERE kind = 'mission.task_value.adjudicated'`)
      .get() as { kind: string };
    expect(event.kind).toBe("mission.task_value.adjudicated");
    const memory = getDb()
      .prepare(`SELECT memory_type FROM steward_memories WHERE memory_type = 'stewardship_ledger'`)
      .get() as { memory_type: string };
    expect(memory.memory_type).toBe("stewardship_ledger");
  });
});
