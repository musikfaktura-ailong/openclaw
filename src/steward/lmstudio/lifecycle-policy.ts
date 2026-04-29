import type {
  LoadedLmstudioModelState,
  StewardLifecyclePlan,
  StewardLmstudioRole,
  StewardRuntimeModelSelection,
  StewardLmstudioTargetKind,
} from "./lifecycle-types.js";

export const MIN_LOCAL_INFERENCE_CONTEXT_LENGTH = 8_192;
export const MIN_LOCAL_EMBEDDING_CONTEXT_LENGTH = 2_048;

function normalizeModelKey(modelId: string | null | undefined): string {
  const trimmed = (modelId ?? "").trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.toLowerCase().startsWith("lmstudio/") ? trimmed.slice("lmstudio/".length).trim() : trimmed;
}

function normalizePositiveInt(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function resolveTargetKind(selection: StewardRuntimeModelSelection): StewardLmstudioTargetKind {
  if ((selection.provider ?? "").trim() !== "lmstudio") {
    return "remote_stateless";
  }
  if (selection.purpose === "embedding" || selection.role === "embedding_local") {
    return "local_lmstudio_embedding";
  }
  return "local_lmstudio_inference";
}

function resolveRequiredContextLength(selection: StewardRuntimeModelSelection): number | undefined {
  const requested = normalizePositiveInt(selection.requestedContextLength);
  if (requested) {
    return requested;
  }
  return selection.role === "embedding_local"
    ? MIN_LOCAL_EMBEDDING_CONTEXT_LENGTH
    : MIN_LOCAL_INFERENCE_CONTEXT_LENGTH;
}

function modelMatches(targetModelKey: string, loaded: LoadedLmstudioModelState): boolean {
  if (!targetModelKey) {
    return false;
  }
  const loadedKey = normalizeModelKey(loaded.modelKey);
  return loadedKey === targetModelKey;
}

function isContextSufficient(
  loaded: LoadedLmstudioModelState | undefined,
  requiredContextLength: number | undefined,
): boolean {
  if (!loaded || !requiredContextLength) {
    return false;
  }
  const actual = normalizePositiveInt(loaded.contextLength);
  return actual !== undefined && actual >= requiredContextLength;
}

function filterRelevantLoaded(
  loadedModels: readonly LoadedLmstudioModelState[],
  targetKind: StewardLmstudioTargetKind,
): LoadedLmstudioModelState[] {
  if (targetKind === "local_lmstudio_embedding") {
    return loadedModels.filter((model) => model.kind === "embedding");
  }
  if (targetKind === "local_lmstudio_inference") {
    return loadedModels.filter((model) => model.kind !== "embedding");
  }
  return [];
}

function roleLabel(role: StewardLmstudioRole | undefined): string {
  switch (role) {
    case "critic_local":
      return "critic";
    case "embedding_local":
      return "embedding";
    case "primary_local":
    default:
      return "primary";
  }
}

export function planLmstudioLifecycle(params: {
  selection: StewardRuntimeModelSelection;
  loadedModels: readonly LoadedLmstudioModelState[];
}): StewardLifecyclePlan {
  const targetKind = resolveTargetKind(params.selection);
  if (targetKind === "remote_stateless") {
    return {
      targetKind,
      action: "noop",
      modelsToUnload: [],
      reason: "Non-LM Studio model; steward LM Studio lifecycle does not apply.",
    };
  }

  const targetModelKey = normalizeModelKey(params.selection.modelId);
  const requiredContextLength = resolveRequiredContextLength(params.selection);
  const relevantLoaded = filterRelevantLoaded(params.loadedModels, targetKind);
  const matchingLoaded = relevantLoaded.find((loaded) => modelMatches(targetModelKey, loaded));

  if (matchingLoaded && isContextSufficient(matchingLoaded, requiredContextLength)) {
    return {
      targetKind,
      action: "noop",
      targetModelKey,
      requiredContextLength,
      loadedModel: matchingLoaded,
      modelsToUnload: [],
      reason: `${roleLabel(params.selection.role)} LM Studio model already loaded with sufficient context.`,
    };
  }

  if (matchingLoaded && !isContextSufficient(matchingLoaded, requiredContextLength)) {
    return {
      targetKind,
      action: "unload_then_load",
      targetModelKey,
      requiredContextLength,
      loadedModel: matchingLoaded,
      modelsToUnload: [matchingLoaded],
      reason: "Target LM Studio model is loaded with insufficient context and must be reloaded.",
    };
  }

  if (relevantLoaded.length > 0) {
    return {
      targetKind,
      action: "unload_then_load",
      targetModelKey,
      requiredContextLength,
      loadedModel: relevantLoaded[0],
      modelsToUnload: relevantLoaded,
      reason: "A different LM Studio model is already active for this lifecycle class.",
    };
  }

  return {
    targetKind,
    action: "load_only",
    targetModelKey,
    requiredContextLength,
    modelsToUnload: [],
    reason: "Target LM Studio model is not loaded and no conflicting active model exists.",
  };
}
