import { afterEach, describe, expect, it } from "vitest";
import { closeStewardDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { getDb } from "../db/db-bootstrap.js";
import { postcheckToolResult, precheckToolCall } from "./tool-supervisor.js";

describe("tool supervisor precheck", () => {
  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("hard-fails web_search without a query", () => {
    const result = precheckToolCall({
      toolName: "web_search",
      args: {},
    });

    expect(result.verdict).toBe("hard_fail");
    expect(result.reason).toContain("non-empty query");
  });

  it("reroutes exec network acquisition to web_fetch", () => {
    const result = precheckToolCall({
      toolName: "exec",
      args: {
        command: "python -c \"import requests; print(requests.get('https://example.com').text)\"",
      },
    });

    expect(result.verdict).toBe("reroute");
    expect(result.rerouteToolName).toBe("web_fetch");
  });

  it("writes a DB event for reroute verdicts", () => {
    initStewardDb(":memory:");

    const result = precheckToolCall({
      toolName: "exec",
      args: { command: "curl https://example.com" },
      sessionKey: "agent:main:webchat:direct:user-1",
    });

    expect(result.verdict).toBe("reroute");
    const row = getDb()
      .prepare(
        `SELECT kind, data_json
         FROM steward_events
         WHERE kind = 'tool.precheck.blocked'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get() as { kind: string; data_json: string };

    expect(row.kind).toBe("tool.precheck.blocked");
    expect(row.data_json).toContain("reroute");
    expect(row.data_json).toContain("web_fetch");
  });

  it("writes a DB event for deterministic hard-fail verdicts", () => {
    initStewardDb(":memory:");

    const result = precheckToolCall({
      toolName: "web_fetch",
      args: {},
      sessionKey: "agent:main:webchat:direct:user-1",
    });

    expect(result.verdict).toBe("hard_fail");
    const row = getDb()
      .prepare(
        `SELECT kind, message, data_json
         FROM steward_events
         WHERE kind = 'tool.precheck.blocked'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get() as { kind: string; message: string; data_json: string };

    expect(row.kind).toBe("tool.precheck.blocked");
    expect(row.message).toContain("web_fetch");
    expect(row.data_json).toContain("web_fetch");
  });

  it("normalizes web_search results into a canonical artifact contract", () => {
    const { result, postcheck } = postcheckToolResult({
      toolName: "web_search",
      args: { query: "openclaw" },
      result: {
        content: [],
        details: {
          query: "openclaw",
          provider: "demo",
          results: [
            {
              url: "https://example.com/docs",
              title: "Docs",
              snippet: "OpenClaw docs",
              domain: "example.com",
            },
          ],
        },
      },
    });

    expect(postcheck.verdict).toBe("accept");
    expect(postcheck.artifacts.search_result_set).toEqual({
      query: "openclaw",
      provider: "demo",
      result_count: 1,
      results: [
        {
          url: "https://example.com/docs",
          title: "Docs",
          snippet: "OpenClaw docs",
          rank: 1,
          domain: "example.com",
        },
      ],
    });
    expect((result as { details: Record<string, unknown> }).details.stewardPostcheck).toEqual(
      expect.objectContaining({
        verdict: "accept",
      }),
    );
  });

  it("classifies execution failures and persists postcheck evidence", () => {
    initStewardDb(":memory:");

    const { postcheck } = postcheckToolResult({
      toolName: "exec",
      args: { command: "curl https://example.com" },
      sessionKey: "agent:main:webchat:direct:user-1",
      toolCallId: "call-postcheck-1",
      result: {
        content: [],
        details: {
          status: "error",
          error: "connection reset by peer",
        },
      },
    });

    expect(postcheck.verdict).toBe("retry");
    const row = getDb()
      .prepare(
        `SELECT kind, message, data_json
         FROM steward_events
         WHERE kind = 'tool.postcheck.classified'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get() as { kind: string; message: string; data_json: string };

    expect(row.kind).toBe("tool.postcheck.classified");
    expect(row.message).toContain("exec");
    expect(row.data_json).toContain("\"verdict\":\"retry\"");
    expect(row.data_json).toContain("\"toolCallId\":\"call-postcheck-1\"");
  });
});
