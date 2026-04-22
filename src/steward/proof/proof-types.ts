export const PROOF_TASK_TYPES = [
  "learning",
  "self_improvement",
  "contribution",
  "steward_health",
  "communication",
  "general",
] as const;

export type ProofTaskType = (typeof PROOF_TASK_TYPES)[number];

export type ProofFailureClass =
  | "judge_error"
  | "ungrounded"
  | "metric_missing"
  | "source_missing"
  | "history_mismatch";

export type ProofVerdict = "accepted" | "rejected";

export type ProofExampleLabel = "good" | "bad" | "operator_gold" | "operator_rejected";

export type ProofJudgeOutput = {
  grounded: boolean;
  score: number;
  reason: string;
  novelFlag: boolean;
  novelConfidence: number;
  failureClass: ProofFailureClass | "";
};

export type ProofTask = {
  taskId?: number | null;
  taskType?: ProofTaskType;
  title?: string;
  details?: string;
};

export type ProofHistoryEntry = {
  id?: number;
  ts: number;
  kind: string;
  message: string;
  data: Record<string, unknown>;
};

export type StewardClassifier = {
  classifyJson<T>(params: {
    systemPrompt: string;
    prompt: string;
    signal?: AbortSignal;
  }): Promise<T>;
};

export type PersistedProofVerdict = {
  proofId: number;
  verdict: ProofVerdict;
  score: number;
  grounded: boolean;
  failureClass: ProofFailureClass | "";
  reason: string;
  historySummary: string;
  exampleId: number | null;
};
