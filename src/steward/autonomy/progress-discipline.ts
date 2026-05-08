import { getDb } from "../db/db-bootstrap.js";
import type { StewardEventKind } from "../db/runtime-schema.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getRuntimeState } from "../runtime/runtime-state.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import type { AutonomyWorkClass } from "./work-classifier.js";

export type AutonomyProgressDecisionAction = "continue" | "terminate_turn";

export type AutonomyProgressScope =
  | "tool_postcheck"
  | "assistant_output"
  | "work_class_boundary";

export type AutonomyProgressDecision = {
  action: AutonomyProgressDecisionAction;
  reason: string;
  scope: AutonomyProgressScope;
  workClass: AutonomyWorkClass;
  hostTaskId: number | null;
  flowId: number | null;
  toolName?: string | null;
  toolCallId?: string | null;
  hardFailCount?: number;
  details?: Record<string, unknown>;
};

export type AutonomyWorkClassBoundary = {
  workClass: AutonomyWorkClass;
  reason: string;
  boundaryApplied: boolean;
  details: Record<string, unknown>;
};

type ActiveAutonomyContext = {
  sessionId: string;
  flowId: number;
  hostTaskId: number;
  workClass: AutonomyWorkClass;
};

type PostcheckMetadata = {
  verdict: string;
  reason: string;
};

const PERMISSION_SEEKING_PATTERNS = [
  /\breply with\s+\d+\b/i,
  /\bapprove\b/i,
  /\bapproval\b/i,
  /\bpermission\b/i,
  /\bconfirm to continue\b/i,
  /\bawaiting approval\b/i,
  /\brequires your approval\b/i,
  /\boperator action required\b/i,
] as const;

function readAutonomyWorkClass(value: unknown): AutonomyWorkClass | null {
  switch (value) {
    case "goal_work":
    case "diagnostic_work":
    case "maintenance_work":
    case "review_or_consolidation":
      return value;
    default:
      return null;
  }
}

function isPermissionDisallowedWorkClass(workClass: AutonomyWorkClass): boolean {
  return workClass !== "goal_work";
}

function resolveActiveAutonomyContext(sessionKey: string): ActiveAutonomyContext | null {
  const authority = getOrCreateStewardSession(sessionKey);
  const runtime = getRuntimeState(authority.sessionId);
  if (
    runtime?.status !== "running" ||
    runtime.triggerSource !== "autonomy" ||
    runtime.activeFlowId == null ||
    runtime.activeTaskId == null
  ) {
    return null;
  }
  const row = getDb()
    .prepare(
      `SELECT work_class
       FROM steward_host_tasks
       WHERE id = ?
         AND session_id = ?
         AND source = 'autonomy'
       LIMIT 1`,
    )
    .get(runtime.activeTaskId, authority.sessionId) as { work_class: string } | undefined;
  const workClass = readAutonomyWorkClass(row?.work_class);
  if (!workClass) {
    return null;
  }
  return {
    sessionId: authority.sessionId,
    flowId: runtime.activeFlowId,
    hostTaskId: runtime.activeTaskId,
    workClass,
  };
}

function readPostcheckMetadata(result: unknown): PostcheckMetadata | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const record = result as Record<string, unknown>;
  const details =
    record.details && typeof record.details === "object" && !Array.isArray(record.details)
      ? (record.details as Record<string, unknown>)
      : null;
  const metadataSource =
    details?.stewardPostcheck && typeof details.stewardPostcheck === "object"
      ? (details.stewardPostcheck as Record<string, unknown>)
      : record.stewardPostcheck && typeof record.stewardPostcheck === "object"
        ? (record.stewardPostcheck as Record<string, unknown>)
        : null;
  if (!metadataSource) {
    return null;
  }
  return {
    verdict: String(metadataSource.verdict ?? "").trim().toLowerCase(),
    reason: String(metadataSource.reason ?? "").trim(),
  };
}

function countRecentBadOutcomes(params: {
  sessionId: string;
  workClass: AutonomyWorkClass;
}): number {
  const rows = getDb()
    .prepare(
      `SELECT
         ht.id,
         ht.status,
         e.data_json
       FROM steward_host_tasks ht
       LEFT JOIN steward_events e
         ON e.flow_id = ht.seed_flow_id
        AND e.kind = 'runtime.idle'
       WHERE ht.session_id = ?
         AND ht.source = 'autonomy'
         AND ht.work_class = ?
         AND ht.status IN ('done', 'failed')
       ORDER BY ht.id DESC
       LIMIT 4`,
    )
    .all(params.sessionId, params.workClass) as Array<{
    id: number;
    status: string;
    data_json: string | null;
  }>;
  let count = 0;
  for (const row of rows) {
    if (row.status === "failed") {
      count += 1;
      continue;
    }
    try {
      const payload = JSON.parse(row.data_json || "{}") as {
        proofVerdict?: string;
        taskValueLabel?: string;
      };
      if (
        payload.proofVerdict === "rejected" ||
        payload.taskValueLabel === "low_value" ||
        payload.taskValueLabel === "hollow"
      ) {
        count += 1;
      }
    } catch {
      continue;
    }
  }
  return count;
}

