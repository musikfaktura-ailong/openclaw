import { getDb } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { buildStewardshipDriftReport } from "../mission/stewardship-audit.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";

export const SELF_IMPROVEMENT_COOLDOWN_MS = 60 * 60 * 1000;
export const FAILURE_RATE_THRESHOLD = 0.5;
export const MIN_ATTEMPTS = 3;
export const JACCARD_THRESHOLD = 0.35;

export type ImprovementHint = {
  normalizedTitle: string;
  failureRate: number;
  totalAttempts: number;
  hint: string;
  errors: string[];
  toolSequence: string[];
};

function readKv(key: string): string | null {
  const row = getDb().prepare(`SELECT v FROM steward_kv WHERE k = ?`).get(key) as
    | { v: string }
    | undefined;
  return row?.v ?? null;
}

function writeKv(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO steward_kv (k, v)
       VALUES (?, ?)
       ON CONFLICT(k) DO UPDATE SET v = excluded.v`,
    )
    .run(key, value);
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function jaccard(left: string, right: string): number {
  const leftWords = new Set(left.split(" ").filter(Boolean));
  const rightWords = new Set(right.split(" ").filter(Boolean));
  if (leftWords.size === 0 || rightWords.size === 0) {
    return 0;
  }
  const overlap = [...leftWords].filter((word) => rightWords.has(word)).length;
  return overlap / new Set([...leftWords, ...rightWords]).size;
}

function buildHint(params: {
  errors: string[];
  toolSequence: string[];
}): string {
  const lines = ["[self_improvement] Learned from previous attempts:"];
  if (params.toolSequence.length > 0) {
    lines.push(`  Proven sequence: ${params.toolSequence.join(" -> ")}`);
  }
  if (params.errors.length > 0) {
    lines.push(`  Common failures: ${params.errors.slice(0, 3).join("; ")}`);
  }
  lines.push("  Prefer truthful service, continuity protection, and operator burden reduction.");
  return lines.join("\n");
}

function parseImprovementRecord(value: string): {
  ts?: number;
  hint?: string;
  sessionId?: string;
  toolSequence?: string[];
  errors?: string[];
  failureRate?: number;
} | null {
  try {
    const parsed = JSON.parse(value) as {
      ts?: number;
      hint?: string;
      sessionId?: string;
      toolSequence?: string[];
      errors?: string[];
      failureRate?: number;
    };
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function analyzeFailurePatterns(params: { sessionId: string }): ImprovementHint[] {
  const proofs = getDb()
    .prepare(
      `SELECT task_title, verdict, reason, failure_class
       FROM steward_proofs
       WHERE session_id = ?
       ORDER BY id ASC`,
    )
    .all(params.sessionId) as Array<{
    task_title: string;
    verdict: string;
    reason: string;
    failure_class: string;
  }>;
  const groups = new Map<string, typeof proofs>();
  for (const proof of proofs) {
    const normalizedTitle = normalizeTitle(proof.task_title);
    if (!normalizedTitle) {
      continue;
    }
    groups.set(normalizedTitle, [...(groups.get(normalizedTitle) ?? []), proof]);
  }

  return [...groups.entries()]
    .map(([normalizedTitle, attempts]) => {
      const totalAttempts = attempts.length;
      const failedAttempts = attempts.filter((attempt) => attempt.verdict === "rejected");
      const failureRate = totalAttempts > 0 ? failedAttempts.length / totalAttempts : 0;
      const errors = [...new Set(failedAttempts.map((attempt) => `${attempt.failure_class}:${attempt.reason}`).filter(Boolean))];
      const toolSequence = (
        getDb()
          .prepare(
            `SELECT data_json
             FROM steward_events
             WHERE kind IN ('tool.precheck.blocked', 'consequence.check', 'consequence.warning')
               AND session_id = ?
             ORDER BY id DESC
             LIMIT 20`,
          )
          .all(params.sessionId) as Array<{ data_json: string }>
      )
        .map((row) => {
          try {
            return JSON.parse(row.data_json || "{}").toolName as string | undefined;
          } catch {
            return undefined;
          }
        })
        .filter((item): item is string => Boolean(item));
      return {
        normalizedTitle,
        totalAttempts,
        failureRate,
        errors,
        toolSequence: [...new Set(toolSequence)].slice(0, 5),
      };
    })
    .filter((item) => item.totalAttempts >= MIN_ATTEMPTS && item.failureRate > FAILURE_RATE_THRESHOLD)
    .map((item) => ({
      ...item,
      hint: buildHint({ errors: item.errors, toolSequence: item.toolSequence }),
    }));
}

export function applyImprovementHints(params: {
  sessionId: string;
  now?: number;
}): number {
  const now = params.now ?? Date.now();
  let applied = 0;
  for (const improvement of analyzeFailurePatterns(params)) {
    const key = `self_improvement:${improvement.normalizedTitle}`;
    const existing = readKv(key);
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as { ts?: number };
        if (now - Number(parsed.ts ?? 0) < SELF_IMPROVEMENT_COOLDOWN_MS) {
          continue;
        }
      } catch {}
    }
    writeKv(
      key,
      JSON.stringify({
        ts: now,
        hint: improvement.hint,
        sessionId: params.sessionId,
        toolSequence: improvement.toolSequence,
        errors: improvement.errors,
        failureRate: improvement.failureRate,
      }),
    );
    appendStewardEvent({
      kind: "control.self_improvement.applied",
      message: `self_improvement.${improvement.normalizedTitle}`,
      sessionId: params.sessionId,
      now,
      data: improvement,
    });
    applied += 1;
  }
  return applied;
}

export function runSelfImprovementTick(params: {
  sessionId: string;
  now?: number;
}): { improvementsFound: number; applied: number; stewardshipDrift: boolean } {
  const now = params.now ?? Date.now();
  const improvements = analyzeFailurePatterns(params);
  const report = buildStewardshipDriftReport({ sessionId: params.sessionId, now });
  const applied = applyImprovementHints({ sessionId: params.sessionId, now });
  appendStewardEvent({
    kind: "control.self_improvement.analyzed",
    message: "self_improvement.analyzed",
    sessionId: params.sessionId,
    now,
    data: {
      improvementsFound: improvements.length,
      applied,
      stewardshipDrift: !report.passed,
    },
  });
  return {
    improvementsFound: improvements.length,
    applied,
    stewardshipDrift: !report.passed,
  };
}

export function getHintForTitle(title: string): string | null {
  const normalized = normalizeTitle(title);
  const candidates = getDb()
    .prepare(`SELECT k, v FROM steward_kv WHERE k LIKE 'self_improvement:%'`)
    .all() as Array<{ k: string; v: string }>;
  let best: { score: number; hint: string | null } = { score: 0, hint: null };
  for (const candidate of candidates) {
    const keyTitle = candidate.k.replace(/^self_improvement:/, "");
    const score = jaccard(normalized, keyTitle);
    if (score < JACCARD_THRESHOLD || score <= best.score) {
      continue;
    }
    const parsed = parseImprovementRecord(candidate.v);
    if (parsed?.hint) {
      best = { score, hint: parsed.hint };
    }
  }
  return best.hint;
}

export function buildSelfImprovementPromptContext(params: {
  sessionKey?: string;
  limit?: number;
}): string | undefined {
  const sessionKey = params.sessionKey?.trim();
  if (!sessionKey) {
    return undefined;
  }
  const sessionId = getOrCreateStewardSession(sessionKey).sessionId;
  const limit = Math.max(1, params.limit ?? 3);
  const hints = (getDb()
    .prepare(`SELECT k, v FROM steward_kv WHERE k LIKE 'self_improvement:%'`)
    .all() as Array<{ k: string; v: string }>)
    .map((row) => {
      const parsed = parseImprovementRecord(row.v);
      if (!parsed?.hint || parsed.sessionId !== sessionId) {
        return null;
      }
      return {
        normalizedTitle: row.k.replace(/^self_improvement:/, ""),
        ts: Number(parsed.ts ?? 0),
        hint: parsed.hint,
      };
    })
    .filter((item): item is { normalizedTitle: string; ts: number; hint: string } => item != null)
    .sort((left, right) => right.ts - left.ts)
    .slice(0, limit);
  if (hints.length === 0) {
    return undefined;
  }
  return [
    "## Steward Self-Improvement Hints",
    ...hints.map((hint) => `- ${hint.normalizedTitle}: ${hint.hint}`),
  ].join("\n");
}
