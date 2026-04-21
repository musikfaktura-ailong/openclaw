import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import {
  closeStewardDb,
  initStewardDb,
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
});
