import { recordCurrentAutonomyGoalGap } from "./goal-gap-registry.js";

export type AutonomyWorkClass =
  | "goal_work"
  | "tester_work"
  | "diagnostic_work"
  | "maintenance_work"
  | "review_or_consolidation";

export type ClassifiedAutonomyWork = {
  workClass: AutonomyWorkClass;
  reason: string;
  gapId?: number;
  gapKind?: string;
  gapEvidence?: Record<string, unknown>;
};

export function classifyAutonomyWork(params: {
  sessionId: string;
  now?: number;
}): ClassifiedAutonomyWork {
  const gap = recordCurrentAutonomyGoalGap({
    sessionId: params.sessionId,
    now: params.now,
  });
  return {
    workClass: gap.workClass,
    reason: gap.reason,
    gapId: gap.gapId,
    gapKind: gap.gapKind,
    gapEvidence: gap.evidence,
  };
}
