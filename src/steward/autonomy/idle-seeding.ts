import { getDb } from "../db/db-bootstrap.js";
import type { StewardFlowTaskRole, StewardFlowType } from "../db/runtime-schema.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import type { AutonomyWorkClass } from "./work-classifier.js";

export type SeededAutonomyTask = {
  flowId: number;
  taskId: number;
  workClass: AutonomyWorkClass;
  title: string;
  details: string;
};

export type IdleSeedDecision =
  | {
      seeded: true;
      workClass: AutonomyWorkClass;
      reason: string;
      task: SeededAutonomyTask;
    }
  | {
      seeded: false;
      workClass: AutonomyWorkClass;
      reason: "duplicate_seed_suppressed";
      duplicateFlowId: number;
    };

function workClassPlan(workClass: AutonomyWorkClass): {
  flowType: StewardFlowType;
  role: StewardFlowTaskRole;
  title: string;
  details: string;
} {
  switch (workClass) {
    case "goal_work":
      return {
        flowType: "research",
        role: "primary",
        title: "Autonomy: seed next proof-oriented goal",
        details: "Seed one bounded goal-oriented task that advances proof acquisition or validated operator value.",
      };
    case "diagnostic_work":
      return {
        flowType: "control",
        role: "diagnostic",
        title: "Autonomy: investigate blocked or failed runtime state",
        details: "Seed one bounded diagnostic task to resolve an active blocker or repeated failure pattern.",
      };
    case "review_or_consolidation":
      return {
        flowType: "maintenance",
        role: "diagnostic",
        title: "Autonomy: review and consolidate recent steward evidence",
        details: "Seed one bounded review/consolidation task without scheduling named recurring jobs in this slice.",
      };
    case "maintenance_work":
    default:
      return {
        flowType: "maintenance",
        role: "diagnostic",
        title: "Autonomy: perform bounded maintenance follow-up",
        details: "Seed one bounded maintenance task that improves runtime continuity without bypassing host-owned gates.",
      };
  }
}

function findDuplicateAutonomyFlow(sessionId: string, workClass: AutonomyWorkClass): number | null {
  const rows = getDb()
    .prepare(
      `SELECT id, state_json
       FROM steward_flows
       WHERE session_id = ?
         AND status IN ('running', 'resumable', 'blocked_transient', 'blocked_deterministic')
       ORDER BY id DESC`,
    )
    .all(sessionId) as Array<{ id: number; state_json: string }>;
  for (const row of rows) {
    try {
      const state = JSON.parse(row.state_json || "{}") as Record<string, unknown>;
      if (state.seeded_by === "autonomy" && state.autonomy_work_class === workClass) {
        return Number(row.id);
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function seedIdleAutonomyTask(params: {
  sessionId: string;
  workClass: AutonomyWorkClass;
  classificationReason: string;
  now?: number;
}): IdleSeedDecision {
  const now = params.now ?? Date.now();
  const duplicateFlowId = findDuplicateAutonomyFlow(params.sessionId, params.workClass);
  if (duplicateFlowId != null) {
    return {
      seeded: false,
      workClass: params.workClass,
      reason: "duplicate_seed_suppressed",
      duplicateFlowId,
    };
  }

  const plan = workClassPlan(params.workClass);
  const stateJson = JSON.stringify({
    seeded_by: "autonomy",
    autonomy_work_class: params.workClass,
    classification_reason: params.classificationReason,
    title: plan.title,
    details: plan.details,
  });
  const db = getDb();
  const flowResult = db
    .prepare(
      `INSERT INTO steward_flows (
         session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
       ) VALUES (?, ?, 'resumable', ?, ?, ?, ?, ?)` ,
    )
    .run(params.sessionId, plan.flowType, stateJson, process.pid, now, now, now) as { lastInsertRowid: number | bigint };
  const flowId = Number(flowResult.lastInsertRowid);
  const taskId = flowId;
  db.prepare(
    `INSERT INTO steward_flow_tasks (
       flow_id, task_id, role, link_status, created_ts, updated_ts
     ) VALUES (?, ?, ?, 'pending', ?, ?)` ,
  ).run(flowId, taskId, plan.role, now, now);

  appendStewardEvent({
    kind: "autonomy.task.seeded",
    message: plan.title,
    sessionId: params.sessionId,
    flowId,
    now,
    data: {
      taskId,
      workClass: params.workClass,
      classificationReason: params.classificationReason,
      flowType: plan.flowType,
      role: plan.role,
      details: plan.details,
    },
  });

  return {
    seeded: true,
    workClass: params.workClass,
    reason: params.classificationReason,
    task: {
      flowId,
      taskId,
      workClass: params.workClass,
      title: plan.title,
      details: plan.details,
    },
  };
}
