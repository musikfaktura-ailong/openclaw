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

describe("steward consequence gate at before_tool_call seam", () => {
  beforeEach(() => {
    mockGetGlobalHookRunner.mockReturnValue(null);
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("blocks protected write actions before execution", async () => {
    initStewardDb(":memory:");
    const execute = vi.fn().mockResolvedValue({ content: [], details: { ok: true } });
    const tool = wrapToolWithBeforeToolCallHook({ name: "write", execute } as any, {
      sessionKey: "agent:main:webchat:direct:user-1",
    });

    await expect(
      tool.execute(
        "call-1",
        { path: "src/steward/mission/stewardship-core.ts", content: "x" },
        undefined,
        {} as never,
      ),
    ).rejects.toThrow("protected steward paths");
    expect(execute).not.toHaveBeenCalled();
  });
});
