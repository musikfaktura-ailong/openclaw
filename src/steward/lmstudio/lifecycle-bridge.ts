import {
  ensureLmstudioModelLoaded as defaultEnsureLmstudioModelLoaded,
  getLoadedLmstudioModels as defaultGetLoadedLmstudioModels,
  unloadLmstudioModel as defaultUnloadLmstudioModel,
  type LoadedLmstudioModelState as ProviderLoadedLmstudioModelState,
} from "../../../extensions/lmstudio/src/models.fetch.js";
import { appendLmstudioLifecycleEvent } from "./lifecycle-events.js";
import { planLmstudioLifecycle } from "./lifecycle-policy.js";
import type { LoadedLmstudioModelState, StewardLifecyclePlan, StewardRuntimeModelSelection } from "./lifecycle-types.js";

type AsyncLock = <T>(task: () => Promise<T>) => Promise<T>;

type StewardLmstudioLifecycleBridgeDeps = {
  getLoadedLmstudioModels?: typeof defaultGetLoadedLmstudioModels;
  ensureLmstudioModelLoaded?: typeof defaultEnsureLmstudioModelLoaded;
  unloadLmstudioModel?: typeof defaultUnloadLmstudioModel;
};

export type StewardLmstudioLifecycleBridgeResult = {
  bypassed: boolean;
  plan: StewardLifecyclePlan;
  queryModelId?: string;
};

const lifecycleLocks = new Map<string, AsyncLock>();
const queryLocks = new Map<string, AsyncLock>();

function createAsyncLock(): AsyncLock {
  let lock: Promise<void> = Promise.resolve();
  return async function withLock<T>(task: () => Promise<T>): Promise<T> {
    const previous = lock;
    let release: (() => void) | undefined;
    lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await task();
    } finally {
      release?.();
    }
  };
}

function withNamedLock<T>(locks: Map<string, AsyncLock>, key: string, task: () => Promise<T>): Promise<T> {
  let withLock = locks.get(key);
  if (!withLock) {
    withLock = createAsyncLock();
    locks.set(key, withLock);
  }
  return withLock(task);
}

