import { afterEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { evaluateConsequencePolicy } from "./consequence-simulator.js";

afterEach(() => {
  closeStewardDb();
  resetDbForTest();
});

describe("WS-D consequence simulator", () => {
  it("persists warning events for exec actions", async () => {
    initStewardDb(":memory:");
    const result = await evaluateConsequencePolicy({
      toolName: "exec",
      args: { command: "echo hello" },
      sessionKey: "agent:main:webchat:direct:user-1",
    });

    expect(result.recommendation).toBe("WARN");
    const row = getDb()
      .prepare(
        `SELECT kind, data_json
         FROM steward_events
         WHERE kind = 'consequence.warning'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get() as { kind: string; data_json: string };
    expect(row.kind).toBe("consequence.warning");
    expect(row.data_json).toContain("\"toolName\":\"exec\"");
  });

  it("refuses protected write actions and records refusal", async () => {
    initStewardDb(":memory:");
    const result = await evaluateConsequencePolicy({
      toolName: "write",
      args: { path: "src/steward/consequence/consequence-simulator.ts", content: "x" },
      sessionKey: "agent:main:webchat:direct:user-1",
    });

    expect(result.recommendation).toBe("REFUSE");
    const row = getDb()
      .prepare(
        `SELECT kind, data_json
         FROM steward_events
         WHERE kind = 'consequence.refused'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get() as { kind: string; data_json: string };
    expect(row.kind).toBe("consequence.refused");
    expect(row.data_json).toContain("\"recommendation\":\"REFUSE\"");
  });

  it("routes knowledge_store through the deterministic truth gate and reroutes missing provenance", async () => {
    initStewardDb(":memory:");
    const result = await evaluateConsequencePolicy({
      toolName: "knowledge_store",
      args: {
        text: "Unsupported claim",
        confidence: 0.9,
      },
      sessionKey: "agent:main:webchat:direct:user-1",
    });

    expect(result.consequenceClass).toBe("truth_gated");
    expect(result.recommendation).toBe("REROUTE");
    expect(result.rerouteToolName).toBe("web_fetch");
    const row = getDb()
      .prepare(
        `SELECT kind, data_json
         FROM steward_events
         WHERE kind = 'consequence.reroute'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get() as { kind: string; data_json: string };
    expect(row.kind).toBe("consequence.reroute");
    expect(row.data_json).toContain("\"toolName\":\"knowledge_store\"");
  });

  it("allows grounded knowledge_store writes through the deterministic truth gate", async () => {
    initStewardDb(":memory:");
    const result = await evaluateConsequencePolicy({
      toolName: "knowledge_store",
      args: {
        text: "Grounded claim",
        confidence: 0.8,
        provenance_urls: ["https://example.com/source"],
      },
      sessionKey: "agent:main:webchat:direct:user-1",
    });

    expect(result.consequenceClass).toBe("truth_gated");
    expect(result.recommendation).toBe("ALLOW");
    const row = getDb()
      .prepare(
        `SELECT kind, data_json
         FROM steward_events
         WHERE kind = 'consequence.check'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get() as { kind: string; data_json: string };
    expect(row.kind).toBe("consequence.check");
    expect(row.data_json).toContain("\"toolName\":\"knowledge_store\"");
  });
});
