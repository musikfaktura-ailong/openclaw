import { getDb } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { storeRelationshipMemory } from "../memory/relationship-memory.js";
import type { RelationshipMemoryType } from "../memory/memory-types.js";
import type { StewardEmbedder } from "../memory/embedder.js";
import { DAILY_SELF_REVIEW_CADENCE_MS } from "./job-types.js";

export type DailySelfReviewSnapshot = {
  day: string;
  windowStartTs: number;
  windowEndTs: number;
  eventCount24h: number;
  acceptedProofCount24h: number;
  rejectedProofCount24h: number;
  failedPrimaryTasks24h: number;
  openFlowCount: number;
};

export type DailySelfReviewCandidateType =
  | "rule"
  | "preference"
  | "fact"
  | "pattern"
  | "procedure";

export type DailySelfReviewCandidate = {
  candidateType: DailySelfReviewCandidateType;
  memoryType: RelationshipMemoryType;
  text: string;
  payload: Record<string, unknown>;
  importance: number;
  confidenceScore: number;
};

export type DailySelfReviewRunResult = {
  created: boolean;
  reused: boolean;
  day: string;
  flowId: number;
  taskId: number;
  extractedCount: number;
};

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function stableKey(prefix: string, text: string): string {
  const normalized = normalizeText(text).toLowerCase();
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return `${prefix}_${hash.toString(16).padStart(8, "0")}`;
}

function parseRisk(bracket: string | undefined): "low" | "med" | "high" | null {
  if (!bracket) return null;
  const normalized = bracket.trim().toLowerCase();
  const explicit = normalized.match(/risk\s*=\s*(low|med|medium|high)/);
  if (explicit?.[1]) {
    return explicit[1] === "medium" ? "med" : (explicit[1] as "low" | "med" | "high");
  }
  if (normalized === "low" || normalized === "med" || normalized === "medium" || normalized === "high") {
    return normalized === "medium" ? "med" : (normalized as "low" | "med" | "high");
  }
  return null;
}

function candidateFromLine(line: string): DailySelfReviewCandidate | null {
  const match = line.trim().match(/^(RULE|PREF|FACT|PATTERN|PROC)\s*(?:\[([^\]]+)\])?\s*:\s*(.+)$/i);
  if (!match) {
    return null;
  }
  const tag = match[1]!.toUpperCase();
  const risk = parseRisk(match[2]);
  const body = normalizeText(match[3] ?? "");
  if (!body || body.length > 240) {
    return null;
  }

  switch (tag) {
    case "RULE":
      return {
        candidateType: "rule",
        memoryType: "steward_rule",
        text: body,
        payload: { key: stableKey("rule", body), value: body, source: "daily_self_review" },
        importance: 0.9,
        confidenceScore: 0.8,
      };
    case "PREF":
      return {
        candidateType: "preference",
        memoryType: "steward_preference",
        text: body,
        payload: { key: stableKey("preference", body), value: body, source: "daily_self_review" },
        importance: 0.8,
        confidenceScore: 0.8,
      };
    case "FACT":
      return {
        candidateType: "fact",
        memoryType: "steward_fact",
        text: body,
        payload: { key: stableKey("fact", body), value: body, source: "daily_self_review" },
        importance: 0.75,
        confidenceScore: 0.8,
      };
    case "PATTERN":
      return {
        candidateType: "pattern",
        memoryType: "steward_pattern",
        text: body,
        payload: { key: stableKey("pattern", body), value: body, risk, source: "daily_self_review" },
        importance: 0.8,
        confidenceScore: risk === "low" ? 0.9 : 0.85,
      };
    case "PROC":
      return {
        candidateType: "procedure",
        memoryType: "steward_procedure",
        text: body,
        payload: { key: stableKey("procedure", body), value: body, risk, source: "daily_self_review" },
        importance: 0.8,
        confidenceScore: risk === "low" ? 0.9 : 0.85,
      };
    default:
      return null;
  }
}

