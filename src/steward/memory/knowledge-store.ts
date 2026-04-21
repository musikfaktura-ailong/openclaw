import type { DatabaseSync } from "node:sqlite";
import { getDb } from "../db/db-bootstrap.js";
import { loadSqliteVecExtension } from "../../memory-host-sdk/host/sqlite-vec.js";
import { embedWithStewardModel, type StewardEmbedder } from "./embedder.js";
import type { StewardKnowledgeMetadata } from "./memory-schema.js";
import type { StewardKnowledgeMemoryType } from "./memory-types.js";

const VECTOR_TABLE = "steward_knowledge_vec";

type VectorState = {
  available: boolean | null;
  dims: number | null;
};

const vectorStateByDb = new WeakMap<DatabaseSync, VectorState>();

export type StewardKnowledgeEntry = {
  id: number;
  sessionKey: string | null;
  memoryType: StewardKnowledgeMemoryType;
  text: string;
  metadata: StewardKnowledgeMetadata;
  score: number;
  rawDistance: number;
  createdTs: number;
  updatedTs: number;
};

function getVectorState(db: DatabaseSync): VectorState {
  const existing = vectorStateByDb.get(db);
  if (existing) {
    return existing;
  }
  const created: VectorState = { available: null, dims: null };
  vectorStateByDb.set(db, created);
  return created;
}

function vectorToBlob(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer.slice(0));
}

function blobToVector(blob: Uint8Array): Float32Array {
  const bytes =
    blob instanceof Buffer ? blob : Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    dot += l * r;
    leftMagnitude += l * l;
    rightMagnitude += r * r;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

async function ensureVectorReady(db: DatabaseSync, dimensions: number): Promise<boolean> {
  const state = getVectorState(db);
  if (state.available === false) {
    return false;
  }
  if (state.available === true && state.dims === dimensions) {
    return true;
  }
  const loaded = await loadSqliteVecExtension({ db });
  if (!loaded.ok) {
    state.available = false;
    return false;
  }
  if (state.dims && state.dims !== dimensions) {
    db.exec(`DROP TABLE IF EXISTS ${VECTOR_TABLE}`);
  }
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS ${VECTOR_TABLE} USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[${dimensions}]
    )`,
  );
  state.available = true;
  state.dims = dimensions;
  return true;
}

function buildKnowledgeFilters(params: {
  sessionKey?: string;
  memoryTypes?: StewardKnowledgeMemoryType[];
}): { sql: string; values: Array<string> } {
  const clauses: string[] = [];
  const values: string[] = [];
  if (params.sessionKey) {
    clauses.push("(k.session_key = ? OR k.session_key IS NULL)");
    values.push(params.sessionKey);
  }
  if (params.memoryTypes?.length) {
    clauses.push(`k.memory_type IN (${params.memoryTypes.map(() => "?").join(", ")})`);
    values.push(...params.memoryTypes);
  }
  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function mapKnowledgeRow(row: {
  id: number;
  session_key: string | null;
  memory_type: StewardKnowledgeMemoryType;
  text: string;
  metadata_json: string;
  created_ts: number;
  updated_ts: number;
  dist: number;
}): StewardKnowledgeEntry {
  const rawDistance = Number(row.dist) || 0;
  return {
    id: row.id,
    sessionKey: row.session_key,
    memoryType: row.memory_type,
    text: row.text,
    metadata: JSON.parse(row.metadata_json || "{}") as StewardKnowledgeMetadata,
    score: 1 - rawDistance,
    rawDistance,
    createdTs: row.created_ts,
    updatedTs: row.updated_ts,
  };
}

export async function storeKnowledge(params: {
  sessionKey?: string;
  text: string;
  metadata?: StewardKnowledgeMetadata;
  memoryType?: StewardKnowledgeMemoryType;
  embedder?: StewardEmbedder;
  db?: DatabaseSync;
  now?: number;
}): Promise<number> {
  const db = params.db ?? getDb();
  const now = params.now ?? Date.now();
  const memoryType = params.memoryType ?? "shared_thread";
  const text = params.text.trim().slice(0, 4_000);
  const embeddingResult = await embedWithStewardModel({
    text,
    embedder: params.embedder,
  });
  const metadata = {
    ...(params.metadata ?? {}),
    fallback_embed: embeddingResult.fallback,
  };
  const inserted = db
    .prepare(
      `INSERT INTO steward_knowledge (
         session_key,
         memory_type,
         text,
         metadata_json,
         embedding_blob,
         embedding_dims,
         embedding_model,
         created_ts,
         updated_ts
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.sessionKey ?? null,
      memoryType,
      text,
      JSON.stringify(metadata),
      vectorToBlob(embeddingResult.embedding),
      embeddingResult.dimensions,
      embeddingResult.model,
      now,
      now,
    ) as { lastInsertRowid: number | bigint };
  const id = Number(inserted.lastInsertRowid);
  if (await ensureVectorReady(db, embeddingResult.dimensions)) {
    try {
      db.prepare(`DELETE FROM ${VECTOR_TABLE} WHERE id = ?`).run(String(id));
    } catch {}
    db.prepare(`INSERT INTO ${VECTOR_TABLE} (id, embedding) VALUES (?, ?)`).run(
      String(id),
      vectorToBlob(embeddingResult.embedding),
    );
  }
  return id;
}

