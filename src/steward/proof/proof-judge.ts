import { extractAssistantText } from "../../agents/pi-embedded-utils.js";
import {
  completeWithPreparedSimpleCompletionModel,
  prepareSimpleCompletionModel,
} from "../../agents/simple-completion-runtime.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { getDb } from "../db/db-bootstrap.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { retrieveSimilarProofExamples, storeProofExample } from "./proof-examples.js";
import { buildProofHistorySummary, loadProofHistory } from "./proof-history.js";
import { handleNovelProofFlag } from "./novel-flag.js";
import type {
  PersistedProofVerdict,
  ProofFailureClass,
  ProofJudgeOutput,
  ProofTask,
  ProofTaskType,
  StewardClassifier,
} from "./proof-types.js";

const PASS_THRESHOLD = 0.65;
const PROVE_KEYS = ["evidence_basis", "result", "implication", "remaining_uncertainty"] as const;
const DEFAULT_CLASSIFIER_PROVIDER = "anthropic";
const DEFAULT_CLASSIFIER_MODEL = "claude-haiku-4-5";

function normalizeProofTaskType(value: string | undefined): ProofTaskType {
  switch (value) {
    case "learning":
    case "self_improvement":
    case "contribution":
    case "steward_health":
    case "communication":
      return value;
    default:
      return "general";
  }
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : null;
  } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(value.slice(start, end + 1));
        return typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : null;
      } catch {}
    }
    return null;
  }
}

function parseKeyValueNote(text: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const split = line.indexOf("=");
    if (split < 0) {
      continue;
    }
    const key = line.slice(0, split).trim();
    const value = line.slice(split + 1).trim();
    if (PROVE_KEYS.includes(key as (typeof PROVE_KEYS)[number])) {
      parsed[key] = value;
    }
  }
  return parsed;
}

function metricLabels(text: string): string[] {
  const labels = new Set<string>();
  for (const match of text.matchAll(/([a-z_][a-z0-9_]{2,})\s*[:=]\s*-?\d+(?:\.\d+)?/gi)) {
    const label = match[1]?.trim().toLowerCase();
    if (label) {
      labels.add(label);
    }
  }
  return [...labels];
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .match(/[a-z0-9_]{3,}/g)
      ?.filter(Boolean) ?? [],
  );
}

function lexicalOverlap(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }
  return shared / Math.max(leftTokens.size, rightTokens.size, 1);
}

function resolveTaskTypeCriteria(taskType: ProofTaskType): string {
  const criteria: Record<ProofTaskType, string> = {
    learning:
      "Require recalled context, at least one fetched grounded source, explicit extraction tied to that source, and a proof that cites what was gathered and stored.",
    self_improvement:
      "Require concrete evidence from run history, code analysis, profiling, or researched implementation approaches. Generic improvement language fails.",
    contribution:
      "Require real validation output. Quantitative claims must come from execution history. A polished narrative without metrics fails.",
    steward_health:
      "Require numeric metrics, threshold comparisons, and a concrete action if a threshold is breached.",
    communication:
      "Require recipient-specific or thread-specific context and communication content grounded in that context.",
    general:
      "Require task-specific execution and a proof that answers the task with traceable evidence from the execution history.",
  };
  return criteria[taskType];
}

function buildJudgePrompt(params: {
  task: ProofTask;
  taskType: ProofTaskType;
  historySummary: string;
  proofText: string;
  goodExamples: unknown[];
  badExamples: unknown[];
}): string {
  return [
    `TASK TYPE: ${params.taskType}`,
    `TASK: ${(params.task.title ?? "").trim()} -- ${(params.task.details ?? "").trim()}`,
    `EVIDENCE:\n${params.historySummary}`,
    `PROOF NOTE:\n${params.proofText}`,
    `TASK-TYPE VALIDATION CRITERIA:\n${resolveTaskTypeCriteria(params.taskType)}`,
    `GOOD EXAMPLES:\n${JSON.stringify(params.goodExamples).slice(0, 2000)}`,
    `BAD EXAMPLES:\n${JSON.stringify(params.badExamples).slice(0, 2000)}`,
    "Return JSON only with keys grounded, score, reason, novel_flag, novel_confidence, failure_class.",
  ].join("\n");
}

function normalizeJudgeOutput(
  parsed: Record<string, unknown> | null,
  fallback: ProofJudgeOutput,
): ProofJudgeOutput {
  if (!parsed) {
    return fallback;
  }
  return {
    grounded: Boolean(parsed.grounded),
    score: Number(parsed.score ?? 0) || 0,
    reason: String(parsed.reason ?? fallback.reason),
    novelFlag: Boolean(parsed.novel_flag),
    novelConfidence: Number(parsed.novel_confidence ?? 0) || 0,
    failureClass: String(parsed.failure_class ?? "") as ProofFailureClass | "",
  };
}

