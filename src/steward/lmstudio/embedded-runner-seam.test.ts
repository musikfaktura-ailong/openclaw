import { describe, expect, it } from "vitest";
import {
  STEWARD_DEFAULT_LOCAL_INFERENCE_LOAD_CONTEXT_LENGTH,
  wrapStreamFnWithStewardLmstudioLifecycle,
} from "./embedded-runner-seam.js";

function createFakeStream(..._args: unknown[]) {
  return {
    async *[Symbol.asyncIterator]() {},
  } as never;
}

describe("embedded-runner-seam", () => {
  it("uses steward-owned default load context instead of provider metadata", async () => {
    const seenRequestedContexts: Array<number | null | undefined> = [];
    const wrapped = wrapStreamFnWithStewardLmstudioLifecycle({
      streamFn: (async () =>
        createFakeStream({
          events: [],
          resultMessage: { role: "assistant", content: "ok" },
        })) as never,
      contextTokenBudget: 64_000,
      ensureLifecycle: async ({ selection }) => {
        seenRequestedContexts.push(selection.requestedContextLength);
        return {
          bypassed: false,
          plan: {
            targetKind: "local_lmstudio_inference",
            action: "load_only",
            targetModelKey: "qwen/qwen3-14b",
            requiredContextLength: STEWARD_DEFAULT_LOCAL_INFERENCE_LOAD_CONTEXT_LENGTH,
            modelsToUnload: [],
            reason: "test",
          },
          queryModelId: "inst-qwen",
        };
      },
    });

    await wrapped(
      {
        provider: "lmstudio",
        id: "mistralai_ministral-3-14b-reasoning-2512@q6_k",
        baseUrl: "http://127.0.0.1:1234",
        contextTokens: 64_000,
        contextWindow: 262_144,
      } as never,
      { messages: [] } as never,
      {},
    );

    expect(seenRequestedContexts).toEqual([STEWARD_DEFAULT_LOCAL_INFERENCE_LOAD_CONTEXT_LENGTH]);
  });

  it("permits an explicitly smaller steward budget", async () => {
    const seenRequestedContexts: Array<number | null | undefined> = [];
    const wrapped = wrapStreamFnWithStewardLmstudioLifecycle({
      streamFn: (async () =>
        createFakeStream({
          events: [],
          resultMessage: { role: "assistant", content: "ok" },
        })) as never,
      contextTokenBudget: 8_192,
      ensureLifecycle: async ({ selection }) => {
        seenRequestedContexts.push(selection.requestedContextLength);
        return {
          bypassed: false,
          plan: {
            targetKind: "local_lmstudio_inference",
            action: "load_only",
            targetModelKey: "qwen/qwen3-14b",
            requiredContextLength: 8_192,
            modelsToUnload: [],
            reason: "test",
          },
          queryModelId: "inst-qwen",
        };
      },
    });

    await wrapped(
      {
        provider: "lmstudio",
        id: "qwen/qwen3-14b",
        baseUrl: "http://127.0.0.1:1234",
        contextTokens: 32_768,
        contextWindow: 32_768,
      } as never,
      { messages: [] } as never,
      {},
    );

    expect(seenRequestedContexts).toEqual([8_192]);
  });
});
