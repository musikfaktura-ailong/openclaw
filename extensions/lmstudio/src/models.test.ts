import {
  SELF_HOSTED_DEFAULT_CONTEXT_WINDOW,
  SELF_HOSTED_DEFAULT_MAX_TOKENS,
} from "openclaw/plugin-sdk/provider-setup";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LMSTUDIO_DEFAULT_LOAD_CONTEXT_LENGTH } from "./defaults.js";
import {
  discoverLmstudioModels,
  ensureLmstudioModelLoaded,
  getLoadedLmstudioModels,
  unloadLmstudioModel,
} from "./models.fetch.js";
import {
  resolveLmstudioInferenceBase,
  resolveLmstudioReasoningCapability,
  resolveLmstudioServerBase,
} from "./models.js";

const fetchWithSsrFGuardMock = vi.hoisted(() => vi.fn());

vi.mock("openclaw/plugin-sdk/ssrf-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openclaw/plugin-sdk/ssrf-runtime")>();
  return {
    ...actual,
    fetchWithSsrFGuard: (...args: unknown[]) => fetchWithSsrFGuardMock(...args),
  };
});

describe("lmstudio-models", () => {
  const asFetch = (mock: unknown) => mock as typeof fetch;
  const parseJsonRequestBody = (init: RequestInit | undefined): unknown => {
    if (typeof init?.body !== "string") {
      throw new Error("Expected request body to be a JSON string");
    }
    return JSON.parse(init.body) as unknown;
  };

  afterEach(() => {
    fetchWithSsrFGuardMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("normalizes LM Studio base URLs", () => {
    expect(resolveLmstudioServerBase()).toBe("http://localhost:1234");
    expect(resolveLmstudioInferenceBase()).toBe("http://localhost:1234/v1");
    expect(resolveLmstudioServerBase("http://localhost:1234/api/v1")).toBe("http://localhost:1234");
    expect(resolveLmstudioInferenceBase("http://localhost:1234/api/v1")).toBe(
      "http://localhost:1234/v1",
    );
    expect(resolveLmstudioServerBase("localhost:1234/api/v1")).toBe("http://localhost:1234");
    expect(resolveLmstudioInferenceBase("localhost:1234/api/v1")).toBe("http://localhost:1234/v1");
  });

  it("resolves reasoning capability for supported and unsupported options", () => {
    expect(resolveLmstudioReasoningCapability({ capabilities: undefined })).toBe(false);
    expect(
      resolveLmstudioReasoningCapability({
        capabilities: {
          reasoning: {
            allowed_options: ["low", "medium", "high"],
            default: "low",
          },
        },
      }),
    ).toBe(true);
    expect(
      resolveLmstudioReasoningCapability({
        capabilities: {
          reasoning: {
            allowed_options: ["off"],
            default: "off",
          },
        },
      }),
    ).toBe(false);
  });

  it("discovers llm models and maps metadata", async () => {
    const fetchMock = vi.fn(async (_url: string | URL) => ({
      ok: true,
      json: async () => ({
        models: [
          {
            type: "llm",
            key: "qwen3-8b-instruct",
            display_name: "Qwen3 8B",
            max_context_length: 262144,
            format: "mlx",
            capabilities: {
              vision: true,
              trained_for_tool_use: true,
              reasoning: {
                allowed_options: ["off", "on"],
                default: "on",
              },
            },
            loaded_instances: [{ id: "inst-1", config: { context_length: 64000 } }],
          },
          {
            type: "llm",
            key: "deepseek-r1",
          },
          {
            type: "embedding",
            key: "text-embedding-nomic-embed-text-v1.5",
          },
          {
            type: "llm",
            key: "   ",
          },
        ],
      }),
    }));

    const models = await discoverLmstudioModels({
      baseUrl: "http://localhost:1234/v1",
      apiKey: "lm-token",
      quiet: false,
      fetchImpl: asFetch(fetchMock),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:1234/api/v1/models",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer lm-token",
        },
      }),
    );

    expect(models).toHaveLength(2);
    expect(models[0]).toEqual({
      id: "qwen3-8b-instruct",
      name: "Qwen3 8B (MLX, vision, tool-use, loaded)",
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: { supportsUsageInStreaming: true },
      contextWindow: 262144,
      contextTokens: LMSTUDIO_DEFAULT_LOAD_CONTEXT_LENGTH,
      maxTokens: SELF_HOSTED_DEFAULT_MAX_TOKENS,
    });
    expect(models[1]).toEqual({
      id: "deepseek-r1",
      name: "deepseek-r1",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: { supportsUsageInStreaming: true },
      contextWindow: SELF_HOSTED_DEFAULT_CONTEXT_WINDOW,
      contextTokens: LMSTUDIO_DEFAULT_LOAD_CONTEXT_LENGTH,
      maxTokens: SELF_HOSTED_DEFAULT_MAX_TOKENS,
    });
  });

  it("skips model load when already loaded", async () => {
    const fetchMock = vi.fn(async (_url: string | URL) => ({
      ok: true,
      json: async () => ({
        models: [
          {
            type: "llm",
            key: "qwen3-8b-instruct",
            loaded_instances: [{ id: "inst-1", config: { context_length: 64000 } }],
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", asFetch(fetchMock));

    await expect(
      ensureLmstudioModelLoaded({
        baseUrl: "http://localhost:1234/v1",
        modelKey: "qwen3-8b-instruct",
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls).not.toContain("http://localhost:1234/api/v1/models/load");
  });

  it("reloads model when requested context length exceeds the loaded window", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith("/api/v1/models")) {
        return {
          ok: true,
          json: async () => ({
            models: [
              {
                type: "llm",
                key: "qwen3-8b-instruct",
                max_context_length: 32768,
                loaded_instances: [{ id: "inst-1", config: { context_length: 4096 } }],
              },
            ],
          }),
        };
      }
      if (String(url).endsWith("/api/v1/models/load")) {
        return {
          ok: true,
          json: async () => ({ status: "loaded" }),
          requestInit: init,
        };
      }
      if (String(url).endsWith("/api/v1/models/unload")) {
        return {
          ok: true,
          json: async () => ({ status: "unloaded" }),
          requestInit: init,
        };
      }
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
    });
    vi.stubGlobal("fetch", asFetch(fetchMock));

    await expect(
      ensureLmstudioModelLoaded({
        baseUrl: "http://localhost:1234/v1",
        modelKey: "qwen3-8b-instruct",
        requestedContextLength: 8192,
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const loadCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/models/load"));
    expect(loadCall).toBeDefined();
    const unloadCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith("/models/unload"),
    );
    expect(unloadCall).toBeDefined();
    const loadInit = loadCall?.[1] as RequestInit;
    const loadBody = parseJsonRequestBody(loadInit) as { context_length: number };
    expect(loadBody.context_length).toBe(8192);
  });

  it("discovers loaded LM Studio instances in normalized helper form", async () => {
    const fetchMock = vi.fn(async (_url: string | URL) => ({
      ok: true,
      json: async () => ({
        models: [
          {
            type: "llm",
            key: "lmstudio/qwen3-8b-instruct",
            loaded_instances: [{ id: "qwen3-8b-instruct-mlx", config: { context_length: 16384 } }],
          },
          {
            type: "embedding",
            key: "nomic-embed-text-v1.5",
            loaded_instances: [{ id: "embed-inst-1", config: { context_length: 4096 } }],
          },
        ],
      }),
    }));

    await expect(
      getLoadedLmstudioModels({
        baseUrl: "http://localhost:1234/v1",
        fetchImpl: asFetch(fetchMock),
      }),
    ).resolves.toEqual([
      {
        modelKey: "qwen3-8b-instruct",
        instanceId: "qwen3-8b-instruct-mlx",
        contextLength: 16384,
        kind: "inference",
      },
      {
        modelKey: "nomic-embed-text-v1.5",
        instanceId: "embed-inst-1",
        contextLength: 4096,
        kind: "embedding",
      },
    ]);
  });

  it("throws when loaded-model discovery cannot reach LM Studio", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("connection refused");
    });

    await expect(
      getLoadedLmstudioModels({
        baseUrl: "http://localhost:1234/v1",
        fetchImpl: asFetch(fetchMock),
      }),
    ).rejects.toThrow("LM Studio model discovery failed: Error: connection refused");
  });

  it("unloads a loaded model by instance id", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith("/api/v1/models/unload")) {
        return {
          ok: true,
          json: async () => ({ status: "unloaded" }),
          requestInit: init,
        };
      }
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
    });

    await expect(
      unloadLmstudioModel({
        baseUrl: "http://localhost:1234/v1",
        instanceId: "inst-qwen-1",
        fetchImpl: asFetch(fetchMock),
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:1234/api/v1/models/unload",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ instance_id: "inst-qwen-1" }),
      }),
    );
  });

  it("reloads model to the clamped default target when already loaded below the default window", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith("/api/v1/models")) {
        return {
          ok: true,
          json: async () => ({
            models: [
              {
                type: "llm",
                key: "qwen3-8b-instruct",
                max_context_length: 32768,
                loaded_instances: [{ id: "inst-1", config: { context_length: 4096 } }],
              },
            ],
          }),
        };
      }
      if (String(url).endsWith("/api/v1/models/load")) {
        return {
          ok: true,
          json: async () => ({ status: "loaded" }),
          requestInit: init,
        };
      }
      if (String(url).endsWith("/api/v1/models/unload")) {
        return {
          ok: true,
          json: async () => ({ status: "unloaded" }),
          requestInit: init,
        };
      }
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
    });
    vi.stubGlobal("fetch", asFetch(fetchMock));

    await expect(
      ensureLmstudioModelLoaded({
        baseUrl: "http://localhost:1234/v1",
        modelKey: "qwen3-8b-instruct",
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const loadCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/models/load"));
    expect(loadCall).toBeDefined();
    const unloadCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith("/models/unload"),
    );
    expect(unloadCall).toBeDefined();
    const loadInit = loadCall?.[1] as RequestInit;
    const loadBody = parseJsonRequestBody(loadInit) as { context_length: number };
    expect(loadBody.context_length).toBe(32768);
  });

  it("unloads all loaded instances for a matching model before reload", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith("/api/v1/models")) {
        return {
          ok: true,
          json: async () => ({
            models: [
              {
                type: "llm",
                key: "Qwen3-8B-Instruct",
                max_context_length: 32768,
                loaded_instances: [
                  { id: "inst-1", config: { context_length: 2048 } },
                  { id: "inst-2", config: { context_length: 4096 } },
                ],
              },
            ],
          }),
        };
      }
      if (String(url).endsWith("/api/v1/models/unload")) {
        return {
          ok: true,
          json: async () => ({ status: "unloaded" }),
          requestInit: init,
        };
      }
      if (String(url).endsWith("/api/v1/models/load")) {
        return {
          ok: true,
          json: async () => ({ status: "loaded" }),
          requestInit: init,
        };
      }
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
    });
    vi.stubGlobal("fetch", asFetch(fetchMock));

    await expect(
      ensureLmstudioModelLoaded({
        baseUrl: "http://localhost:1234/v1",
        modelKey: "qwen3-8b-instruct",
        requestedContextLength: 8192,
      }),
    ).resolves.toBeUndefined();

    const unloadCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith("/api/v1/models/unload"),
    );
    expect(unloadCalls).toHaveLength(2);
    expect(unloadCalls.map((call) => parseJsonRequestBody(call[1] as RequestInit))).toEqual([
      { instance_id: "inst-1" },
      { instance_id: "inst-2" },
    ]);
  });

  it("loads model with clamped context length and merged headers", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith("/api/v1/models")) {
        return {
          ok: true,
          json: async () => ({
            models: [
              {
                type: "llm",
                key: "qwen3-8b-instruct",
                max_context_length: 32768,
                loaded_instances: [],
              },
            ],
          }),
        };
      }
      if (String(url).endsWith("/api/v1/models/load")) {
        return {
          ok: true,
          json: async () => ({ status: "loaded" }),
          requestInit: init,
        };
      }
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
    });
    vi.stubGlobal("fetch", asFetch(fetchMock));

    await expect(
      ensureLmstudioModelLoaded({
        baseUrl: "http://localhost:1234/v1",
        apiKey: "lm-token",
        headers: {
          "X-Proxy-Auth": "required",
          Authorization: "Bearer override",
        },
        modelKey: " qwen3-8b-instruct ",
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const loadCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/models/load"));
    expect(loadCall).toBeDefined();
    expect(loadCall?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "X-Proxy-Auth": "required",
        Authorization: "Bearer lm-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen3-8b-instruct",
        context_length: 32768,
      }),
    });
    const loadInit = loadCall![1] as RequestInit;
    const loadBody = parseJsonRequestBody(loadInit) as { context_length: number };
    expect(loadBody.context_length).not.toBe(LMSTUDIO_DEFAULT_LOAD_CONTEXT_LENGTH);
  });

  it("matches configured model key against longer loaded LM Studio key variants", async () => {
    const fetchMock = vi.fn(async (_url: string | URL) => ({
      ok: true,
      json: async () => ({
        models: [
          {
            type: "llm",
            key: "lmstudio/qwen3-8b-instruct-mlx-4bit",
            max_context_length: 32768,
            loaded_instances: [{ id: "inst-1", config: { context_length: 16384 } }],
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", asFetch(fetchMock));

    await expect(
      ensureLmstudioModelLoaded({
        baseUrl: "http://localhost:1234/v1",
        modelKey: "qwen3-8b-instruct",
        requestedContextLength: 8192,
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls).not.toContain("http://localhost:1234/api/v1/models/load");
    expect(calledUrls).not.toContain("http://localhost:1234/api/v1/models/unload");
  });

  it("does not treat short configured prefixes as a model match", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).endsWith("/api/v1/models")) {
        return {
          ok: true,
          json: async () => ({
            models: [
              {
                type: "llm",
                key: "qwen3-8b-instruct-mlx-4bit",
                max_context_length: 32768,
                loaded_instances: [{ id: "inst-1", config: { context_length: 16384 } }],
              },
            ],
          }),
        };
      }
      if (String(url).endsWith("/api/v1/models/load")) {
        return {
          ok: true,
          json: async () => ({ status: "loaded" }),
          requestInit: init,
        };
      }
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
    });
    vi.stubGlobal("fetch", asFetch(fetchMock));

    await expect(
      ensureLmstudioModelLoaded({
        baseUrl: "http://localhost:1234/v1",
        modelKey: "qwen3",
        requestedContextLength: 8192,
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/api/v1/models/load"))).toBe(
      true,
    );
  });

  it("uses requested context length when provided for model load", async () => {
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
      if (String(url).endsWith("/api/v1/models")) {
        return {
          ok: true,
          json: async () => ({
            models: [
              {
                type: "llm",
                key: "qwen3-8b-instruct",
                max_context_length: 32768,
                loaded_instances: [],
              },
            ],
          }),
        };
      }
      if (String(url).endsWith("/api/v1/models/load")) {
        return {
          ok: true,
          json: async () => ({ status: "loaded" }),
        };
      }
      throw new Error(`Unexpected fetch URL: ${String(url)}`);
    });
    vi.stubGlobal("fetch", asFetch(fetchMock));

    await expect(
      ensureLmstudioModelLoaded({
        baseUrl: "http://localhost:1234/v1",
        modelKey: "qwen3-8b-instruct",
        requestedContextLength: 8192,
      }),
    ).resolves.toBeUndefined();

    const loadCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/models/load"));
    expect(loadCall).toBeDefined();
    const loadInit = loadCall?.[1] as unknown as RequestInit;
    const loadBody = parseJsonRequestBody(loadInit) as { context_length: number };
    expect(loadBody.context_length).toBe(8192);
  });

  it("throws when model discovery fails", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
    }));
    vi.stubGlobal("fetch", asFetch(fetchMock));

    await expect(
      ensureLmstudioModelLoaded({
        baseUrl: "http://localhost:1234/v1",
        modelKey: "qwen3-8b-instruct",
      }),
    ).rejects.toThrow("LM Studio model discovery failed (401)");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