function contributionHeuristicFallback(params: {
  task: ProofTask;
  proofText: string;
  historySummary: string;
}): ProofJudgeOutput | null {
  const loweredTitle = (params.task.title ?? "").toLowerCase();
  if (loweredTitle.includes("the researched opportunity")) {
    return null;
  }
  const parsed = parseKeyValueNote(params.proofText);
  if (PROVE_KEYS.some((key) => !parsed[key]?.trim())) {
    return null;
  }
  const metrics = metricLabels(params.proofText);
  if (metrics.length < 2) {
    return null;
  }
  const historyLower = params.historySummary.toLowerCase();
  const evidenceLower = parsed.evidence_basis.toLowerCase();
  if (!evidenceLower.includes("code.run.stdout") && !evidenceLower.includes("backtest.run")) {
    return null;
  }
  if (!historyLower.includes("validate")) {
    return null;
  }
  if (!metrics.some((metric) => historyLower.includes(metric))) {
    return null;
  }
  if (
    !["artifact_validated", "test_result", "metrics_observed", "validated"].some((token) =>
      historyLower.includes(token),
    )
  ) {
    return null;
  }
  return {
    grounded: true,
    score: 0.86,
    reason:
      "Heuristic grounding pass: the proof preserves exact validation metrics and cites an execution source present in steward history.",
    novelFlag: false,
    novelConfidence: 0,
    failureClass: "",
  };
}

function heuristicFallback(params: {
  task: ProofTask;
  taskType: ProofTaskType;
  proofText: string;
  historySummary: string;
}): ProofJudgeOutput {
  if (params.taskType === "contribution") {
    const contribution = contributionHeuristicFallback(params);
    if (contribution) {
      return contribution;
    }
  }

  const proofText = params.proofText.trim();
  const historySummary = params.historySummary.trim();
  if (!proofText) {
    return {
      grounded: false,
      score: 0,
      reason: "No proof text was available for grounding.",
      novelFlag: false,
      novelConfidence: 0,
      failureClass: "history_mismatch",
    };
  }
  if (!historySummary) {
    return {
      grounded: false,
      score: 0,
      reason: "No steward execution history was available to ground the proof.",
      novelFlag: false,
      novelConfidence: 0,
      failureClass: "history_mismatch",
    };
  }

  const overlap = lexicalOverlap(proofText, historySummary);
  const hasMetric = /\b\d+(?:\.\d+)?\b/.test(proofText);
  const hasUrl = /https?:\/\//i.test(proofText);
  const hasEvidenceTerms = /\b(evidence|validated|observed|source|tool|result|history|recorded)\b/i.test(
    proofText,
  );

  if (params.taskType === "learning" && !hasUrl) {
    return {
      grounded: false,
      score: 0.2,
      reason: "Learning proof did not cite a grounded source URL.",
      novelFlag: false,
      novelConfidence: 0,
      failureClass: "source_missing",
    };
  }

  if (params.taskType === "steward_health" && !hasMetric) {
    return {
      grounded: false,
      score: 0.25,
      reason: "Steward health proof did not preserve concrete metrics.",
      novelFlag: false,
      novelConfidence: 0,
      failureClass: "metric_missing",
    };
  }

  if (overlap >= 0.08 && hasEvidenceTerms) {
    return {
      grounded: true,
      score: hasMetric || hasUrl ? 0.82 : 0.72,
      reason: "Deterministic fallback accepted the proof because it preserved evidence-bearing terms that overlap with steward execution history.",
      novelFlag: false,
      novelConfidence: 0,
      failureClass: "",
    };
  }

  return {
    grounded: false,
    score: Math.max(0, Math.min(0.5, overlap)),
    reason: "Proof text does not sufficiently overlap with steward execution history.",
    novelFlag: false,
    novelConfidence: 0,
    failureClass: overlap > 0 ? "ungrounded" : "history_mismatch",
  };
}

async function classifyProofGrounding(params: {
  task: ProofTask;
  taskType: ProofTaskType;
  proofText: string;
  historySummary: string;
  classifier?: StewardClassifier | null;
  signal?: AbortSignal;
}): Promise<ProofJudgeOutput> {
  const fallback = heuristicFallback({
    task: params.task,
    taskType: params.taskType,
    proofText: params.proofText,
    historySummary: params.historySummary,
  });

  if (!params.classifier) {
    return fallback;
  }

  try {
    const [goodExamples, badExamples] = await Promise.all([
      retrieveSimilarProofExamples({
        query: params.proofText,
        taskType: params.taskType,
        labels: ["good", "operator_gold"],
        topK: 5,
      }),
      retrieveSimilarProofExamples({
        query: params.proofText,
        taskType: params.taskType,
        labels: ["bad", "operator_rejected"],
        topK: 5,
      }),
    ]);
    const raw = await params.classifier.classifyJson<Record<string, unknown>>({
      systemPrompt: "Return only JSON.",
      prompt: buildJudgePrompt({
        task: params.task,
        taskType: params.taskType,
        historySummary: params.historySummary,
        proofText: params.proofText,
        goodExamples,
        badExamples,
      }),
      signal: params.signal,
    });
    return normalizeJudgeOutput(raw, fallback);
  } catch {
    return fallback.failureClass
      ? fallback
      : {
          ...fallback,
          grounded: false,
          score: 0,
          reason: "judge_error",
          failureClass: "judge_error",
        };
  }
}

