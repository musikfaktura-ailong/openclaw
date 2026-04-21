import { getDb } from "../db/db-bootstrap.js";
import { searchKnowledge, storeKnowledge, type StewardKnowledgeEntry } from "./knowledge-store.js";
import { resolveMemoryWeight, type RelationshipMemoryType } from "./memory-types.js";
import type { StewardEmbedder } from "./embedder.js";

const FIRST_CONTACT_RECORDS = [
  {
    memoryType: "operator_preference",
    key: "preferred_address",
    value: "operator",
    importance: 0.95,
    summary: "OPERATOR_PREFERENCE preferred_address=operator",
  },
  {
    memoryType: "operator_boundary",
    key: "truth_and_discretion",
    value: "Truth first. No fabricated proofs. Discretion is mandatory.",
    importance: 1.0,
    summary: "OPERATOR_BOUNDARY truth_first_and_discretion_required",
  },
  {
    memoryType: "household_routine",
    key: "session_start",
    value: "Recall priorities, boundaries, and unresolved threads before acting.",
    importance: 0.9,
    summary: "HOUSEHOLD_ROUTINE recall_relationship_context_before_action",
  },
  {
    memoryType: "operator_boundary",
    key: "non_negotiables",
    value: "No deceptive shortcuts. No silent drift away from truthful stewardship.",
    importance: 1.0,
    summary: "NON_NEGOTIABLES no_deceptive_shortcuts no_silent_drift",
  },
  {
    memoryType: "shared_thread",
    key: "current_priorities",
    value: "Build a truthful steward that preserves continuity and helps the operator.",
    importance: 0.95,
    summary: "CURRENT_PRIORITIES truthful_stewardship operator_help continuity",
  },
] as const satisfies Array<{
  memoryType: RelationshipMemoryType;
  key: string;
  value: string;
  importance: number;
  summary: string;
}>;

export type RelationshipMemoryRecallEntry = {
  memoryId: number;
  knowledgeId: number;
  memoryType: RelationshipMemoryType;
  payload: Record<string, unknown>;
  summary: string;
  score: number;
  weight: number;
  salience: number;
  importance: number;
  createdTs: number;
};

function buildRecordText(params: {
  memoryType: RelationshipMemoryType;
  payload: Record<string, unknown>;
  summary?: string;
}): string {
  if (params.summary?.trim()) {
    return params.summary.trim().slice(0, 4_000);
  }
  const key = String(params.payload.key ?? "item").trim();
  const value = String(params.payload.value ?? "").trim();
  return `${params.memoryType.toUpperCase()} ${key}=${value}`.slice(0, 4_000);
}

function mapRecallEntry(hit: StewardKnowledgeEntry): RelationshipMemoryRecallEntry {
  const metadata = hit.metadata;
  const payload = (metadata.payload ?? {}) as Record<string, unknown>;
  const importance = Number(metadata.importance ?? 0.5) || 0.5;
  const weight = resolveMemoryWeight(String(metadata.memory_type ?? hit.memoryType));
  const ageDays = Math.max(0, (Date.now() - hit.createdTs) / 86_400_000);
  const recency = 1 / (1 + ageDays);
  const salience = hit.score * Math.max(0.1, importance) * recency * weight;
  return {
    memoryId: Number(metadata.memory_id ?? 0) || hit.id,
    knowledgeId: hit.id,
    memoryType: String(metadata.memory_type ?? hit.memoryType) as RelationshipMemoryType,
    payload,
    summary: hit.text,
    score: hit.score,
    weight,
    salience,
    importance,
    createdTs: hit.createdTs,
  };
}

export async function storeRelationshipMemory(params: {
  sessionKey: string;
  memoryType: RelationshipMemoryType;
  payload: Record<string, unknown>;
  summary?: string;
  importance?: number;
  source?: string;
  taskId?: number;
  confidenceScore?: number;
  lastVerifiedTs?: number;
  embedder?: StewardEmbedder;
  now?: number;
}): Promise<number> {
  const db = getDb();
  const now = params.now ?? Date.now();
  const importance = params.importance ?? 0.5;
  const payload = { ...params.payload };
  const knowledgeId = await storeKnowledge({
    db,
    sessionKey: params.sessionKey,
    text: buildRecordText({
      memoryType: params.memoryType,
      payload,
      summary: params.summary,
    }),
    memoryType: params.memoryType,
    embedder: params.embedder,
    now,
    metadata: {
      relationship_memory: true,
      memory_type: params.memoryType,
      importance,
      source: params.source ?? "relationship",
      payload,
      task_id: params.taskId ?? null,
      confidence_score: params.confidenceScore ?? null,
      last_verified_ts: params.lastVerifiedTs ?? null,
    },
  });
  const inserted = db
    .prepare(
      `INSERT INTO steward_memories (
         session_key,
         knowledge_id,
         memory_type,
         importance,
         salience_weight,
         source,
         task_id,
         payload_json,
         confidence_score,
         last_verified_ts,
         created_ts,
         updated_ts
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.sessionKey,
      knowledgeId,
      params.memoryType,
      importance,
      resolveMemoryWeight(params.memoryType),
      params.source ?? "relationship",
      params.taskId ?? null,
      JSON.stringify(payload),
      params.confidenceScore ?? null,
      params.lastVerifiedTs ?? null,
      now,
      now,
    ) as { lastInsertRowid: number | bigint };
  const memoryId = Number(inserted.lastInsertRowid);
  db.prepare(`UPDATE steward_knowledge SET metadata_json = ? WHERE id = ?`).run(
    JSON.stringify({
      relationship_memory: true,
      memory_id: memoryId,
      memory_type: params.memoryType,
      importance,
      source: params.source ?? "relationship",
      payload,
      task_id: params.taskId ?? null,
      confidence_score: params.confidenceScore ?? null,
      last_verified_ts: params.lastVerifiedTs ?? null,
    }),
    knowledgeId,
  );
  return memoryId;
}

export async function bootstrapRelationshipFirstContact(params: {
  sessionKey: string;
  embedder?: StewardEmbedder;
}): Promise<boolean> {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM steward_memories
       WHERE session_key = ?
         AND source = 'first_contact_bootstrap'`,
    )
    .get(params.sessionKey) as { count: number };
  if ((existing.count ?? 0) >= FIRST_CONTACT_RECORDS.length) {
    return false;
  }
  for (const record of FIRST_CONTACT_RECORDS) {
    await storeRelationshipMemory({
      sessionKey: params.sessionKey,
      memoryType: record.memoryType,
      payload: { key: record.key, value: record.value },
      summary: record.summary,
      importance: record.importance,
      source: "first_contact_bootstrap",
      embedder: params.embedder,
    });
  }
  return true;
}

