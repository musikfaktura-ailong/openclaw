import type { StewardEventKind } from "../db/runtime-schema.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getRuntimeState } from "../runtime/runtime-state.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";

export type StewardLmstudioLifecycleEventKind = Extract<StewardEventKind, `lmstudio.lifecycle.${string}`>;

export function appendLmstudioLifecycleEvent(params: {
  kind: StewardLmstudioLifecycleEventKind;
  message: string;
  sessionKey?: string | null;
  data?: Record<string, unknown>;
  now?: number;
}): void {
  if (!params.sessionKey) {
    return;
  }
  const authority = getOrCreateStewardSession(params.sessionKey);
  const runtimeState = getRuntimeState(authority.sessionId);
  appendStewardEvent({
    kind: params.kind,
    message: params.message,
    sessionId: authority.sessionId,
    flowId: runtimeState?.activeFlowId ?? null,
    data: params.data,
    now: params.now,
  });
}
