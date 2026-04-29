import { describe, expect, it } from "vitest";
import {
  MIN_LOCAL_EMBEDDING_CONTEXT_LENGTH,
  MIN_LOCAL_INFERENCE_CONTEXT_LENGTH,
  planLmstudioLifecycle,
} from "./lifecycle-policy.js";

describe("LM-A lifecycle policy", () => {
  it("returns remote_stateless noop for non-lmstudio models", () => {
    const plan = planLmstudioLifecycle({
      selection: {
        provider: "anthropic",
        modelId: "claude-sonnet-4-6",
        role: "primary_local",
      },
      loadedModels: [
        {
          modelKey: "qwen/qwen3-14b",
          contextLength: 32_768,
          kind: "inference",
        },
      ],
    });

    expect(plan.targetKind).toBe("remote_stateless");
    expect(plan.action).toBe("noop");
    expect(plan.modelsToUnload).toEqual([]);
  });

  it("returns noop when the same local model is already loaded with sufficient context", () => {
    const plan = planLmstudioLifecycle({
      selection: {
        provider: "lmstudio",
        modelId: "lmstudio/qwen/qwen3-14b",
        role: "primary_local",
        requestedContextLength: 32_768,
      },
      loadedModels: [
        {
          modelKey: "qwen/qwen3-14b",
          instanceId: "inst-qwen",
          contextLength: 32_768,
          kind: "inference",
        },
      ],
    });

    expect(plan.targetKind).toBe("local_lmstudio_inference");
    expect(plan.action).toBe("noop");
    expect(plan.modelsToUnload).toEqual([]);
    expect(plan.loadedModel?.instanceId).toBe("inst-qwen");
  });

  it("returns unload_then_load when the same model is loaded with insufficient context", () => {
    const plan = planLmstudioLifecycle({
      selection: {
        provider: "lmstudio",
        modelId: "qwen/qwen3-14b",
        role: "critic_local",
        requestedContextLength: 32_768,
      },
      loadedModels: [
        {
          modelKey: "qwen/qwen3-14b",
          instanceId: "inst-qwen-small",
          contextLength: 8_192,
          kind: "inference",
        },
      ],
    });

    expect(plan.action).toBe("unload_then_load");
    expect(plan.modelsToUnload).toHaveLength(1);
    expect(plan.modelsToUnload[0]?.instanceId).toBe("inst-qwen-small");
    expect(plan.requiredContextLength).toBe(32_768);
  });

  it("returns unload_then_load when a different local inference model is active", () => {
    const plan = planLmstudioLifecycle({
      selection: {
        provider: "lmstudio",
        modelId: "deepseek-r1-distill-qwen-14b",
        role: "critic_local",
      },
      loadedModels: [
        {
          modelKey: "qwen/qwen3-14b",
          instanceId: "inst-primary",
          contextLength: 32_768,
          kind: "inference",
        },
      ],
    });

    expect(plan.action).toBe("unload_then_load");
    expect(plan.requiredContextLength).toBe(MIN_LOCAL_INFERENCE_CONTEXT_LENGTH);
    expect(plan.modelsToUnload.map((model) => model.instanceId)).toEqual(["inst-primary"]);
  });

  it("returns load_only when no relevant local inference model is loaded", () => {
    const plan = planLmstudioLifecycle({
      selection: {
        provider: "lmstudio",
        modelId: "qwen/qwen3-14b",
        role: "primary_local",
      },
      loadedModels: [],
    });

    expect(plan.action).toBe("load_only");
    expect(plan.requiredContextLength).toBe(MIN_LOCAL_INFERENCE_CONTEXT_LENGTH);
    expect(plan.modelsToUnload).toEqual([]);
  });

  it("ignores loaded embedding models when planning an inference transition", () => {
    const plan = planLmstudioLifecycle({
      selection: {
        provider: "lmstudio",
        modelId: "qwen/qwen3-14b",
        role: "primary_local",
      },
      loadedModels: [
        {
          modelKey: "text-embedding-nomic-embed-text-v1.5",
          instanceId: "inst-embed",
          contextLength: 2_048,
          kind: "embedding",
        },
      ],
    });

    expect(plan.targetKind).toBe("local_lmstudio_inference");
    expect(plan.action).toBe("load_only");
    expect(plan.modelsToUnload).toEqual([]);
  });

  it("treats embedding lifecycle separately and reloads an embedding model with insufficient context", () => {
    const plan = planLmstudioLifecycle({
      selection: {
        provider: "lmstudio",
        modelId: "lmstudio/text-embedding-nomic-embed-text-v1.5",
        role: "embedding_local",
        purpose: "embedding",
      },
      loadedModels: [
        {
          modelKey: "text-embedding-nomic-embed-text-v1.5",
          instanceId: "inst-embed",
          contextLength: 1_024,
          kind: "embedding",
        },
      ],
    });

    expect(plan.targetKind).toBe("local_lmstudio_embedding");
    expect(plan.action).toBe("unload_then_load");
    expect(plan.requiredContextLength).toBe(MIN_LOCAL_EMBEDDING_CONTEXT_LENGTH);
    expect(plan.modelsToUnload.map((model) => model.instanceId)).toEqual(["inst-embed"]);
  });
});