export async function recallRelationshipMemory(params: {
  sessionKey: string;
  query?: string;
  memoryType?: RelationshipMemoryType;
  topK?: number;
  embedder?: StewardEmbedder;
}): Promise<RelationshipMemoryRecallEntry[]> {
  const hits = await searchKnowledge({
    sessionKey: params.sessionKey,
    query:
      params.query ??
      "operator preferences boundaries routines shared threads stewardship continuity",
    memoryTypes: params.memoryType ? [params.memoryType] : undefined,
    topK: Math.max((params.topK ?? 12) * 2, 12),
    embedder: params.embedder,
  });
  return hits
    .map(mapRecallEntry)
    .sort((left, right) => right.salience - left.salience)
    .slice(0, params.topK ?? 12);
}

export async function injectRelationshipContext(params: {
  sessionKey: string;
  query?: string;
  topK?: number;
  embedder?: StewardEmbedder;
}): Promise<string> {
  await bootstrapRelationshipFirstContact({
    sessionKey: params.sessionKey,
    embedder: params.embedder,
  });
  const memories = await recallRelationshipMemory(params);
  if (memories.length === 0) {
    return "";
  }
  const lines = memories.map((memory, index) => {
    const key = String(memory.payload.key ?? "").trim();
    const value = String(memory.payload.value ?? "").trim();
    if (key && value) {
      return `${index + 1}. [${memory.memoryType}] ${key}=${value}`;
    }
    return `${index + 1}. [${memory.memoryType}] ${memory.summary}`;
  });
  return ["## Steward Relationship Memory", ...lines].join("\n");
}

export function reinforceTruthMemory(params: {
  memoryId: number;
  delta?: number;
  source?: string;
  now?: number;
}): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         m.id,
         m.knowledge_id,
         m.confidence_score,
         k.metadata_json
       FROM steward_memories m
       JOIN steward_knowledge k ON k.id = m.knowledge_id
       WHERE m.id = ?`,
    )
    .get(params.memoryId) as {
    id: number;
    knowledge_id: number;
    confidence_score: number | null;
    metadata_json: string;
  } | null;
  if (!row) {
    return false;
  }
  const nextConfidence = Math.min(1, (Number(row.confidence_score) || 0) + (params.delta ?? 0.1));
  const nextVerified = params.now ?? Date.now();
  db.prepare(
    `UPDATE steward_memories
     SET confidence_score = ?, last_verified_ts = ?, updated_ts = ?
     WHERE id = ?`,
  ).run(nextConfidence, nextVerified, nextVerified, params.memoryId);
  const metadata = JSON.parse(row.metadata_json || "{}") as Record<string, unknown>;
  metadata.confidence_score = nextConfidence;
  metadata.last_verified_ts = nextVerified;
  metadata.reinforced_by = params.source ?? "truth_reinforced";
  db.prepare(`UPDATE steward_knowledge SET metadata_json = ?, updated_ts = ? WHERE id = ?`).run(
    JSON.stringify(metadata),
    nextVerified,
    row.knowledge_id,
  );
  return true;
}

export async function recordSessionContinuityMemory(params: {
  sessionKey: string;
  aborted: boolean;
  now?: number;
  embedder?: StewardEmbedder;
}): Promise<number> {
  const now = params.now ?? Date.now();
  return await storeRelationshipMemory({
    sessionKey: params.sessionKey,
    memoryType: "shared_thread",
    payload: {
      key: "last_turn",
      value: params.aborted ? "aborted" : "completed",
      ts: now,
    },
    summary: `SESSION_CONTINUITY last_turn=${params.aborted ? "aborted" : "completed"}`,
    importance: 0.35,
    source: "session_turn_complete",
    embedder: params.embedder,
    now,
  });
}
