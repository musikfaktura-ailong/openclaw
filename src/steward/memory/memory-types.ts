export const RELATIONSHIP_MEMORY_TYPES = [
  "operator_boundary",
  "operator_preference",
  "truth_reinforced",
  "truth_violation",
  "shared_thread",
  "household_routine",
  "stewardship_ledger",
  "operator_override",
  "steward_rule",
  "steward_preference",
  "steward_fact",
  "steward_pattern",
  "steward_procedure",
] as const;

export type RelationshipMemoryType = (typeof RELATIONSHIP_MEMORY_TYPES)[number];

export type StewardKnowledgeMemoryType = RelationshipMemoryType | "skill_sequence" | "skill_context";

export const MEMORY_TYPE_WEIGHTS: Record<RelationshipMemoryType, number> = {
  operator_boundary: 1.0,
  operator_preference: 0.95,
  truth_reinforced: 0.9,
  truth_violation: 0.8,
  shared_thread: 0.8,
  household_routine: 0.75,
  stewardship_ledger: 0.7,
  operator_override: 0.6,
  steward_rule: 0.9,
  steward_preference: 0.8,
  steward_fact: 0.75,
  steward_pattern: 0.8,
  steward_procedure: 0.8,
};

export function isRelationshipMemoryType(value: string): value is RelationshipMemoryType {
  return RELATIONSHIP_MEMORY_TYPES.includes(value as RelationshipMemoryType);
}

export function resolveMemoryWeight(value: string): number {
  if (isRelationshipMemoryType(value)) {
    return MEMORY_TYPE_WEIGHTS[value];
  }
  return 0.6;
}
