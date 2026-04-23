import { getDb } from "../db/db-bootstrap.js";

export type StewardshipReflection = {
  truthPreserved: boolean;
  truthViolationCount: number;
  operatorServed: boolean;
  burdenReduced: boolean;
  continuityProtected: boolean;
  discretionHonored: boolean;
  contradictionSurfaced: boolean;
  truthfulRefusal: boolean;
  acceptedProofCount: number;
  knowledgeCount: number;
  busywork: boolean;
  summary: { taskTitle: string; taskResult: string };
};

function lower(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function containsAny(text: string, markers: string[]): boolean {
  return markers.some((marker) => text.includes(marker));
}

export function reflectStewardship(params: {
  sessionId: string;
  flowId?: number | null;
  taskId?: number | null;
  taskTitle?: string;
  taskDetails?: string;
  taskResult?: string;
}): StewardshipReflection {
  const db = getDb();
  const events = db
    .prepare(
      `SELECT kind, message, data_json
       FROM steward_events
       WHERE session_id = ?
         AND (? IS NULL OR flow_id = ?)
       ORDER BY id ASC`,
    )
    .all(params.sessionId, params.flowId ?? null, params.flowId ?? null) as Array<{
    kind: string;
    message: string;
    data_json: string;
  }>;
  const proofs = db
    .prepare(
      `SELECT verdict, failure_class, reason, proof_text
       FROM steward_proofs
       WHERE session_id = ?
         AND (? IS NULL OR task_id = ?)
       ORDER BY id ASC`,
    )
    .all(params.sessionId, params.taskId ?? null, params.taskId ?? null) as Array<{
    verdict: string;
    failure_class: string;
    reason: string;
    proof_text: string;
  }>;
  const knowledgeRow = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM steward_knowledge
       WHERE session_key IS NULL
          OR (? IS NOT NULL AND session_key = ?)`,
    )
    .get(params.sessionId, params.sessionId) as { count: number };
  const eventText = events
    .map((event) => `${event.kind} ${event.message} ${JSON.stringify(parseJson(event.data_json))}`)
    .join(" ");
  const proofText = proofs
    .map((proof) => `${proof.verdict} ${proof.failure_class} ${proof.reason} ${proof.proof_text}`)
    .join(" ");
  const allText = lower([params.taskTitle, params.taskDetails, params.taskResult, eventText, proofText].join(" "));
  let truthViolationCount = 0;
  for (const marker of [
    "fabricated",
    "unsupported",
    "unverified",
    "not_valid_evidence",
    "url_not_fetched",
    "truth violation",
    "consequence_blocked",
  ]) {
    if (allText.includes(marker)) {
      truthViolationCount += 1;
    }
  }
  truthViolationCount += proofs.filter(
    (proof) =>
      proof.verdict === "rejected" &&
      containsAny(lower(`${proof.failure_class} ${proof.reason}`), [
        "ungrounded",
        "source_missing",
        "history_mismatch",
      ]),
  ).length;
  const acceptedProofCount = proofs.filter((proof) => proof.verdict === "accepted").length;
  const operatorServed = containsAny(allText, ["operator", "household", "support", "stewardship", "served"]);
  const burdenReduced = containsAny(allText, ["reduce burden", "burden reduced", "automation", "continuity", "support"]);
  const continuityProtected = containsAny(allText, ["continuity", "protect", "bounded risk", "risk control"]);
  const discretionHonored = !containsAny(allText, [
    "credential leaked",
    "secret leaked",
    "password leaked",
    "token leaked",
  ]);
  const contradictionSurfaced = containsAny(allText, [
    "contradiction surfaced",
    "contradiction found",
    "conflicting evidence",
    "conflict detected",
  ]);
  const truthfulRefusal =
    acceptedProofCount === 0 &&
    containsAny(allText, [
      "insufficient evidence",
      "weak proof",
      "not enough evidence",
      "cannot verify",
      "truthful refusal",
      "refused due to insufficient evidence",
    ]);
  const knowledgeCount = Number(knowledgeRow.count ?? 0);
  return {
    truthPreserved: truthViolationCount === 0,
    truthViolationCount,
    operatorServed,
    burdenReduced,
    continuityProtected,
    discretionHonored,
    contradictionSurfaced,
    truthfulRefusal,
    acceptedProofCount,
    knowledgeCount,
    busywork: acceptedProofCount === 0 && knowledgeCount === 0 && !operatorServed,
    summary: {
      taskTitle: String(params.taskTitle ?? "").slice(0, 120),
      taskResult: String(params.taskResult ?? "").slice(0, 120),
    },
  };
}
