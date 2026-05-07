import { getDb } from "../db/db-bootstrap.js";
import type { StewardFlowTaskRole, StewardFlowType } from "../db/runtime-schema.js";
import { withImmediateTransaction } from "../db/tx.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import {
  createAutonomyHostTask,
  resolveAutonomySeedPlan,
} from "./goal-orchestrator.js";
import { persistAutonomyTriageArtifact } from "./triage-artifacts.js";
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

export async function seedIdleAutonomyTask(params: {
  sessionId: string;
  sessionKey: string;
  workClass: AutonomyWorkClass;
  classificationReason: string;
  artifactRoot?: string;
  now?: number;
}): Promise<IdleSeedDecision> {
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

  const plan = resolveAutonomySeedPlan({
    sessionId: params.sessionId,
    workClass: params.workClass,
    classificationReason: params.classificationReason,
    now,
  });
  const triage = await persistAutonomyTriageArtifact({
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    workClass: params.workClass,
    classificationReason: params.classificationReason,
    plan,
    artifactRoot: params.artifactRoot,
    now,
  });
  const { flowId, hostTask } = withImmediateTransaction(getDb(), () => {
    const db = getDb();
    const provisionalStateJson = JSON.stringify({
      seeded_by: "autonomy",
      autonomy_work_class: params.workClass,
      classification_reason: params.classificationReason,
      title: plan.title,
      details: plan.details,
      host_task_id: null,
      triage_artifact_path: triage.artifactPath,
      triage_knowledge_id: triage.knowledgeId,
      goal_phase: plan.phase,
      goal_kind: plan.goalKind,
    });
    const flowResult = db
      .prepare(
        `INSERT INTO steward_flows (
           session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
         ) VALUES (?, ?, 'resumable', ?, ?, ?, ?, ?)` ,
      )
      .run(
        params.sessionId,
        plan.flowType,
        provisionalStateJson,
        process.pid,
        now,
        now,
        now,
      ) as { lastInsertRowid: number | bigint };
    const flowId = Number(flowResult.lastInsertRowid);
    const hostTask = createAutonomyHostTask({
      sessionId: params.sessionId,
      seedFlowId: flowId,
      workClass: params.workClass,
      title: plan.title,
      details: plan.details,
      triageArtifactPath: triage.artifactPath,
      triageKnowledgeId: triage.knowledgeId,
      now,
    });
    const stateJson = JSON.stringify({
      seeded_by: "autonomy",
      autonomy_work_class: params.workClass,
      classification_reason: params.classificationReason,
      title: plan.title,
      details: plan.details,
      host_task_id: hostTask.taskId,
      triage_artifact_path: triage.artifactPath,
      triage_knowledge_id: triage.knowledgeId,
      goal_phase: plan.phase,
      goal_kind: plan.goalKind,
    });
    db.prepare(
      `UPDATE steward_flows
       SET state_json = ?, updated_ts = ?, heartbeat_ts = ?
       WHERE id = ?`,
    ).run(stateJson, now, now, flowId);
    db.prepare(
      `INSERT INTO steward_flow_tasks (
         flow_id, task_id, role, link_status, created_ts, updated_ts
       ) VALUES (?, ?, ?, 'pending', ?, ?)` ,
    ).run(flowId, hostTask.taskId, plan.role, now, now);
    return {
      flowId,
      hostTask,
    };
  });
  const taskId = hostTask.taskId;

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
      triageArtifactPath: triage.artifactPath,
      triageKnowledgeId: triage.knowledgeId,
      goalPhase: plan.phase,
      goalKind: plan.goalKind,
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