export async function searchKnowledge(params: {
  query: string;
  sessionKey?: string;
  memoryTypes?: StewardKnowledgeMemoryType[];
  topK?: number;
  embedder?: StewardEmbedder;
  db?: DatabaseSync;
}): Promise<StewardKnowledgeEntry[]> {
  const db = params.db ?? getDb();
  const topK = Math.max(1, params.topK ?? 5);
  const queryEmbedding = await embedWithStewardModel({
    text: params.query.trim().slice(0, 2_000),
    embedder: params.embedder,
  });
  const filters = buildKnowledgeFilters({
    sessionKey: params.sessionKey,
    memoryTypes: params.memoryTypes,
  });

  if (await ensureVectorReady(db, queryEmbedding.dimensions)) {
    const rows = db
      .prepare(
        `SELECT
           k.id,
           k.session_key,
           k.memory_type,
           k.text,
           k.metadata_json,
           k.created_ts,
           k.updated_ts,
           vec_distance_cosine(v.embedding, ?) AS dist
         FROM ${VECTOR_TABLE} v
         JOIN steward_knowledge k ON k.id = CAST(v.id AS INTEGER)
         ${filters.sql}
         ORDER BY dist ASC
         LIMIT ?`,
      )
      .all(
        vectorToBlob(queryEmbedding.embedding),
        ...filters.values,
        topK,
      ) as Array<{
      id: number;
      session_key: string | null;
      memory_type: StewardKnowledgeMemoryType;
      text: string;
      metadata_json: string;
      created_ts: number;
      updated_ts: number;
      dist: number;
    }>;
    return rows.map(mapKnowledgeRow);
  }

  const fallbackRows = db
    .prepare(
      `SELECT
         id,
         session_key,
         memory_type,
         text,
         metadata_json,
         embedding_blob,
         created_ts,
         updated_ts
       FROM steward_knowledge k
       ${filters.sql}`,
    )
    .all(...filters.values) as Array<{
    id: number;
    session_key: string | null;
    memory_type: StewardKnowledgeMemoryType;
    text: string;
    metadata_json: string;
    embedding_blob: Uint8Array;
    created_ts: number;
    updated_ts: number;
  }>;
  return fallbackRows
    .map((row) => {
      const score = cosineSimilarity(queryEmbedding.embedding, blobToVector(row.embedding_blob));
      return {
        id: row.id,
        sessionKey: row.session_key,
        memoryType: row.memory_type,
        text: row.text,
        metadata: JSON.parse(row.metadata_json || "{}") as StewardKnowledgeMetadata,
        score,
        rawDistance: 1 - score,
        createdTs: row.created_ts,
        updatedTs: row.updated_ts,
      } satisfies StewardKnowledgeEntry;
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

export async function retrieveSimilarKnowledge(
  params: Parameters<typeof searchKnowledge>[0],
): Promise<StewardKnowledgeEntry[]> {
  return await searchKnowledge(params);
}
