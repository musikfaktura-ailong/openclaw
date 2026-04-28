import { getDb } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getRuntimeState } from "../runtime/runtime-state.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import {
  runToolPostcheckRules,
  type PostcheckVerdict,
  type ToolPostcheckResult,
} from "./postcheck-rules.js";
import {
  runToolPrecheckRules,
  type PrecheckVerdict,
  type ToolPrecheckResult,
} from "./precheck-rules.js";

export type ToolSupervisorPrecheckResult = ToolPrecheckResult;
export type ToolSupervisorPostcheckResult = ToolPostcheckResult;

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

function shouldPersistPostcheckEvent(params: {
  verdict: PostcheckVerdict;
  artifactCount: number;
}): boolean {
  return params.verdict !== "accept" || params.artifactCount > 0;
}

function persistPostcheckEvent(params: {
  sessionKey?: string;
  toolName: string;
  toolCallId?: string;
  args: unknown;
  result: ToolSupervisorPostcheckResult;
}): void {
  const artifactCount = Object.keys(params.result.artifacts).length;
  if (
    !params.sessionKey ||
    !shouldPersistPostcheckEvent({ verdict: params.result.verdict, artifactCount })
  ) {
    return;
  }
  try {
    getDb();
  } catch {
    return;
  }

  const authority = getOrCreateStewardSession(params.sessionKey);
  const runtimeState = getRuntimeState(authority.sessionId);
  const kind =
    params.result.verdict === "accept"
      ? "tool.postcheck.normalized"
      : "tool.postcheck.classified";
  appendStewardEvent({
    kind,
    message:
      params.result.verdict === "accept"
        ? `Tool postcheck normalized ${params.toolName}`
        : `Tool postcheck classified ${params.toolName} as ${params.result.verdict}`,
    sessionId: authority.sessionId,
    flowId: runtimeState?.activeFlowId ?? null,
    data: {
      toolName: params.toolName,
      toolCallId: params.toolCallId ?? null,
      verdict: params.result.verdict,
      reason: params.result.reason,
      args: params.args,
      issues: params.result.issues,
      artifacts: params.result.artifacts,
    },
  });
}

function withStewardPostcheckMetadata<T>(result: T, postcheck: ToolSupervisorPostcheckResult): T {
  if (!result || typeof result !== "object") {
    return result;
  }
  const metadata = {
    verdict: postcheck.verdict,
    reason: postcheck.reason,
    issues: postcheck.issues,
    artifacts: postcheck.artifacts,
  };
  if (Array.isArray((result as { content?: unknown }).content)) {
    const record = result as { details?: unknown };
    const details =
      record.details && typeof record.details === "object" && !Array.isArray(record.details)
        ? { ...(record.details as Record<string, unknown>) }
        : {};
    return {
      ...(result as Record<string, unknown>),
      details: {
        ...details,
        stewardPostcheck: metadata,
      },
    } as T;
  }

  return {
    ...(result as Record<string, unknown>),
    stewardPostcheck: metadata,
  } as T;
}

export function postcheckToolResult<T>(params: {
  toolName: string;
  args: unknown;
  result: T;
  sessionKey?: string;
  toolCallId?: string;
}): { result: T; postcheck: ToolSupervisorPostcheckResult } {
  const postcheck = runToolPostcheckRules({
    toolName: params.toolName,
    args: params.args,
    result: params.result,
  });
  persistPostcheckEvent({
    sessionKey: params.sessionKey,
    toolName: params.toolName,
    toolCallId: params.toolCallId,
    args: params.args,
    result: postcheck,
  });
  return {
    result: withStewardPostcheckMetadata(params.result, postcheck),
    postcheck,
  };
}
