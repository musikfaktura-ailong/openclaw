export type StewardRuntimeStatus = "idle" | "running" | "waiting" | "blocked";

export type StewardSessionStatus = "open" | "closed";

export type StewardFlowType = "research" | "maintenance" | "recovery" | "control";

export type StewardFlowStatus =
  | "running"
  | "resumable"
  | "blocked_transient"
  | "blocked_deterministic"
  | "completed";

export type StewardFlowTaskRole = "primary" | "recovery" | "diagnostic";

export type StewardFlowTaskLinkStatus = "pending" | "running" | "succeeded" | "failed";

export type StewardBlockerType =
  | "no_seedable_work"
  | "blocked_transient"
  | "time_exhausted"
  | "operator_required";

export type StewardBlockerStatus = "active" | "resolved";

export type StewardEventKind =
  | "autonomy.boot.recorded"
  | "autonomy.boot.skipped"
  | "autonomy.mode.updated"
  | "autonomy.policy.allowed"
  | "autonomy.policy.blocked"
  | "autonomy.tick.blocked"
  | "autonomy.tick.noop"
  | "autonomy.task.seeded"
  | "job.daily_self_review.recorded"
  | "job.daily_self_review.reused"
  | "job.daily_self_review.memory_extracted"
  | "job.sleep_consolidation.recorded"
  | "job.sleep_consolidation.reused"
  | "job.sleep_consolidation.pruned"
  | "job.strategy_validation.recorded"
  | "job.strategy_validation.reused"
  | "job.strategy_validation.approved"
  | "job.strategy_validation.rejected"
  | "session.created"
  | "session.touched"
  | "runtime.started"
  | "runtime.idle"
  | "flow.created"
  | "flow.completed"
  | "control.task.seeded"
  | "control.budget.blocked"
  | "control.anomaly.detected"
  | "control.governor.intervention"
  | "control.self_improvement.applied"
  | "control.self_improvement.analyzed"
  | "tool.precheck.blocked"
  | "tool.postcheck.normalized"
  | "tool.postcheck.classified"
  | "consequence.check"
  | "consequence.warning"
  | "consequence.reroute"
  | "consequence.refused"
  | "consequence.override_allowed"
  | "mission.time.updated"
  | "mission.time.exhausted"
  | "mission.heuristics.updated"
  | "mission.task_value.adjudicated"
  | "mission.audit.report"
  | "mission.audit.score"
  | "truth.claim_record"
  | "truth.candidate_decision"
  | "proof.accepted"
  | "proof.rejected"
  | "novel_claim.flagged";

export type StewardRuntimeStateRow = {
  sessionKey: string;
  status: StewardRuntimeStatus;
  ownerPid: number | null;
  activeFlowId: number | null;
  activeTaskId: number | null;
  heartbeatTs: number | null;
  lastTransitionTs: number | null;
  waitReason: string;
  lastError: string;
  version: number;
  dataJson: string;
};

export type StewardSessionRow = {
  id: string;
  agentId: string;
  channelKey: string;
  createdTs: number;
  lastActiveTs: number;
  status: StewardSessionStatus;
  dataJson: string;
};

export type StewardFlowRow = {
  id: number;
  sessionId: string;
  flowType: StewardFlowType;
  status: StewardFlowStatus;
  stateJson: string;
  ownerPid: number | null;
  createdTs: number;
  updatedTs: number;
  heartbeatTs: number | null;
};

export type StewardFlowTaskRow = {
  id: number;
  flowId: number;
  taskId: number;
  role: StewardFlowTaskRole;
  linkStatus: StewardFlowTaskLinkStatus;
  createdTs: number;
  updatedTs: number;
};

export type StewardEventRow = {
  id: number;
  ts: number;
  sessionId: string | null;
  flowId: number | null;
  kind: string;
  message: string;
  dataJson: string;
};
