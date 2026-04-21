import { getDb } from "../db/db-bootstrap.js";
import { storeKnowledge } from "./knowledge-store.js";
import type { StewardEmbedder } from "./embedder.js";

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9æøå\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

export async function extractSkillSequence(params: {
  sessionKey?: string;
  taskId: number;
  title: string;
  toolSequence: string[];
  embedder?: StewardEmbedder;
  now?: number;
}): Promise<number | null> {
  const title = params.title.trim();
  const toolSequence = params.toolSequence.map((tool) => tool.trim()).filter(Boolean);
  if (!title || toolSequence.length === 0) {
    return null;
  }
  return await storeKnowledge({
    sessionKey: params.sessionKey,
    text: `SKILL_SEQUENCE ${title}: ${toolSequence.join(" -> ")}`,
    memoryType: "skill_sequence",
    embedder: params.embedder,
    now: params.now,
    metadata: {
      task_id: params.taskId,
      title,
      normalized: normalizeTitle(title),
      tool_sequence: toolSequence,
    },
  });
}

export function matchSkillSequence(params: {
  title: string;
  sessionKey?: string;
}): {
  id: number;
  title: string;
  score: number;
  toolSequence: string[];
} | null {
  const normalized = normalizeTitle(params.title);
  const queryWords = new Set(normalized.split(" ").filter(Boolean));
  if (queryWords.size === 0) {
    return null;
  }
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, metadata_json
       FROM steward_knowledge
       WHERE memory_type = 'skill_sequence'
         AND (? IS NULL OR session_key = ? OR session_key IS NULL)`,
    )
    .all(params.sessionKey ?? null, params.sessionKey ?? null) as Array<{
    id: number;
    metadata_json: string;
  }>;
  let best:
    | {
        id: number;
        title: string;
        score: number;
        toolSequence: string[];
      }
    | null = null;
  for (const row of rows) {
    const metadata = JSON.parse(row.metadata_json || "{}") as {
      title?: string;
      normalized?: string;
      tool_sequence?: string[];
    };
    const candidateWords = new Set(String(metadata.normalized ?? "").split(" ").filter(Boolean));
    const score = jaccardSimilarity(queryWords, candidateWords);
    if (score >= 0.3 && (!best || score > best.score)) {
      best = {
        id: row.id,
        title: String(metadata.title ?? ""),
        score,
        toolSequence: Array.isArray(metadata.tool_sequence) ? metadata.tool_sequence : [],
      };
    }
  }
  return best;
}
