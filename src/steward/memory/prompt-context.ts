// Seam: pre-prompt steward memory injection runs inside the embedded runner,
// using the DB-backed relationship memory store rather than ad hoc session text.
import { hierarchyPromptContext } from "../mission/operator-hierarchy.js";
import { injectRelationshipContext } from "./relationship-memory.js";
import { buildSelfImprovementPromptContext } from "../control/self-improvement.js";

export async function buildStewardMemoryPromptContext(params: {
  sessionKey?: string;
}): Promise<string | undefined> {
  const sessionKey = params.sessionKey?.trim();
  if (!sessionKey) {
    return undefined;
  }
  const context = await injectRelationshipContext({
    sessionKey,
    topK: 6,
  });
  const sections = [
    hierarchyPromptContext(),
    buildSelfImprovementPromptContext({ sessionKey }),
    context.trim() || undefined,
  ].filter((item): item is string => Boolean(item && item.trim()));
  return sections.length > 0 ? sections.join("\n\n") : undefined;
}

export async function mergeStewardMemoryIntoExtraSystemPrompt(params: {
  sessionKey?: string;
  extraSystemPrompt?: string;
}): Promise<string | undefined> {
  const base = params.extraSystemPrompt?.trim();
  const memory = await buildStewardMemoryPromptContext({ sessionKey: params.sessionKey });
  if (base && memory) {
    return `${base}\n\n${memory}`;
  }
  return base || memory;
}
