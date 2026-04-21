import { compareEpistemicDelta, compareFamilyOverlap } from "./claim-record.js";
import {
  classifyMetricKind,
  classifySourceKind,
  inferOpportunityKind,
  meaningfulTokens,
  metricIsTrivial,
} from "./source-kind.js";
import type {
  CandidateRecord,
  ClaimRecord,
  TruthAuditReport,
  TruthFinding,
  TruthSummary,
} from "./truth-types.js";

function summarizeFindings(findings: TruthFinding[]): TruthSummary {
  return findings.reduce<TruthSummary>(
    (summary, finding) => {
      summary[finding.severity] += 1;
      return summary;
    },
    { critical: 0, warn: 0, info: 0 },
  );
}

export function inferCandidateRecord(claim: ClaimRecord, sourceContent: string): CandidateRecord {
  // port of core/truth_audit.py:infer_candidate_record
  const sourceKind = classifySourceKind(claim.sourceUrl, claim.sourceTitle, sourceContent);
  const metricKind = classifyMetricKind(claim.keyMetric, claim.sourceExcerpt, sourceContent);
  const opportunityKind = inferOpportunityKind(
    `${claim.selectedOpportunity}\n${claim.category}\n${claim.sourceTitle}\n${claim.initialHypothesis}`,
  );
  const commercialRelevance = metricIsTrivial(claim.keyMetric, metricKind)
    ? "weak"
    : ["tutorial", "api_docs", "forum_post"].includes(sourceKind)
      ? "indirect"
      : "direct";
  const implementationRelevance =
    sourceKind === "api_docs" || sourceKind === "dataset_repo" ? "direct" : "indirect";
  const decisionRelevance =
    commercialRelevance === "direct" && ["product_page", "marketplace_listing", "benchmark_report"].includes(sourceKind)
      ? "high"
      : commercialRelevance === "weak"
        ? "low"
        : "medium";
  const extractReadiness =
    sourceKind === "product_page" &&
    ["revenue_estimate", "price", "return_multiple", "apy", "user_count"].includes(metricKind)
      ? "ready"
      : ["price", "user_count", "conversion_rate"].includes(metricKind)
        ? "partial"
        : "not_ready";
  return {
    opportunityKind,
    sourceKind,
    metricKind,
    metricValue: claim.keyMetric,
    commercialRelevance,
    implementationRelevance,
    decisionRelevance,
    extractReadiness,
    supportsHypothesis: claim.initialHypothesis ? "partial" : "none",
    supportsNextTest: claim.nextTestAfter ? "partial" : "none",
  };
}

