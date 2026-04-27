import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import {
  closeStewardDb,
  initStewardDb,
  getDb,
  resetDbForTest,
} from "../steward/db/db-bootstrap.js";
import { wrapToolWithBeforeToolCallHook } from "./pi-tools.before-tool-call.js";

vi.mock("../plugins/hook-runner-global.js", async () => {
  const actual = await vi.importActual<typeof import("../plugins/hook-runner-global.js")>(
    "../plugins/hook-runner-global.js",
  );
  return {
    ...actual,
    getGlobalHookRunner: vi.fn(),
  };
});

const mockGetGlobalHookRunner = vi.mocked(getGlobalHookRunner);

describe("steward precheck at before_tool_call seam", () => {
  beforeEach(() => {
    mockGetGlobalHookRunner.mockReturnValue(null);
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("blocks tool execution on deterministic precheck failure", async () => {
    initStewardDb(":memory:");
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    const tool = wrapToolWithBeforeToolCallHook({ name: "web_search", execute } as any, {
      sessionKey: "agent:main:webchat:direct:user-1",
    });

    await expect(tool.execute("call-1", {}, undefined, {} as never)).rejects.toThrow(
      "web_search requires a non-empty query",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("surfaces reroute guidance for exec URL acquisition attempts", async () => {
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    const tool = wrapToolWithBeforeToolCallHook({ name: "exec", execute } as any);

    await expect(
      tool.execute("call-2", { command: "curl https://example.com" }, undefined, {} as never),
    ).rejects.toThrow("Reroute to web_fetch");
    expect(execute).not.toHaveBeenCalled();
  });

  it("runs postcheck after tool execution and persists normalized artifacts", async () => {
    initStewardDb(":memory:");
    const execute = vi.fn().mockResolvedValue({
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
    });
    const tool = wrapToolWithBeforeToolCallHook({ name: "web_search", execute } as any, {
      sessionKey: "agent:main:webchat:direct:user-1",
    });

    const result = await tool.execute(
      "call-postcheck-live",
      { query: "openclaw" },
      undefined,
      {} as never,
    );

    expect((result as { details: Record<string, unknown> }).details.stewardPostcheck).toEqual(
      expect.objectContaining({
        verdict: "accept",
        artifacts: {
          search_result_set: expect.objectContaining({
            query: "openclaw",
            result_count: 1,
          }),
        },
      }),
    );

    const row = getDb()
      .prepare(
        `SELECT kind, data_json
         FROM steward_events
         WHERE kind = 'tool.postcheck.normalized'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get() as { kind: string; data_json: string };

    expect(row.kind).toBe("tool.postcheck.normalized");
    expect(row.data_json).toContain("\"toolCallId\":\"call-postcheck-live\"");
    expect(row.data_json).toContain("\"search_result_set\"");
  });
});
