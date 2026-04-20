import { getDb } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getRuntimeState } from "../runtime/runtime-state.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import {
  runToolPrecheckRules,
  type PrecheckVerdict,
  type ToolPrecheckResult,
} from "./precheck-rules.js";

export type ToolSupervisorPrecheckResult = ToolPrecheckResult;

function shouldPersistPrecheckEvent(verdict: PrecheckVerdict): boolean {
  // reroute included: misdirected tool calls are diagnostically significant
  return verdict === "hard_fail" || verdict === "refuse" || verdict === "reroute";
}

function persistPrecheckEvent(params: {
  sessionKey?: string;
  toolName: string;
  args: unknown;
  result: ToolSupervisorPrecheckResult;
}): void {
  if (!params.sessionKey || !shouldPersistPrecheckEvent(params.result.verdict)) {
    return;
  }
  try {
    getDb();
  } catch {
    return;
  }

  const authority = getOrCreateStewardSession(params.sessionKey);
  const runtimeState = getRuntimeState(authority.sessionId);
  appendStewardEvent({
    kind: "tool.precheck.blocked",
    message: `Tool precheck blocked ${params.toolName}`,
    sessionId: authority.sessionId,
    flowId: runtimeState?.activeFlowId ?? null,
    data: {
      toolName: params.toolName,
      verdict: params.result.verdict,
      reason: params.result.reason,
      rerouteToolName: params.result.rerouteToolName ?? null,
      args: params.args,
      issues: params.result.issues,
    },
  });
}

export function precheckToolCall(params: {
  toolName: string;
  args: unknown;
  sessionKey?: string;
}): ToolSupervisorPrecheckResult {
  const result = runToolPrecheckRules(params.toolName, params.args);
  persistPrecheckEvent({
    sessionKey: params.sessionKey,
    toolName: params.toolName,
    args: params.args,
    result,
  });
  return result;
}

