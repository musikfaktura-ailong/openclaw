import { appendStewardEvent } from "../runtime/runtime-events.js";
import { storeProofExample } from "./proof-examples.js";
import type { ProofJudgeOutput, ProofTask } from "./proof-types.js";

export async function handleNovelProofFlag(params: {
  judgeOutput: ProofJudgeOutput;
  task: ProofTask;
  sessionId: string;
  flowId?: number | null;
  proofExcerpt: string;
  now?: number;
}): Promise<number | null> {
  if (!params.judgeOutput.novelFlag || params.judgeOutput.novelConfidence <= 0.85) {
    return null;
  }
  const now = params.now ?? Date.now();
  appendStewardEvent({
    kind: "novel_claim.flagged",
    message: params.task.title?.trim() || "Novel proof claim flagged",
    sessionId: params.sessionId,
    flowId: params.flowId ?? null,
    now,
    data: {
      taskType: params.task.taskType ?? "general",
      novelConfidence: params.judgeOutput.novelConfidence,
      reason: params.judgeOutput.reason,
      proofExcerpt: params.proofExcerpt.slice(0, 300),
    },
  });
  return await storeProofExample({
    taskType: params.task.taskType ?? "general",
    label: "good",
    labelSource: "novel_flag",
    judgeVerdict: "accepted",
    judgeReason: params.judgeOutput.reason,
    proofExcerpt: params.proofExcerpt,
    taskTitle: params.task.title,
    failureClass: params.judgeOutput.failureClass,
    metadata: {
      novel_flag: true,
      novel_confidence: params.judgeOutput.novelConfidence,
    },
    now,
  });
}
