import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { createSimpleCompletionStewardClassifier } from "../proof/proof-judge.js";
import type { StewardClassifier } from "../proof/proof-types.js";

export const DEFAULT_VALUE_SCORER_PROVIDER = "anthropic";
export const DEFAULT_VALUE_SCORER_MODEL = "claude-haiku-4-5";

export async function createStewardValueScorer(params: {
  cfg: OpenClawConfig;
  provider?: string;
  modelId?: string;
}): Promise<StewardClassifier | null> {
  return await createSimpleCompletionStewardClassifier({
    cfg: params.cfg,
    provider: params.provider ?? DEFAULT_VALUE_SCORER_PROVIDER,
    modelId: params.modelId ?? DEFAULT_VALUE_SCORER_MODEL,
  });
}

export function buildValueScorerPromptContext(): string {
  return [
    "TASK VALUE RUBRIC:",
    "- truth and provenance outrank fluency",
    "- operator service and burden reduction outrank vanity output",
    "- continuity protection outranks speed when they conflict",
    "- truthful refusal beats fabricated completion",
  ].join("\n");
}
