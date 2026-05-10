import { recordCurrentAutonomyGoalGap } from "./goal-gap-registry.js";

export type AutonomyWorkClass =
  | "goal_work"
  | "tester_work"
  | "diagnostic_work"
  | "maintenance_work"
  | "review_or_consolidation";

export type ClassifiedAutonomyWork = {
  decision: "stop_completed" | "continue_current_gap" | "replan_goal";
  workClass: AutonomyWorkClass;
  reason: string;
  status: "open" | "resolved";
  gapId?: number;
  gapKind?: string;
  gapEvidence?: Record<string, unknown>;
};

export async function classifyAutonomyWork(params: {
  sessionId: string;
  now?: number;
}): Promise<ClassifiedAutonomyWork> {
  const gap = await recordCurrentAutonomyGoalGap({
    sessionId: params.sessionId,
    now: params.now,
  });
  return {
    decision: gap.decision,
    workClass: gap.workClass,
    reason: gap.reason,
    status: gap.status,
    gapId: gap.gapId,
    gapKind: gap.gapKind,
    gapEvidence: gap.evidence,
  };
}