export function extractDailySelfReviewCandidates(reportText: string): DailySelfReviewCandidate[] {
  const seen = new Set<string>();
  const results: DailySelfReviewCandidate[] = [];
  for (const line of reportText.split(/\r?\n/)) {
    const candidate = candidateFromLine(line);
    if (!candidate) {
      continue;
    }
    const dedupeKey = `${candidate.candidateType}:${candidate.text.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    results.push(candidate);
  }
  return results;
}

function findExistingDailySelfReviewFlow(sessionId: string, day: string): { flowId: number; taskId: number } | null {
  const rows = getDb()
    .prepare(
      `SELECT f.id, t.task_id, f.state_json
       FROM steward_flows f
       JOIN steward_flow_tasks t ON t.flow_id = f.id
       WHERE f.session_id = ?
         AND f.flow_type = 'maintenance'
       ORDER BY f.id DESC`,
    )
    .all(sessionId) as Array<{ id: number; task_id: number; state_json: string }>;
  for (const row of rows) {
    try {
      const state = JSON.parse(row.state_json || "{}") as Record<string, unknown>;
      if (state.job_type === "daily_self_review" && state.day === day) {
        return {
          flowId: Number(row.id),
          taskId: Number(row.task_id),
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function buildDailySelfReviewSnapshot(params: {
  sessionId: string;
  now?: number;
}): DailySelfReviewSnapshot {
  const now = params.now ?? Date.now();
  const cutoff = now - DAILY_SELF_REVIEW_CADENCE_MS;
  const db = getDb();
  const eventCount24h = Number(
    ((db.prepare(`SELECT COUNT(*) AS count FROM steward_events WHERE session_id = ? AND ts >= ?`).get(
      params.sessionId,
      cutoff,
    ) as { count: number })?.count ?? 0),
  );
  const proofRow = db
    .prepare(
      `SELECT
         SUM(CASE WHEN verdict = 'accepted' THEN 1 ELSE 0 END) AS accepted_count,
         SUM(CASE WHEN verdict = 'rejected' THEN 1 ELSE 0 END) AS rejected_count
       FROM steward_proofs
       WHERE session_id = ?
         AND created_ts >= ?`,
    )
    .get(params.sessionId, cutoff) as { accepted_count: number | null; rejected_count: number | null };
  const failedPrimaryTasks24h = Number(
    ((db.prepare(
      `SELECT COUNT(*) AS count
       FROM steward_flow_tasks t
       JOIN steward_flows f ON f.id = t.flow_id
       WHERE f.session_id = ?
         AND t.role = 'primary'
         AND t.link_status = 'failed'
         AND t.updated_ts >= ?`,
    ).get(params.sessionId, cutoff) as { count: number })?.count ?? 0),
  );
  const openFlowCount = Number(
    ((db.prepare(
      `SELECT COUNT(*) AS count
       FROM steward_flows
       WHERE session_id = ?
         AND status != 'completed'`,
    ).get(params.sessionId) as { count: number })?.count ?? 0),
  );
  return {
    day: utcDay(now),
    windowStartTs: cutoff,
    windowEndTs: now,
    eventCount24h,
    acceptedProofCount24h: Number(proofRow.accepted_count ?? 0),
    rejectedProofCount24h: Number(proofRow.rejected_count ?? 0),
    failedPrimaryTasks24h,
    openFlowCount,
  };
}

export function buildDailySelfReviewPrompt(snapshot: DailySelfReviewSnapshot): string {
  return [
    `Daily self-review for ${snapshot.day}.`,
    "Review the last 24h of steward events, proofs, failures, and open flows.",
    `24h events: ${snapshot.eventCount24h}`,
    `Accepted proofs: ${snapshot.acceptedProofCount24h}`,
    `Rejected proofs: ${snapshot.rejectedProofCount24h}`,
    `Failed primary tasks: ${snapshot.failedPrimaryTasks24h}`,
    `Open flows: ${snapshot.openFlowCount}`,
    "Output format:",
    "1) Concise report",
    "2) Suggested next actions",
    "3) Memory candidates (optional, explicit lines only):",
    "RULE: <short rule>",
    "PREF: <short preference>",
    "FACT: <short stable fact>",
    "PATTERN[risk=low|med|high]: <pattern>",
    "PROC[risk=low|med|high]: <procedure hint>",
    "Do not modify code automatically.",
  ].join("\n");
}

export async function runDailySelfReviewJob(params: {
  sessionKey: string;
  reportText: string;
  now?: number;
  embedder?: StewardEmbedder;
}): Promise<DailySelfReviewRunResult> {
  const now = params.now ?? Date.now();
  const authority = getOrCreateStewardSession(params.sessionKey, now);
  const snapshot = buildDailySelfReviewSnapshot({
    sessionId: authority.sessionId,
    now,
  });
  const existing = findExistingDailySelfReviewFlow(authority.sessionId, snapshot.day);
  if (existing) {
    appendStewardEvent({
      kind: "job.daily_self_review.reused",
      message: "daily self-review reused existing day record",
      sessionId: authority.sessionId,
      flowId: existing.flowId,
      now,
      data: {
        day: snapshot.day,
        flowId: existing.flowId,
        taskId: existing.taskId,
      },
    });
    return {
      created: false,
      reused: true,
      day: snapshot.day,
      flowId: existing.flowId,
      taskId: existing.taskId,
      extractedCount: 0,
    };
  }

  const db = getDb();
  const trimmedReport = params.reportText.trim().slice(0, 8_000);
  const stateJson = JSON.stringify({
    job_type: "daily_self_review",
    day: snapshot.day,
    snapshot,
    prompt: buildDailySelfReviewPrompt(snapshot),
    report_text: trimmedReport,
  });
  const flowResult = db
    .prepare(
      `INSERT INTO steward_flows (
         session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
       ) VALUES (?, 'maintenance', 'completed', ?, ?, ?, ?, ?)` ,
    )
    .run(authority.sessionId, stateJson, process.pid, now, now, now) as { lastInsertRowid: number | bigint };
  const flowId = Number(flowResult.lastInsertRowid);
  const taskId = flowId;
  db.prepare(
    `INSERT INTO steward_flow_tasks (
       flow_id, task_id, role, link_status, created_ts, updated_ts
     ) VALUES (?, ?, 'diagnostic', 'succeeded', ?, ?)` ,
  ).run(flowId, taskId, now, now);

  const candidates = extractDailySelfReviewCandidates(trimmedReport);
  for (const candidate of candidates) {
    await storeRelationshipMemory({
      sessionKey: params.sessionKey,
      memoryType: candidate.memoryType,
      payload: candidate.payload,
      summary: `${candidate.memoryType.toUpperCase()} ${candidate.text}`,
      importance: candidate.importance,
      source: "daily_self_review",
      confidenceScore: candidate.confidenceScore,
      taskId,
      now,
      embedder: params.embedder,
    });
  }

  appendStewardEvent({
    kind: "job.daily_self_review.recorded",
    message: "daily self-review recorded",
    sessionId: authority.sessionId,
    flowId,
    now,
    data: {
      day: snapshot.day,
      taskId,
      snapshot,
      reportText: trimmedReport,
      extractedCount: candidates.length,
    },
  });
  if (candidates.length > 0) {
    appendStewardEvent({
      kind: "job.daily_self_review.memory_extracted",
      message: "daily self-review memory extracted",
      sessionId: authority.sessionId,
      flowId,
      now,
      data: {
        day: snapshot.day,
        taskId,
        extractedCount: candidates.length,
        memoryTypes: candidates.map((candidate) => candidate.memoryType),
      },
    });
  }

  return {
    created: true,
    reused: false,
    day: snapshot.day,
    flowId,
    taskId,
    extractedCount: candidates.length,
  };
}
