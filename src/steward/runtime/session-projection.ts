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
    // JSON stays an OpenClaw compatibility surface in WS-A.
    // Preserve any existing sessionId and only backfill when the entry has none.
    const compatibilitySessionId = existing?.sessionId ?? params.stewardSessionId;
    if (existing?.sessionId === compatibilitySessionId) {
      return existing;
    }
    const next: SessionEntry = mergeSessionEntry(existing, {
      sessionId: compatibilitySessionId,
      updatedAt,
    });
    store[params.sessionKey] = next;
    return next;
  });
}