export async function createSimpleCompletionStewardClassifier(params: {
  cfg: OpenClawConfig;
  provider?: string;
  modelId?: string;
}): Promise<StewardClassifier | null> {
  if (!params.cfg || Object.keys(params.cfg).length === 0) {
    return null;
  }
  const prepared = await prepareSimpleCompletionModel({
    cfg: params.cfg,
    provider: params.provider ?? DEFAULT_CLASSIFIER_PROVIDER,
    modelId: params.modelId ?? DEFAULT_CLASSIFIER_MODEL,
  });
  if ("error" in prepared) {
    return null;
  }
  return {
    async classifyJson<T>(input: {
      systemPrompt: string;
      prompt: string;
      signal?: AbortSignal;
    }) {
      const response = await completeWithPreparedSimpleCompletionModel({
        model: prepared.model,
        auth: prepared.auth,
        context: {
          systemPrompt: input.systemPrompt,
          messages: [
            {
              role: "user",
              content: input.prompt,
              timestamp: Date.now(),
            },
          ],
        },
        options: {
          signal: input.signal,
          maxTokens: 700,
        },
      });
      const parsed = safeJsonParse(extractAssistantText(response));
      if (!parsed) {
        throw new Error("invalid_classifier_json");
      }
      return parsed as T;
    },
  };
}

export async function judgeAndPersistProof(params: {
  sessionId: string;
  sessionKey?: string;
  flowId?: number | null;
  task?: ProofTask;
  proofText: string;
  classifier?: StewardClassifier | null;
  signal?: AbortSignal;
  now?: number;
}): Promise<PersistedProofVerdict> {
  const now = params.now ?? Date.now();
  const task = params.task ?? {};
  const taskType = normalizeProofTaskType(task.taskType);
  const history = loadProofHistory({
    sessionId: params.sessionId,
  });
  const historySummary = buildProofHistorySummary(history);
  const judgeOutput = await classifyProofGrounding({
    task,
    taskType,
    proofText: params.proofText,
    historySummary,
    classifier: params.classifier,
    signal: params.signal,
  });
  const verdict = judgeOutput.grounded && judgeOutput.score >= PASS_THRESHOLD ? "accepted" : "rejected";
  const failureClass = verdict === "accepted" ? "" : judgeOutput.failureClass || "ungrounded";
  const reason = judgeOutput.reason || (failureClass === "judge_error" ? "judge_error" : "ungrounded");
  const db = getDb();
  const inserted = db
    .prepare(
      `INSERT INTO steward_proofs (
         task_id,
         session_id,
         flow_id,
         task_type,
         task_title,
         proof_text,
         history_summary,
         verdict,
         score,
         failure_class,
         grounded,
         reason,
         accepted_at,
         rejected_at,
         rejection_reason,
         created_ts
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      task.taskId ?? null,
      params.sessionId,
      params.flowId ?? null,
      taskType,
      task.title?.trim() ?? "",
      params.proofText.trim(),
      historySummary,
      verdict,
      judgeOutput.score,
      failureClass,
      judgeOutput.grounded ? 1 : 0,
      reason,
      verdict === "accepted" ? now : null,
      verdict === "rejected" ? now : null,
      verdict === "rejected" ? reason : "",
      now,
    ) as { lastInsertRowid: number | bigint };
  const proofId = Number(inserted.lastInsertRowid);

  appendStewardEvent({
    kind: verdict === "accepted" ? "proof.accepted" : "proof.rejected",
    message: task.title?.trim() || "Proof judged",
    sessionId: params.sessionId,
    flowId: params.flowId ?? null,
    now,
    data: {
      proofId,
      taskType,
      score: judgeOutput.score,
      grounded: judgeOutput.grounded,
      failureClass,
      reason,
    },
  });

  let exampleId: number | null = null;
  if (params.proofText.trim()) {
    exampleId = await storeProofExample({
      taskType,
      label: verdict === "accepted" ? "good" : "bad",
      judgeVerdict: verdict,
      judgeReason: reason,
      proofExcerpt: params.proofText.trim().slice(0, 1000),
      taskTitle: task.title,
      failureClass,
      sessionKey: params.sessionKey,
      now,
      metadata: {
        proof_id: proofId,
      },
    });
  }

  await handleNovelProofFlag({
    judgeOutput,
    task: {
      ...task,
      taskType,
    },
    sessionId: params.sessionId,
    flowId: params.flowId ?? null,
    proofExcerpt: params.proofText,
    now,
  });

  return {
    proofId,
    verdict,
    score: judgeOutput.score,
    grounded: judgeOutput.grounded,
    failureClass,
    reason,
    historySummary,
    exampleId,
  };
}
