import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { ProviderRuntimeModel } from "../../plugins/provider-runtime-model.types.js";
import {
  ensureStewardLmstudioLifecycle,
  withStewardLmstudioQueryLock,
  type StewardLmstudioLifecycleBridgeResult,
} from "./lifecycle-bridge.js";

function resolveRequestedContextLengthForLifecycle(params: {
  model: ProviderRuntimeModel;
  fallbackContextTokenBudget?: number;
}): number | undefined {
  const candidates = [
    params.model.contextTokens,
    params.model.contextWindow,
    params.fallbackContextTokenBudget,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return Math.floor(candidate);
    }
  }
  return undefined;
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
    await ensureLifecycle({
      selection,
      sessionKey: params.sessionKey,
    });
    return await queryLock({
      selection,
      sessionKey: params.sessionKey,
      task: async () => await Promise.resolve(params.streamFn(model, context, options)),
    });
  };
}
