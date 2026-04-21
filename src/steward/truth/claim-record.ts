import { URL } from "node:url";
import type { ClaimRecord, EpistemicDelta, FamilyOverlap } from "./truth-types.js";
import {
  buildExcerpt,
  buildExcerptHash,
  categoryMatchesEvidence,
  cleanTitle,
  domainFamilyTokens,
  familySignatureTokens,
  inferCategory,
  inferCategoryFromEvidence,
  inferKeyMetric,
  inferSelectedOpportunity,
  meaningfulTokens,
} from "./source-kind.js";

function safeDomain(url: string): string {
  try {
    return new URL(String(url || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function buildClaimRecord(params: {
  selectedOpportunity: string;
  category: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceContent: string;
  keyMetric: string;
  initialHypothesis: string;
  uncertaintyBefore?: string;
  uncertaintyAfter?: string;
  nextTestBefore?: string;
  nextTestAfter?: string;
  claimType?: string;
}): ClaimRecord {
  // port of core/truth_audit.py:build_claim_record
  const excerpt = buildExcerpt(
    params.sourceContent,
    params.selectedOpportunity,
    params.keyMetric,
  );
  return {
    selectedOpportunity: String(params.selectedOpportunity || "").trim(),
    category: String(params.category || "").trim().toLowerCase(),
    sourceUrl: String(params.sourceUrl || "").trim(),
    sourceDomain: safeDomain(params.sourceUrl),
    sourceTitle: cleanTitle(params.sourceTitle),
    sourceExcerpt: excerpt,
    sourceExcerptHash: buildExcerptHash(excerpt),
    keyMetric: String(params.keyMetric || "").trim(),
    metricNumbers: String(params.keyMetric || "").match(/\d+(?:\.\d+)?/g) ?? [],
    initialHypothesis: String(params.initialHypothesis || "").trim(),
    claimType: String(params.claimType || "observed").trim().toLowerCase() || "observed",
    uncertaintyBefore: String(params.uncertaintyBefore || "").trim(),
    uncertaintyAfter: String(params.uncertaintyAfter || "").trim(),
    nextTestBefore: String(params.nextTestBefore || "").trim(),
    nextTestAfter: String(params.nextTestAfter || "").trim(),
  };
}

export function buildClaimRecordFromResult(params: {
  item: Record<string, unknown>;
  query: string;
  uncertaintyBefore: string;
  nextTestBefore: string;
  allowedCategories: string[];
}): ClaimRecord | null {
  const url = String(params.item.url ?? "").trim();
  const content = String(params.item.content ?? "").trim();
  if (!url || content.length < 200) {
    return null;
  }
  const title = cleanTitle(String(params.item.title ?? ""));
  const category =
    inferCategoryFromEvidence(title, content, params.allowedCategories) ||
    inferCategory(`${params.query}\n${title}\n${content}`, params.allowedCategories);
  const selectedOpportunity = inferSelectedOpportunity(title, params.query, content);
  const keyMetric = inferKeyMetric(content, String(params.item.snippet ?? ""));
  if (!selectedOpportunity || !keyMetric) {
    return null;
  }
  if (!categoryMatchesEvidence(category, title, content, params.allowedCategories)) {
    return null;
  }
  return buildClaimRecord({
    selectedOpportunity,
    category,
    sourceUrl: url,
    sourceTitle: title,
    sourceContent: content,
    keyMetric,
    initialHypothesis: `${selectedOpportunity} could generate value if the evidence-backed metric translates into a concrete, repeatable operator-useful outcome.`,
    uncertaintyBefore: params.uncertaintyBefore,
    uncertaintyAfter: params.uncertaintyBefore,
    nextTestBefore: params.nextTestBefore,
    nextTestAfter: params.nextTestBefore,
  });
}

export function compareEpistemicDelta(
  priorRecords: Array<Record<string, unknown>>,
  current: ClaimRecord,
): EpistemicDelta {
  // port of core/truth_audit.py:compare_epistemic_delta
  const currentClaimTokens = new Set(meaningfulTokens(current.selectedOpportunity));
  const currentMetricNumbers = new Set(current.metricNumbers);
  let best: EpistemicDelta = {
    newSource: true,
    newMetric: true,
    newClaim: true,
    uncertaintyChanged: true,
    nextTestChanged: true,
    deltaScore: 5,
    mostSimilarSource: "",
    mostSimilarTopic: "",
  };
  for (const item of priorRecords) {
    const sourceUrl = String(item.source_url ?? item.sourceUrl ?? "").trim().toLowerCase();
    const selected = String(item.selected_opportunity ?? item.selectedOpportunity ?? "").trim();
    const priorMetric = String(item.key_metric ?? item.keyMetric ?? "").trim();
    const priorUncertainty = String(
      item.uncertainty_after ?? item.uncertaintyAfter ?? item.uncertainty ?? "",
    ).trim();
    const priorNextTest = String(
      item.next_test_after ?? item.nextTestAfter ?? item.next_test ?? item.nextTest ?? "",
    ).trim();
    const priorClaimTokens = new Set(meaningfulTokens(selected));
    const priorMetricNumbers = new Set(priorMetric.match(/\d+(?:\.\d+)?/g) ?? []);
    const newSource = sourceUrl !== current.sourceUrl.toLowerCase();
    const newMetric =
      priorMetric !== current.keyMetric ||
      currentMetricNumbers.size !== priorMetricNumbers.size ||
      [...currentMetricNumbers].some((value) => !priorMetricNumbers.has(value));
    const overlap = [...currentClaimTokens].filter((token) => priorClaimTokens.has(token)).length;
    const union = new Set([...currentClaimTokens, ...priorClaimTokens]).size || 1;
    const newClaim = overlap / union < 0.7;
    const uncertaintyChanged = priorUncertainty !== current.uncertaintyAfter;
    const nextTestChanged = priorNextTest !== current.nextTestAfter;
    const deltaScore =
      Number(newSource) +
      Number(newMetric) +
      Number(newClaim) +
      Number(uncertaintyChanged) +
      Number(nextTestChanged);
    if (deltaScore < best.deltaScore) {
      best = {
        newSource,
        newMetric,
        newClaim,
        uncertaintyChanged,
        nextTestChanged,
        deltaScore,
        mostSimilarSource: sourceUrl,
        mostSimilarTopic: selected,
      };
    }
  }
  return best;
}

export function compareFamilyOverlap(
  priorRecords: Array<Record<string, unknown>>,
  current: ClaimRecord,
): FamilyOverlap {
  // port of core/truth_audit.py:compare_family_overlap
  const currentTokens = new Set(
    familySignatureTokens({
      selectedOpportunity: current.selectedOpportunity,
      category: current.category,
      sourceUrl: current.sourceUrl,
      sourceTitle: current.sourceTitle,
    }),
  );
  let best: FamilyOverlap = {
    familyOverlap: 0,
    sameCategory: false,
    sameDomainFamily: false,
    mostSimilarSource: "",
    mostSimilarTopic: "",
    matchedTokens: [],
  };
  if (currentTokens.size === 0) {
    return best;
  }
  const currentDomainTokens = new Set(domainFamilyTokens(current.sourceUrl));
  for (const item of priorRecords) {
    const priorSelected = String(item.selected_opportunity ?? item.selectedOpportunity ?? "").trim();
    const priorCategory = String(item.category ?? "").trim().toLowerCase();
    const priorSource = String(item.source_url ?? item.sourceUrl ?? "").trim();
    const priorTokens = new Set(
      familySignatureTokens({
        selectedOpportunity: priorSelected,
        category: priorCategory,
        sourceUrl: priorSource,
      }),
    );
    if (priorTokens.size === 0) {
      continue;
    }
    const matchedTokens = [...currentTokens].filter((token) => priorTokens.has(token)).sort();
    const union = new Set([...currentTokens, ...priorTokens]).size || 1;
    let familyOverlap = matchedTokens.length / union;
    const priorDomainTokens = new Set(domainFamilyTokens(priorSource));
    const sameDomainFamily =
      currentDomainTokens.size > 0 &&
      priorDomainTokens.size > 0 &&
      [...currentDomainTokens].some((token) => priorDomainTokens.has(token));
    const sameCategory =
      Boolean(current.category) && Boolean(priorCategory) && current.category === priorCategory;
    if (sameDomainFamily) {
      familyOverlap += 0.15;
    }
    if (familyOverlap > best.familyOverlap) {
      best = {
        familyOverlap: Number(familyOverlap.toFixed(4)),
        sameCategory,
        sameDomainFamily,
        mostSimilarSource: priorSource,
        mostSimilarTopic: priorSelected,
        matchedTokens: matchedTokens.slice(0, 8),
      };
    }
  }
  return best;
}
