// Seam: pre-prompt steward memory injection runs inside the embedded runner,
// using the DB-backed relationship memory store rather than ad hoc session text.
import { injectRelationshipContext } from "./relationship-memory.js";

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
  return context.trim() || undefined;
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
