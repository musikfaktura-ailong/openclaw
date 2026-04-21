import { storeRelationshipMemory } from "../memory/relationship-memory.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import type { TruthAuditMetadata, TruthAuditReport } from "./truth-types.js";

export function buildTruthAuditMetadata(params: {
  audit: TruthAuditReport;
  auditedAt?: number;
  decision?: TruthAuditMetadata["decision"];
}): TruthAuditMetadata {
  return {
    auditedAt: params.auditedAt ?? Date.now(),
    summary: params.audit.summary,
    decision: params.decision ?? null,
    claimRecord: params.audit.claimRecord,
    candidateRecord: params.audit.candidateRecord,
    epistemicDelta: params.audit.epistemicDelta,
    familyOverlap: params.audit.familyOverlap,
  };
}

export async function persistTruthAudit(params: {
  sessionKey: string;
  audit: TruthAuditReport;
  flowId?: number | null;
  taskId?: number | null;
  auditedAt?: number;
  decision?: TruthAuditMetadata["decision"];
}): Promise<{
  violationMemoryIds: number[];
  reinforcedMemoryId: number | null;
}> {
  const truthAudit = buildTruthAuditMetadata({
    audit: params.audit,
    auditedAt: params.auditedAt,
    decision: params.decision,
  });
  const authority = getOrCreateStewardSession(params.sessionKey, truthAudit.auditedAt);
  appendStewardEvent({
    kind: "truth.claim_record",
    message: params.audit.claimRecord.selectedOpportunity || "truth claim recorded",
    sessionId: authority.sessionId,
    flowId: params.flowId ?? null,
    data: {
      taskId: params.taskId ?? null,
      truthAudit,
    },
    now: truthAudit.auditedAt,
  });
  if (params.decision) {
    appendStewardEvent({
      kind: "truth.candidate_decision",
      message: params.decision.selectedOpportunity || "truth candidate decided",
      sessionId: authority.sessionId,
      flowId: params.flowId ?? null,
      data: {
        taskId: params.taskId ?? null,
        decision: params.decision,
        summary: params.audit.summary,
      },
      now: truthAudit.auditedAt,
    });
  }

  const violationMemoryIds: number[] = [];
  for (const finding of params.audit.findings) {
    if (finding.severity === "info") {
      continue;
    }
    const memoryId = await storeRelationshipMemory({
      sessionKey: params.sessionKey,
      memoryType: "truth_violation",
      payload: {
        key: finding.checkId,
        value: finding.detail,
        title: finding.title,
        severity: finding.severity,
        evidence: finding.evidence ?? "",
      },
      summary: `TRUTH_VIOLATION ${finding.checkId}=${finding.detail}`,
      importance: finding.severity === "critical" ? 1 : 0.8,
      source: "truth_audit",
      taskId: params.taskId ?? undefined,
      confidenceScore: finding.severity === "critical" ? 1 : 0.7,
      lastVerifiedTs: truthAudit.auditedAt,
      truthAudit,
      now: truthAudit.auditedAt,
    });
    violationMemoryIds.push(memoryId);
  }

  let reinforcedMemoryId: number | null = null;
  if (params.audit.summary.critical === 0 && params.decision) {
    reinforcedMemoryId = await storeRelationshipMemory({
      sessionKey: params.sessionKey,
      memoryType: "truth_reinforced",
      payload: {
        key: params.decision.selectedOpportunity,
        value: params.decision.whyChosen,
        score: params.decision.score,
        sourceUrl: params.decision.sourceUrl,
      },
      summary: `TRUTH_REINFORCED ${params.decision.selectedOpportunity}=${params.decision.whyChosen}`,
      importance: 0.9,
      source: "truth_audit",
      taskId: params.taskId ?? undefined,
      confidenceScore: 0.9,
      lastVerifiedTs: truthAudit.auditedAt,
      truthAudit,
      now: truthAudit.auditedAt,
    });
  }

  return {
    violationMemoryIds,
    reinforcedMemoryId,
  };
}