export function resolveAutonomyWorkClassBoundary(params: {
  sessionId: string;
  proposedWorkClass: AutonomyWorkClass;
}): AutonomyWorkClassBoundary {
  const recentBadOutcomeCount = countRecentBadOutcomes({
    sessionId: params.sessionId,
    workClass: params.proposedWorkClass,
  });
  if (recentBadOutcomeCount < 2) {
    return {
      workClass: params.proposedWorkClass,
      reason: "no_class_boundary",
      boundaryApplied: false,
      details: {
        recentBadOutcomeCount,
      },
    };
  }
  const nextWorkClass =
    params.proposedWorkClass === "diagnostic_work" ? "review_or_consolidation" : "diagnostic_work";
  return {
    workClass: nextWorkClass,
    reason: `repeated_bad_outcomes_for_${params.proposedWorkClass}`,
    boundaryApplied: true,
    details: {
      recentBadOutcomeCount,
      priorWorkClass: params.proposedWorkClass,
      nextWorkClass,
    },
  };
}

export function evaluateAutonomyToolProgressDecision(params: {
  sessionKey: string;
  toolName: string;
  toolCallId?: string | null;
  result: unknown;
  hardFailCount: number;
}): AutonomyProgressDecision | null {
  const context = resolveActiveAutonomyContext(params.sessionKey);
  if (!context) {
    return null;
  }
  const metadata = readPostcheckMetadata(params.result);
  if (metadata?.verdict !== "hard_fail") {
    return null;
  }
  const nextHardFailCount = params.hardFailCount + 1;
  if (context.workClass === "goal_work" && nextHardFailCount === 1) {
    return {
      action: "continue",
      reason: "single_hard_fail_budget_consumed",
      scope: "tool_postcheck",
      workClass: context.workClass,
      hostTaskId: context.hostTaskId,
      flowId: context.flowId,
      toolName: params.toolName,
      toolCallId: params.toolCallId ?? null,
      hardFailCount: nextHardFailCount,
      details: {
        verdict: metadata.verdict,
        postcheckReason: metadata.reason,
      },
    };
  }
  return {
    action: "terminate_turn",
    reason:
      context.workClass === "goal_work"
        ? "repeated_hard_fail_same_turn"
        : "hard_fail_not_allowed_for_bounded_work",
    scope: "tool_postcheck",
    workClass: context.workClass,
    hostTaskId: context.hostTaskId,
    flowId: context.flowId,
    toolName: params.toolName,
    toolCallId: params.toolCallId ?? null,
    hardFailCount: nextHardFailCount,
    details: {
      verdict: metadata.verdict,
      postcheckReason: metadata.reason,
    },
  };
}

export function evaluateAutonomyAssistantOutputDecision(params: {
  sessionKey: string;
  text: string;
}): AutonomyProgressDecision | null {
  const context = resolveActiveAutonomyContext(params.sessionKey);
  if (!context || !isPermissionDisallowedWorkClass(context.workClass)) {
    return null;
  }
  const text = String(params.text || "").trim();
  if (!text) {
    return null;
  }
  const matchedPattern = PERMISSION_SEEKING_PATTERNS.find((pattern) => pattern.test(text));
  if (!matchedPattern) {
    return null;
  }
  return {
    action: "terminate_turn",
    reason: "permission_seeking_not_allowed_for_autonomy_work_class",
    scope: "assistant_output",
    workClass: context.workClass,
    hostTaskId: context.hostTaskId,
    flowId: context.flowId,
    details: {
      matchedPattern: matchedPattern.source,
      preview: text.slice(0, 240),
    },
  };
}

export function appendAutonomyProgressDecisionEvent(params: {
  sessionKey: string;
  decision: AutonomyProgressDecision;
  now?: number;
}): void {
  const authority = getOrCreateStewardSession(params.sessionKey, params.now);
  appendStewardEvent({
    kind: "autonomy.progress.policy" as StewardEventKind,
    message: `autonomy progress ${params.decision.action}`,
    sessionId: authority.sessionId,
    flowId: params.decision.flowId,
    now: params.now,
    data: {
      sessionKey: params.sessionKey,
      scope: params.decision.scope,
      action: params.decision.action,
      reason: params.decision.reason,
      workClass: params.decision.workClass,
      hostTaskId: params.decision.hostTaskId,
      toolName: params.decision.toolName ?? null,
      toolCallId: params.decision.toolCallId ?? null,
      hardFailCount: params.decision.hardFailCount ?? null,
      details: params.decision.details ?? {},
    },
  });
}