function normalizeModelKey(modelId: string | null | undefined): string {
  const trimmed = (modelId ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const withoutPrefix = trimmed.toLowerCase().startsWith("lmstudio/")
    ? trimmed.slice("lmstudio/".length).trim()
    : trimmed;
  return withoutPrefix.toLowerCase();
}

function normalizeLockKey(baseUrl: string | null | undefined): string {
  return (baseUrl ?? "").trim().toLowerCase() || "default";
}

function toBridgeLoadedModels(loadedModels: readonly ProviderLoadedLmstudioModelState[]): LoadedLmstudioModelState[] {
  return loadedModels.map((model) => ({
    modelKey: model.modelKey,
    instanceId: model.instanceId,
    contextLength: model.contextLength,
    kind: model.kind,
  }));
}

function resolveUnloadList(
  plan: StewardLifecyclePlan,
  loadedModels: readonly LoadedLmstudioModelState[],
): LoadedLmstudioModelState[] {
  if (plan.action !== "unload_then_load" || !plan.targetModelKey) {
    return plan.modelsToUnload;
  }
  const normalizedTarget = normalizeModelKey(plan.targetModelKey);
  const sameTargetLoaded = loadedModels.filter((model) => {
    const sameModel = normalizeModelKey(model.modelKey) === normalizedTarget;
    if (!sameModel) {
      return false;
    }
    if (plan.targetKind === "local_lmstudio_embedding") {
      return model.kind === "embedding";
    }
    if (plan.targetKind === "local_lmstudio_inference") {
      return model.kind !== "embedding";
    }
    return false;
  });
  return sameTargetLoaded.length > 0 ? sameTargetLoaded : plan.modelsToUnload;
}

function isContextMismatch(plan: StewardLifecyclePlan): boolean {
  return (
    plan.action === "unload_then_load" &&
    !!plan.targetModelKey &&
    !!plan.loadedModel &&
    normalizeModelKey(plan.targetModelKey) === normalizeModelKey(plan.loadedModel.modelKey)
  );
}

function resolveQueryModelIdFromLoadedModels(params: {
  plan: StewardLifecyclePlan;
  loadedModels: readonly LoadedLmstudioModelState[];
}): string | undefined {
  if (params.plan.targetKind !== "local_lmstudio_inference" || !params.plan.targetModelKey) {
    return undefined;
  }
  const normalizedTarget = normalizeModelKey(params.plan.targetModelKey);
  const matching = params.loadedModels.find((model) => {
    if (model.kind === "embedding") {
      return false;
    }
    return normalizeModelKey(model.modelKey) === normalizedTarget;
  });
  return matching?.instanceId?.trim() || undefined;
}

function buildLifecycleEventData(params: {
  selection: StewardRuntimeModelSelection;
  plan: StewardLifecyclePlan;
  unloadCount?: number;
  unloadedModel?: LoadedLmstudioModelState;
  error?: unknown;
}): Record<string, unknown> {
  return {
    provider: params.selection.provider ?? null,
    baseUrl: params.selection.baseUrl ?? null,
    role: params.selection.role ?? null,
    purpose: params.selection.purpose ?? "inference",
    targetKind: params.plan.targetKind,
    action: params.plan.action,
    targetModelKey: params.plan.targetModelKey ?? null,
    requiredContextLength: params.plan.requiredContextLength ?? null,
    loadedModelKey: params.plan.loadedModel?.modelKey ?? null,
    loadedModelInstanceId: params.plan.loadedModel?.instanceId ?? null,
    unloadCount: params.unloadCount ?? params.plan.modelsToUnload.length,
    unloadedModelKey: params.unloadedModel?.modelKey ?? null,
    unloadedModelInstanceId: params.unloadedModel?.instanceId ?? null,
    reason: params.plan.reason,
    error: params.error ? String(params.error) : null,
  };
}

export async function ensureStewardLmstudioLifecycle(
  params: StewardLmstudioLifecycleBridgeDeps & {
    selection: StewardRuntimeModelSelection;
    sessionKey?: string;
    now?: number;
  },
): Promise<StewardLmstudioLifecycleBridgeResult> {
  const getLoadedLmstudioModels = params.getLoadedLmstudioModels ?? defaultGetLoadedLmstudioModels;
  const ensureLmstudioModelLoaded = params.ensureLmstudioModelLoaded ?? defaultEnsureLmstudioModelLoaded;
  const unloadLmstudioModel = params.unloadLmstudioModel ?? defaultUnloadLmstudioModel;
  const provisionalPlan = planLmstudioLifecycle({
    selection: params.selection,
    loadedModels: [],
  });
  if (provisionalPlan.targetKind === "remote_stateless") {
    return {
      bypassed: true,
      plan: provisionalPlan,
      queryModelId: undefined,
    };
  }
  const lockKey = normalizeLockKey(params.selection.baseUrl);

  appendLmstudioLifecycleEvent({
    kind: "lmstudio.lifecycle.lock_wait_started",
    message: "Waiting for steward LM Studio lifecycle lock",
    sessionKey: params.sessionKey,
    data: {
      baseUrl: params.selection.baseUrl ?? null,
      role: params.selection.role ?? null,
      purpose: params.selection.purpose ?? "inference",
    },
    now: params.now,
  });

  return await withNamedLock(lifecycleLocks, lockKey, async () => {
    let plan: StewardLifecyclePlan | undefined;
    appendLmstudioLifecycleEvent({
      kind: "lmstudio.lifecycle.lock_acquired",
      message: "Acquired steward LM Studio lifecycle lock",
      sessionKey: params.sessionKey,
      data: {
        baseUrl: params.selection.baseUrl ?? null,
      },
      now: params.now,
    });

    try {
      const loadedModels = toBridgeLoadedModels(
        await getLoadedLmstudioModels({
          baseUrl: params.selection.baseUrl ?? undefined,
        }),
      );
      plan = planLmstudioLifecycle({
        selection: params.selection,
        loadedModels,
      });
      let queryModelId = resolveQueryModelIdFromLoadedModels({
        plan,
        loadedModels,
      });

      if (isContextMismatch(plan)) {
        appendLmstudioLifecycleEvent({
          kind: "lmstudio.lifecycle.context_mismatch_detected",
          message: "LM Studio model context mismatch detected",
          sessionKey: params.sessionKey,
          data: buildLifecycleEventData({
            selection: params.selection,
            plan,
          }),
          now: params.now,
        });
      }

      const modelsToUnload = resolveUnloadList(plan, loadedModels);
      for (const loadedModel of modelsToUnload) {
        if (!loadedModel.instanceId?.trim()) {
          continue;
        }
        appendLmstudioLifecycleEvent({
          kind: "lmstudio.lifecycle.unload_started",
          message: `Unloading LM Studio model ${loadedModel.modelKey}`,
          sessionKey: params.sessionKey,
          data: buildLifecycleEventData({
            selection: params.selection,
            plan,
            unloadCount: modelsToUnload.length,
            unloadedModel: loadedModel,
          }),
          now: params.now,
        });
        await unloadLmstudioModel({
          baseUrl: params.selection.baseUrl ?? undefined,
          instanceId: loadedModel.instanceId,
        });
        appendLmstudioLifecycleEvent({
          kind: "lmstudio.lifecycle.unload_finished",
          message: `Unloaded LM Studio model ${loadedModel.modelKey}`,
          sessionKey: params.sessionKey,
          data: buildLifecycleEventData({
            selection: params.selection,
            plan,
            unloadCount: modelsToUnload.length,
            unloadedModel: loadedModel,
          }),
          now: params.now,
        });
      }

      if (plan.action !== "noop") {
        if (!plan.targetModelKey) {
          throw new Error("LM Studio lifecycle target model key is required for load actions");
        }
        appendLmstudioLifecycleEvent({
          kind: "lmstudio.lifecycle.load_started",
          message: `Loading LM Studio model ${plan.targetModelKey}`,
          sessionKey: params.sessionKey,
          data: buildLifecycleEventData({
            selection: params.selection,
            plan,
            unloadCount: modelsToUnload.length,
          }),
          now: params.now,
        });
        try {
          await ensureLmstudioModelLoaded({
            baseUrl: params.selection.baseUrl ?? undefined,
            modelKey: plan.targetModelKey,
            requestedContextLength: plan.requiredContextLength,
          });
        } catch (error) {
          appendLmstudioLifecycleEvent({
            kind: "lmstudio.lifecycle.load_failed",
            message: `Failed to load LM Studio model ${plan.targetModelKey}`,
            sessionKey: params.sessionKey,
            data: buildLifecycleEventData({
              selection: params.selection,
              plan,
              unloadCount: modelsToUnload.length,
              error,
            }),
            now: params.now,
          });
          throw error;
        }
        appendLmstudioLifecycleEvent({
          kind: "lmstudio.lifecycle.load_finished",
          message: `Loaded LM Studio model ${plan.targetModelKey}`,
          sessionKey: params.sessionKey,
          data: buildLifecycleEventData({
            selection: params.selection,
            plan,
            unloadCount: modelsToUnload.length,
          }),
          now: params.now,
        });
        const reloadedModels = toBridgeLoadedModels(
          await getLoadedLmstudioModels({
            baseUrl: params.selection.baseUrl ?? undefined,
          }),
        );
        queryModelId = resolveQueryModelIdFromLoadedModels({
          plan,
          loadedModels: reloadedModels,
        });
      }

      return {
        bypassed: false,
        plan,
        queryModelId: queryModelId ?? plan.targetModelKey ?? undefined,
      };
    } finally {
      appendLmstudioLifecycleEvent({
        kind: "lmstudio.lifecycle.lock_released",
        message: "Released steward LM Studio lifecycle lock",
        sessionKey: params.sessionKey,
        data: plan
          ? buildLifecycleEventData({
              selection: params.selection,
              plan,
            })
          : {
              baseUrl: params.selection.baseUrl ?? null,
              role: params.selection.role ?? null,
              purpose: params.selection.purpose ?? "inference",
            },
        now: params.now,
      });
    }
  });
}

export async function withStewardLmstudioQueryLock<T>(
  params: {
    selection: StewardRuntimeModelSelection;
    sessionKey?: string;
    now?: number;
    task: () => Promise<T>;
  },
): Promise<T> {
  const targetKind = planLmstudioLifecycle({
    selection: params.selection,
    loadedModels: [],
  }).targetKind;
  if (targetKind !== "local_lmstudio_inference") {
    return await params.task();
  }

  const lockKey = normalizeLockKey(params.selection.baseUrl);
  appendLmstudioLifecycleEvent({
    kind: "lmstudio.lifecycle.query_lock_wait_started",
    message: "Waiting for steward LM Studio query lock",
    sessionKey: params.sessionKey,
    data: {
      baseUrl: params.selection.baseUrl ?? null,
      role: params.selection.role ?? null,
      modelId: params.selection.modelId ?? null,
    },
    now: params.now,
  });

  return await withNamedLock(queryLocks, lockKey, async () => {
    appendLmstudioLifecycleEvent({
      kind: "lmstudio.lifecycle.query_lock_acquired",
      message: "Acquired steward LM Studio query lock",
      sessionKey: params.sessionKey,
      data: {
        baseUrl: params.selection.baseUrl ?? null,
        role: params.selection.role ?? null,
        modelId: params.selection.modelId ?? null,
      },
      now: params.now,
    });
    try {
      return await params.task();
    } finally {
      appendLmstudioLifecycleEvent({
        kind: "lmstudio.lifecycle.query_lock_released",
        message: "Released steward LM Studio query lock",
        sessionKey: params.sessionKey,
        data: {
          baseUrl: params.selection.baseUrl ?? null,
          role: params.selection.role ?? null,
          modelId: params.selection.modelId ?? null,
        },
        now: params.now,
      });
    }
  });
}
