import { buildClaimRecordFromResult } from "./claim-record.js";
import {
  classifyMetricKind,
  classifySourceKind,
  metricIsTrivial,
  selectedOpportunityIsGeneric,
} from "./source-kind.js";
import { auditClaimRecord } from "./truth-audit.js";
import type { BestCandidateSelection, CandidateSlateEntry } from "./truth-types.js";

export function scoreCandidate(audit: {
  summary: { critical: number; warn: number };
  candidateRecord: {
    extractReadiness: string;
    decisionRelevance: string;
    commercialRelevance: string;
  };
  epistemicDelta: { deltaScore: number };
}): number {
  // port of core/truth_audit.py:_score_candidate
  let score = Number(audit.epistemicDelta.deltaScore ?? 0);
  score += { ready: 6, partial: 2, not_ready: -8 }[audit.candidateRecord.extractReadiness] ?? -4;
  score += { high: 3, medium: 1, low: -3, none: -6 }[audit.candidateRecord.decisionRelevance] ?? -2;
  score += { direct: 3, indirect: 1, weak: -4, none: -6 }[audit.candidateRecord.commercialRelevance] ?? -2;
  score -= (Number(audit.summary.critical) || 0) * 10;
  score -= (Number(audit.summary.warn) || 0) * 1.5;
  return score;
}

export function buildCandidateSlate(params: {
  results: Array<Record<string, unknown>>;
  query: string;
  priorRecords: Array<Record<string, unknown>>;
  uncertaintyBefore: string;
  nextTestBefore: string;
  allowedCategories: string[];
  avoidFamilyReuse?: boolean;
}): CandidateSlateEntry[] {
  // port of core/truth_audit.py:build_candidate_slate
  const slate: CandidateSlateEntry[] = [];
  for (const item of params.results) {
    const url = String(item.url ?? "").trim();
    const content = String(item.content ?? "").trim();
    if (!url || content.length < 200) {
      continue;
    }
    if (item.fetched !== undefined && !item.fetched) {
      continue;
    }
    if (item.usable_for_claims !== undefined && !item.usable_for_claims) {
      continue;
    }
    if (item.contains_numbers !== undefined && !item.contains_numbers) {
      continue;
    }
    const title = String(item.title ?? "");
    const sourceKind = classifySourceKind(url, title, content);
    if (["market_research_report", "search_engine_page"].includes(sourceKind)) {
      continue;
    }
    const claimRecord = buildClaimRecordFromResult({
      item,
      query: params.query,
      uncertaintyBefore: params.uncertaintyBefore,
      nextTestBefore: params.nextTestBefore,
      allowedCategories: params.allowedCategories,
    });
    if (!claimRecord || selectedOpportunityIsGeneric(claimRecord.selectedOpportunity)) {
      continue;
    }
    const metricKind = classifyMetricKind(claimRecord.keyMetric, String(item.snippet ?? ""), content);
    if (["year", "unknown", "tutorial_step_count"].includes(metricKind) || metricIsTrivial(claimRecord.keyMetric, metricKind)) {
      continue;
    }
    const audit = auditClaimRecord({
      priorRecords: params.priorRecords,
      current: claimRecord,
      sourceContent: content,
      avoidFamilyReuse: params.avoidFamilyReuse,
    });
    const score = scoreCandidate(audit);
    const whyCandidateIsUseful: string[] = [];
    if (audit.candidateRecord.extractReadiness === "ready") {
      whyCandidateIsUseful.push("extract_ready");
    }
    if (audit.candidateRecord.decisionRelevance === "high") {
      whyCandidateIsUseful.push("high_decision_relevance");
    }
    if (audit.candidateRecord.commercialRelevance === "direct") {
      whyCandidateIsUseful.push("direct_commercial_signal");
    }
    if (audit.epistemicDelta.newSource) {
      whyCandidateIsUseful.push("new_source");
    }
    if (audit.epistemicDelta.newMetric) {
      whyCandidateIsUseful.push("new_metric");
    }
    slate.push({
      score,
      claimRecord: audit.claimRecord,
      candidateRecord: audit.candidateRecord,
      summary: audit.summary,
      epistemicDelta: audit.epistemicDelta,
      familyOverlap: audit.familyOverlap,
      whyCandidateIsUseful,
      reasonsAgainstCandidate: audit.findings.slice(0, 3).map((finding) => finding.detail.trim()).filter(Boolean),
    });
  }
  return slate.toSorted((left, right) => right.score - left.score);
}

export function selectBestCandidate(params: Parameters<typeof buildCandidateSlate>[0]): BestCandidateSelection | null {
  // port of core/truth_audit.py:select_best_candidate
  const slate = buildCandidateSlate(params);
  const best = slate[0];
  if (!best) {
    return null;
  }
  return {
    ...best,
    decision: {
      selectedOpportunity: best.claimRecord.selectedOpportunity,
      sourceUrl: best.claimRecord.sourceUrl,
      keyMetric: best.claimRecord.keyMetric,
      score: best.score,
      whyChosen: best.whyCandidateIsUseful.join("; ") || "highest_scoring_candidate",
      alternativesConsidered: slate.slice(1, 4).map((item) => ({
        selectedOpportunity: item.claimRecord.selectedOpportunity,
        sourceUrl: item.claimRecord.sourceUrl,
        score: item.score,
        reasonsAgainstCandidate: item.reasonsAgainstCandidate,
      })),
    },
    slate,
  };
}
