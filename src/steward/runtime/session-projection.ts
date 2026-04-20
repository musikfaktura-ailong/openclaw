import { updateSessionStore } from "../../config/sessions/store.js";
import { mergeSessionEntry, type SessionEntry } from "../../config/sessions/types.js";

export async function projectSessionToCompatibilityStore(params: {
  storePath: string;
  sessionKey: string;
  stewardSessionId: string;
  updatedAt?: number;
}): Promise<void> {
  const updatedAt = params.updatedAt ?? Date.now();
  await updateSessionStore(params.storePath, (store) => {
    const existing = store[params.sessionKey];
    if (existing) {
      return existing;
    }
    const next: SessionEntry = mergeSessionEntry(existing, {
      sessionId: params.stewardSessionId,
      updatedAt,
    });
    store[params.sessionKey] = next;
    return next;
  });
}
