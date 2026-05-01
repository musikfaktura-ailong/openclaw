import { getDb } from "../db/db-bootstrap.js";
import { buildResearchTaskTemplate, recordCategorySelection, requiredUnderrepresentedCategory } from "../mission/goals-registry.js";
import type { StewardFlowTaskRole, StewardFlowType } from "../db/runtime-schema.js";
import type { AutonomyWorkClass } from "./work-classifier.js";

export type AutonomySeedPlan = {
  flowType: StewardFlowType;
  role: StewardFlowTaskRole;
  title: string;
  details: string;
  phase: string;
  goalKind: string;
};

export type StewardHostTaskRecord = {
  taskId: number;
  title: string;
  details: string;
  workClass: AutonomyWorkClass;
};

function latestProofSummary(sessionId: string): {
  verdict: "accepted" | "rejected" | null;
  score: number | null;
  failureClass: string | null;
  taskTitle: string | null;
} {
  const row = getDb()
    .prepare(
      `SELECT verdict, score, failure_class, task_title
       FROM steward_proofs
       WHERE session_id = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(sessionId) as
    | {
        verdict: "accepted" | "rejected";
        score: number;
        failure_class: string;
        task_title: string;
      }
    | undefined;
  return {
    verdict: row?.verdict ?? null,
    score: row == null ? null : Number(row.score ?? 0),
    failureClass: row?.failure_class ?? null,
    taskTitle: row?.task_title ?? null,
  };
}

function buildGoalWorkPlan(sessionId: string, now: number): AutonomySeedPlan {
  const latestProof = latestProofSummary(sessionId);
  if (!latestProof.verdict) {
    const requiredCategory = requiredUnderrepresentedCategory(now);
    const template = buildResearchTaskTemplate({
      phase: "pick",
      requiredCategory,
    });
    if (requiredCategory) {
      recordCategorySelection(requiredCategory, now);
    }
    return {
      flowType: "research",
      role: "primary",
      title: template.title,
      details: template.details,
      phase: "pick",
      goalKind: "proof_first_research",
    };
  }
  if (latestProof.verdict === "rejected") {
    return {
      flowType: "research",
      role: "primary",
      title: "Research prove: repair rejected steward proof",
      details:
        `Latest proof was rejected${latestProof.failureClass ? ` (${latestProof.failureClass})` : ""}. ` +
        "Seed one bounded follow-up task that closes the grounding or validation gap before any new proof attempt.",
      phase: "prove",
      goalKind: "repair_rejected_proof",
    };
  }
  return {
    flowType: "research",
    role: "primary",
    title: "Research commit: advance strongest steward opportunity",
    details:
      `Latest accepted proof${latestProof.taskTitle ? `: ${latestProof.taskTitle}.` : "."} ` +
      "Seed one bounded next-proof-first task that turns the strongest current opportunity into more operator-safe, reviewable evidence.",
    phase: "commit",
    goalKind: "advance_validated_opportunity",
  };
}

export function resolveAutonomySeedPlan(params: {
  sessionId: string;
  workClass: AutonomyWorkClass;
  classificationReason: string;
  now?: number;
}): AutonomySeedPlan {
  const now = params.now ?? Date.now();
  switch (params.workClass) {
    case "goal_work":
      return buildGoalWorkPlan(params.sessionId, now);
    case "diagnostic_work":
      return {
        flowType: "control",
        role: "diagnostic",
        title: "Autonomy: investigate blocked or failed runtime state",
        details:
          "Seed one bounded diagnostic task that resolves the current blocker or repeated failure pattern before new proof work continues.",
        phase: "diagnostic",
        goalKind: params.classificationReason,
      };
    case "review_or_consolidation":
      return {
        flowType: "maintenance",
        role: "diagnostic",
        title: "Autonomy: review and consolidate steward evidence",
        details:
          "Seed one bounded review/consolidation task that improves continuity and reviewability without bypassing named recurring jobs.",
        phase: "review",
        goalKind: params.classificationReason,
      };
    case "maintenance_work":
    default:
      return {
        flowType: "maintenance",
        role: "diagnostic",
        title: "Autonomy: perform bounded maintenance follow-up",
        details:
          "Seed one bounded maintenance task that improves runtime continuity while preserving truth, proof, and consequence ownership.",
        phase: "maintenance",
        goalKind: params.classificationReason,
      };
  }
}

export function createAutonomyHostTask(params: {
  sessionId: string;
  workClass: AutonomyWorkClass;
  title: string;
  details: string;
  triageArtifactPath?: string | null;
  triageKnowledgeId?: number | null;
  now?: number;
}): StewardHostTaskRecord {
  const now = params.now ?? Date.now();
  const result = getDb()
    .prepare(
      `INSERT INTO steward_host_tasks (
         session_id, source, status, work_class, title, details, triage_artifact_path, triage_knowledge_id,
         created_ts, updated_ts
       ) VALUES (?, 'autonomy', 'pending', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.sessionId,
      params.workClass,
      params.title,
      params.details,
      params.triageArtifactPath ?? null,
      params.triageKnowledgeId ?? null,
      now,
      now,
    ) as { lastInsertRowid: number | bigint };
  return {
    taskId: Number(result.lastInsertRowid),
    title: params.title,
    details: params.details,
    workClass: params.workClass,
  };
}
