import { createHash } from "node:crypto";
import { getDb } from "../db/db-bootstrap.js";
import {
  searchKnowledge,
  storeKnowledge,
  type StewardKnowledgeEntry,
} from "../memory/knowledge-store.js";
import type { StewardKnowledgeMetadata } from "../memory/memory-schema.js";
import type {
  ProofExampleLabel,
  ProofFailureClass,
  ProofTaskType,
  ProofVerdict,
} from "./proof-types.js";

export type ProofExampleRecord = {
  id: number;
  knowledgeId: number;
  taskType: ProofTaskType;
  label: ProofExampleLabel;
  labelSource: string;
  judgeVerdict: ProofVerdict;
  judgeReason: string;
  failureClass: ProofFailureClass | "";
  taskTitle: string;
  proofExcerpt: string;
  score: number;
  createdTs: number;
  metadata: StewardKnowledgeMetadata;
};

function buildProofExampleText(params: {
  taskTitle: string;
  proofExcerpt: string;
  judgeReason: string;
  failureClass: ProofFailureClass | "";
}): string {
  return [
    params.taskTitle.trim(),
    params.proofExcerpt.trim(),
    params.judgeReason.trim(),
    params.failureClass.trim(),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4_000);
}

export function buildProofExampleContentHash(params: {
  taskType: ProofTaskType;
  proofExcerpt: string;
  failureClass?: ProofFailureClass | "";
  taskTitle?: string;
}): string {
  const payload = [
    params.taskType,
    params.failureClass ?? "",
    params.taskTitle ?? "",
    params.proofExcerpt.trim(),
  ].join("\n");
  return createHash("sha1").update(payload, "utf8").digest("hex");
}

function mapProofExample(hit: StewardKnowledgeEntry): ProofExampleRecord | null {
  const metadata = hit.metadata;
  if (!metadata.proof_example || typeof metadata.task_type !== "string" || typeof metadata.label !== "string") {
    return null;
  }
  return {
    id: Number(metadata.proof_example_id ?? 0) || 0,
    knowledgeId: hit.id,
    taskType: metadata.task_type as ProofTaskType,
    label: metadata.label as ProofExampleLabel,
    labelSource: String(metadata.label_source ?? "judge"),
    judgeVerdict: String(metadata.judge_verdict ?? "rejected") as ProofVerdict,
    judgeReason: String(metadata.judge_reason ?? ""),
    failureClass: String(metadata.failure_class ?? "") as ProofFailureClass | "",
    taskTitle: String(metadata.task_title ?? ""),
    proofExcerpt: hit.text,
    score: hit.score,
    createdTs: hit.createdTs,
    metadata,
  };
}

export async function storeProofExample(params: {
  taskType: ProofTaskType;
  label: ProofExampleLabel;
  judgeVerdict: ProofVerdict;
  judgeReason: string;
  proofExcerpt: string;
  taskTitle?: string;
  failureClass?: ProofFailureClass | "";
  labelSource?: string;
  sessionKey?: string;
  metadata?: Record<string, unknown>;
  now?: number;
}): Promise<number> {
  const db = getDb();
  const now = params.now ?? Date.now();
  const contentHash = buildProofExampleContentHash({
    taskType: params.taskType,
    proofExcerpt: params.proofExcerpt,
    failureClass: params.failureClass ?? "",
    taskTitle: params.taskTitle,
  });
  const existing = db
    .prepare(
      `SELECT id
       FROM steward_proof_examples
       WHERE content_hash = ?
         AND label_source = ?
       LIMIT 1`,
    )
    .get(contentHash, params.labelSource ?? "judge") as { id: number } | undefined;
  if (existing?.id) {
    return existing.id;
  }

  const knowledgeId = await storeKnowledge({
    db,
    sessionKey: params.sessionKey,
    memoryType: "skill_context",
    text: buildProofExampleText({
      taskTitle: params.taskTitle ?? "",
      proofExcerpt: params.proofExcerpt,
      judgeReason: params.judgeReason,
      failureClass: params.failureClass ?? "",
    }),
    metadata: {
      proof_example: true,
      task_type: params.taskType,
      label: params.label,
      label_source: params.labelSource ?? "judge",
      judge_verdict: params.judgeVerdict,
      judge_reason: params.judgeReason,
      failure_class: params.failureClass ?? "",
      task_title: params.taskTitle ?? "",
      content_hash: contentHash,
      ...params.metadata,
    },
    now,
  });

  const inserted = db
    .prepare(
      `INSERT INTO steward_proof_examples (
         knowledge_id,
         task_type,
         label,
         label_source,
         judge_verdict,
         judge_reason,
         failure_class,
         task_title,
         content_hash,
         created_ts,
         updated_ts
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      knowledgeId,
      params.taskType,
      params.label,
      params.labelSource ?? "judge",
      params.judgeVerdict,
      params.judgeReason,
      params.failureClass ?? "",
      params.taskTitle ?? "",
      contentHash,
      now,
      now,
    ) as { lastInsertRowid: number | bigint };
  const proofExampleId = Number(inserted.lastInsertRowid);

  db.prepare(`UPDATE steward_knowledge SET metadata_json = ?, updated_ts = ? WHERE id = ?`).run(
    JSON.stringify({
      proof_example: true,
      proof_example_id: proofExampleId,
      task_type: params.taskType,
      label: params.label,
      label_source: params.labelSource ?? "judge",
      judge_verdict: params.judgeVerdict,
      judge_reason: params.judgeReason,
      failure_class: params.failureClass ?? "",
      task_title: params.taskTitle ?? "",
      content_hash: contentHash,
      ...params.metadata,
    }),
    now,
    knowledgeId,
  );

  return proofExampleId;
}

export async function retrieveSimilarProofExamples(params: {
  query: string;
  taskType: ProofTaskType;
  labels?: ProofExampleLabel[];
  topK?: number;
}): Promise<ProofExampleRecord[]> {
  const hits = await searchKnowledge({
    query: params.query,
    memoryTypes: ["skill_context"],
    topK: Math.max((params.topK ?? 5) * 3, 12),
  });
  return hits
    .map(mapProofExample)
    .filter((record): record is ProofExampleRecord => Boolean(record))
    .filter((record) => record.taskType === params.taskType)
    .filter((record) => !params.labels?.length || params.labels.includes(record.label))
    .sort((left, right) => right.score - left.score)
    .slice(0, params.topK ?? 5);
}
