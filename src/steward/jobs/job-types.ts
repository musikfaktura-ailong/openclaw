export const STEWARD_JOB_TYPES = [
  "daily_self_review",
  "sleep_consolidation",
  "strategy_validation",
] as const;

export type StewardJobType = (typeof STEWARD_JOB_TYPES)[number];

export const DAILY_SELF_REVIEW_CADENCE_MS = 24 * 60 * 60 * 1000;
export const SLEEP_CONSOLIDATION_CADENCE_MS = 24 * 60 * 60 * 1000;
export const STRATEGY_VALIDATION_CADENCE_MS = 5 * 60 * 1000;
