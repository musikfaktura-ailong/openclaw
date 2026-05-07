import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { ProviderRuntimeModel } from "../../plugins/provider-runtime-model.types.js";
import {
  ensureStewardLmstudioLifecycle,
  withStewardLmstudioQueryLock,
  type StewardLmstudioLifecycleBridgeResult,
} from "./lifecycle-bridge.js";

export const STEWARD_DEFAULT_LOCAL_INFERENCE_LOAD_CONTEXT_LENGTH = 16_384;

function resolveRequestedContextLengthForLifecycle(params: {
  model: ProviderRuntimeModel;
  fallbackContextTokenBudget?: number;
}): number | undefined {
  const fallback =
    typeof params.fallbackContextTokenBudget === "number" &&
    Number.isFinite(params.fallbackContextTokenBudget) &&
    params.fallbackContextTokenBudget > 0
      ? Math.floor(params.fallbackContextTokenBudget)
      : undefined;
  if (fallback !== undefined && fallback < STEWARD_DEFAULT_LOCAL_INFERENCE_LOAD_CONTEXT_LENGTH) {
    return fallback;
  }
  return STEWARD_DEFAULT_LOCAL_INFERENCE_LOAD_CONTEXT_LENGTH;
}

export function wrapStreamFnWithStewardLmstudioLifecycle(params: {
  streamFn: StreamFn;
  sessionKey?: string;
  contextTokenBudget?: number;
  ensureLifecycle?: (params: {
    selection: {
      provider?: string | null;
      modelId?: string | null;
      baseUrl?: string | null;
      role?: "primary_local";
      purpose?: "inference";
      requestedContextLength?: number | null;
    };
    sessionKey?: string;
  }) => Promise<StewardLmstudioLifecycleBridgeResult>;
  withQueryLock?: <T>(params: {
    selection: {
      provider?: string | null;
      modelId?: string | null;
      baseUrl?: string | null;
      role?: "primary_local";
      purpose?: "inference";
      requestedContextLength?: number | null;
    };
    sessionKey?: string;
    task: () => Promise<T>;
  }) => Promise<T>;
}): StreamFn {
  const ensureLifecycle = params.ensureLifecycle ?? ensureStewardLmstudioLifecycle;
  const queryLock = params.withQueryLock ?? withStewardLmstudioQueryLock;

  return async (model, context, options) => {
    const runtimeModel = model as ProviderRuntimeModel;
    const selection = {
      provider: runtimeModel.provider ?? null,
      modelId: runtimeModel.id ?? null,
      baseUrl: runtimeModel.baseUrl ?? null,
      role: "primary_local" as const,
      purpose: "inference" as const,
      requestedContextLength: resolveRequestedContextLengthForLifecycle({
        model: runtimeModel,
        fallbackContextTokenBudget: params.contextTokenBudget,
      }),
    };
    const lifecycle = await ensureLifecycle({
      selection,
      sessionKey: params.sessionKey,
    });
    const streamModel =
      lifecycle.queryModelId && lifecycle.queryModelId !== runtimeModel.id
        ? ({
            ...runtimeModel,
            transportModelId: lifecycle.queryModelId,
          } satisfies ProviderRuntimeModel)
        : runtimeModel;
    return await queryLock({
      selection,
      sessionKey: params.sessionKey,
      task: async () => await Promise.resolve(params.streamFn(streamModel, context, options)),
    });
  };
}
