export type StewardLmstudioRole = "primary_local" | "critic_local" | "embedding_local";

export type StewardLmstudioTargetKind =
  | "remote_stateless"
  | "local_lmstudio_inference"
  | "local_lmstudio_embedding";

export type StewardLifecycleAction = "noop" | "load_only" | "unload_then_load" | "reject_conflict";

export type StewardRuntimeModelSelection = {
  provider?: string | null;
  modelId?: string | null;
  baseUrl?: string | null;
  role?: StewardLmstudioRole;
  purpose?: "inference" | "embedding";
  requestedContextLength?: number | null;
};

export type LoadedLmstudioModelState = {
  modelKey: string;
  instanceId?: string | null;
  contextLength?: number | null;
  kind?: "inference" | "embedding";
};

export type StewardLifecyclePlan = {
  targetKind: StewardLmstudioTargetKind;
  action: StewardLifecycleAction;
  targetModelKey?: string;
  requiredContextLength?: number;
  loadedModel?: LoadedLmstudioModelState;
  modelsToUnload: LoadedLmstudioModelState[];
  reason: string;
};
