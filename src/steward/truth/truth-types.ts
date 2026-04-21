export type TruthFindingSeverity = "critical" | "warn" | "info";

export type TruthFinding = {
  checkId: string;
  severity: TruthFindingSeverity;
  title: string;
  detail: string;
  evidence?: string;
  remediation?: string;
};

export type ClaimRecord = {
  selectedOpportunity: string;
  category: string;
  sourceUrl: string;
  sourceDomain: string;
  sourceTitle: string;
  sourceExcerpt: string;
  sourceExcerptHash: string;
  keyMetric: string;
  metricNumbers: string[];
  initialHypothesis: string;
  claimType: string;
  uncertaintyBefore: string;
  uncertaintyAfter: string;
  nextTestBefore: string;
  nextTestAfter: string;
};

export type CandidateRecord = {
  opportunityKind: string;
  sourceKind: string;
  metricKind: string;
  metricValue: string;
  commercialRelevance: string;
  implementationRelevance: string;
  decisionRelevance: string;
  extractReadiness: string;
  supportsHypothesis: string;
  supportsNextTest: string;
};

export type EpistemicDelta = {
  newSource: boolean;
  newMetric: boolean;
  newClaim: boolean;
  uncertaintyChanged: boolean;
  nextTestChanged: boolean;
  deltaScore: number;
  mostSimilarSource: string;
  mostSimilarTopic: string;
};

export type FamilyOverlap = {
  familyOverlap: number;
  sameCategory: boolean;
  sameDomainFamily: boolean;
  mostSimilarSource: string;
  mostSimilarTopic: string;
  matchedTokens: string[];
};

export type TruthSummary = {
  critical: number;
  warn: number;
  info: number;
};

export type TruthAuditReport = {
  summary: TruthSummary;
  findings: TruthFinding[];
  claimRecord: ClaimRecord;
  candidateRecord: CandidateRecord;
  epistemicDelta: EpistemicDelta;
  familyOverlap: FamilyOverlap;
};

export type CandidateSlateEntry = {
  score: number;
  claimRecord: ClaimRecord;
  candidateRecord: CandidateRecord;
  summary: TruthSummary;
  epistemicDelta: EpistemicDelta;
  familyOverlap: FamilyOverlap;
  whyCandidateIsUseful: string[];
  reasonsAgainstCandidate: string[];
};

export type CandidateDecision = {
  selectedOpportunity: string;
  sourceUrl: string;
  keyMetric: string;
  score: number;
  whyChosen: string;
  alternativesConsidered: Array<{
    selectedOpportunity: string;
    sourceUrl: string;
    score: number;
    reasonsAgainstCandidate: string[];
  }>;
};

export type BestCandidateSelection = CandidateSlateEntry & {
  decision: CandidateDecision;
  slate: CandidateSlateEntry[];
};

export type TruthAuditMetadata = {
  auditedAt: number;
  summary: TruthSummary;
  decision?: CandidateDecision | null;
  claimRecord: ClaimRecord;
  candidateRecord: CandidateRecord;
  epistemicDelta: EpistemicDelta;
  familyOverlap: FamilyOverlap;
};