export function auditClaimRecord(params: {
  priorRecords: Array<Record<string, unknown>>;
  current: ClaimRecord;
  sourceContent: string;
  avoidFamilyReuse?: boolean;
}): TruthAuditReport {
  // port of core/truth_audit.py:audit_claim_record
  const findings: TruthFinding[] = [];
  const candidateRecord = inferCandidateRecord(params.current, params.sourceContent);
  const loweredExcerpt = params.current.sourceExcerpt.toLowerCase();
  if (!params.current.sourceUrl.startsWith("http://") && !params.current.sourceUrl.startsWith("https://")) {
    findings.push({ checkId: "source.url.invalid", severity: "critical", title: "Source URL invalid", detail: "Claim source URL is not a real URL." });
  }
  if (String(params.sourceContent || "").trim().length < 200) {
    findings.push({ checkId: "source.body.thin", severity: "critical", title: "Source body too thin", detail: "Fetched source body is too short to ground the claim." });
  }
  if (!params.current.sourceExcerpt) {
    findings.push({ checkId: "source.excerpt.missing", severity: "critical", title: "Source excerpt missing", detail: "No grounded source excerpt was extracted." });
  }
  if (["tutorial", "forum_post"].includes(candidateRecord.sourceKind)) {
    findings.push({
      checkId: "source.kind.low_signal",
      severity: "warn",
      title: "Source kind is low-signal",
      detail: `Source classified as ${candidateRecord.sourceKind}, which usually needs stronger corroboration for decision use.`,
      evidence: params.current.sourceTitle || params.current.sourceUrl,
    });
  }
  const selectedTokens = meaningfulTokens(params.current.selectedOpportunity);
  if (selectedTokens.length > 0) {
    const matched = selectedTokens.filter((token) => loweredExcerpt.includes(token));
    if (matched.length < Math.min(2, selectedTokens.length)) {
      findings.push({
        checkId: "claim.tokens.ungrounded",
        severity: "critical",
        title: "Opportunity claim not grounded",
        detail: "Selected opportunity is not actually supported by the fetched excerpt.",
        evidence: params.current.sourceExcerpt.slice(0, 220),
      });
    }
  }
  if (
    params.current.metricNumbers.length > 0 &&
    !params.current.metricNumbers.every((num) => loweredExcerpt.includes(num) || params.sourceContent.toLowerCase().includes(num))
  ) {
    findings.push({
      checkId: "metric.ungrounded",
      severity: "critical",
      title: "Metric not grounded",
      detail: "The chosen key metric is not supported by the fetched content.",
      evidence: params.current.keyMetric,
    });
  }
  if (metricIsTrivial(params.current.keyMetric, candidateRecord.metricKind)) {
    findings.push({
      checkId: "metric.trivial",
      severity: "critical",
      title: "Metric is too weak",
      detail: "The chosen metric is present but too trivial to support decision-quality extraction.",
      evidence: params.current.keyMetric,
    });
  }
  if (candidateRecord.extractReadiness === "not_ready") {
    findings.push({
      checkId: "extract.not_ready",
      severity: "critical",
      title: "Candidate cannot survive EXTRACT",
      detail: "This source/metric combination cannot support a concrete claim without invention.",
      evidence: `source_kind=${candidateRecord.sourceKind} metric_kind=${candidateRecord.metricKind}`,
    });
  }
  if (["weak", "none"].includes(candidateRecord.commercialRelevance)) {
    findings.push({
      checkId: "candidate.commercial_relevance.weak",
      severity: "critical",
      title: "Commercial relevance too weak",
      detail: "Fetched evidence does not provide a decision-useful signal.",
      evidence: `source_kind=${candidateRecord.sourceKind} metric_kind=${candidateRecord.metricKind}`,
    });
  }
  if (["guarantee", "guaranteed", "verified revenue", "proven revenue"].some((token) => params.current.initialHypothesis.toLowerCase().includes(token))) {
    findings.push({
      checkId: "hypothesis.overstated",
      severity: "critical",
      title: "Hypothesis overstated",
      detail: "Hypothesis overclaims beyond what the evidence can support.",
      evidence: params.current.initialHypothesis,
    });
  }
  const epistemicDelta = compareEpistemicDelta(params.priorRecords, params.current);
  const familyOverlap = compareFamilyOverlap(params.priorRecords, params.current);
  if ((epistemicDelta.deltaScore ?? 0) <= 0) {
    findings.push({
      checkId: "epistemic.delta.zero",
      severity: "critical",
      title: "No epistemic progress",
      detail: "This candidate does not add new source, metric, claim, uncertainty change, or next-test change.",
      evidence: `source=${epistemicDelta.mostSimilarSource} topic=${epistemicDelta.mostSimilarTopic}`,
    });
  }
  const nonGenericOverlap = familyOverlap.matchedTokens.filter((token) => token !== params.current.category.trim().toLowerCase());
  if ((params.avoidFamilyReuse ?? false) && familyOverlap.familyOverlap >= 0.25 && nonGenericOverlap.length > 0) {
    findings.push({
      checkId: "family.reuse.high_overlap",
      severity: "critical",
      title: "Candidate remains inside a recently worked family",
      detail: "This candidate is still anchored in a recently worked family and does not represent a clean pivot.",
      evidence: `topic=${familyOverlap.mostSimilarTopic} source=${familyOverlap.mostSimilarSource} tokens=${familyOverlap.matchedTokens.slice(0, 6).join(", ")}`,
    });
  }
  return {
    summary: summarizeFindings(findings),
    findings,
    claimRecord: params.current,
    candidateRecord,
    epistemicDelta,
    familyOverlap,
  };
}
