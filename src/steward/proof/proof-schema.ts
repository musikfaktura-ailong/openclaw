import type { ProofFailureClass, ProofTaskType, ProofVerdict } from "./proof-types.js";

export type StewardProofRow = {
  id: number;
  taskId: number | null;
  sessionId: string;
  flowId: number | null;
  taskType: ProofTaskType;
  taskTitle: string;
  proofText: string;
  historySummary: string;
  verdict: ProofVerdict;
  score: number;
  failureClass: ProofFailureClass | "";
  grounded: boolean;
  reason: string;
  acceptedAt: number | null;
  rejectedAt: number | null;
  rejectionReason: string;
  createdTs: number;
};

export type StewardProofExampleRow = {
  id: number;
  knowledgeId: number;
  taskType: ProofTaskType;
  label: string;
  labelSource: string;
  judgeVerdict: ProofVerdict;
  judgeReason: string;
  failureClass: ProofFailureClass | "";
  taskTitle: string;
  contentHash: string;
  createdTs: number;
  updatedTs: number;
};
