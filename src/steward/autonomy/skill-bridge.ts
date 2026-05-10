import { getDb } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { extractSkillSequence, matchSkillSequence } from "../memory/skills.js";
import type { RecordedStewardMilestone } from "./milestone-registry.js";

type MilestoneEvidence = {
  workerProofId?: number;
  [key: string]: unknown;
};

type SkillMatch = {
  matchedSkillId: number;
  matchedSkillTitle: string;
  matchedSkillScore: number;
};

function readWorkerProof(params: { workerProofId: number; sessionId: string }): {
  taskTitle: string;
  flowId: number | null;
  taskId: number | null;
} | null {
  const row = getDb()
    .prepare(
      `SELECT task_title, flow_id, task_id
       FROM steward_proofs
       WHERE id = ?
         AND session_id = ?
       LIMIT 1`,
    )
    .get(params.workerProofId, params.sessionId) as
    | {
        task_title: string;
        flow_id: number | null;
        task_id: number | null;
      }
    | undefined;
  if (!row) {
    return null;
  }
  return {
    taskTitle: row.task_title,
    flowId: row.flow_id,
    taskId: row.task_id,
  };
}

function readPrimaryToolSequence(flowId: number): string[] {
  const rows = getDb()
    .prepare(
      `SELECT data_json
       FROM steward_events
       WHERE flow_id = ?
         AND kind IN ('tool.postcheck.normalized', 'tool.postcheck.classified')
       ORDER BY id ASC`,
    )
    .all(flowId) as Array<{ data_json: string }>;
  return rows
    .map((row) => {
      const data = JSON.parse(row.data_json || "{}") as { toolName?: unknown };
      return String(data.toolName ?? "").trim();
    })
    .filter(Boolean);
}

export async function extractMilestoneSkill(params: {
  milestone: RecordedStewardMilestone;
  sessionId: string;
  now: number;
}): Promise<number | null> {
  const evidence = params.milestone.evidence as MilestoneEvidence;
  const workerProofId = Number(evidence.workerProofId ?? 0);
  if (!workerProofId) {
    return null;
  }
  const proof = readWorkerProof({
    workerProofId,
    sessionId: params.sessionId,
  });
  if (!proof || proof.flowId == null) {
    return null;
  }
  const toolSequence = readPrimaryToolSequence(proof.flowId);
  const knowledgeId = await extractSkillSequence({
    title: proof.taskTitle,
    toolSequence,
    taskId: proof.taskId ?? workerProofId,
    sessionKey: params.sessionId,
    now: params.now,
  });
  if (knowledgeId == null) {
    return null;
  }
  appendStewardEvent({
    kind: "autonomy.skill.extracted",
    message: `Extracted skill from sealed milestone ${params.milestone.milestoneId}`,
    sessionId: params.sessionId,
    now: params.now,
    data: {
      milestoneId: params.milestone.milestoneId,
      verdictId: params.milestone.verdictId,
      workerProofId,
      knowledgeId,
    },
  });
  return knowledgeId;
}

export function matchGapSkill(params: {
  title: string;
  sessionId: string;
}): SkillMatch | null {
  const match = matchSkillSequence({
    title: params.title,
    sessionKey: params.sessionId,
  });
  if (!match) {
    return null;
  }
  return {
    matchedSkillId: match.id,
    matchedSkillTitle: match.title,
    matchedSkillScore: match.score,
  };
}
