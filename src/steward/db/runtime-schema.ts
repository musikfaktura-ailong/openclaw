export type StewardRuntimeStatus = "idle" | "running" | "waiting" | "blocked";
export type StewardRuntimeTriggerSource = "user" | "autonomy";

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
  | "autonomy.gap.recorded"
  | "autonomy.milestone.sealed"
  | "autonomy.tester.verdict"
  | "autonomy.boot.recorded"
  | "autonomy.boot.skipped"
  | "autonomy.mode.updated"
  | "autonomy.policy.allowed"
  | "autonomy.policy.blocked"
  | "autonomy.bridge.tick"
  | "autonomy.bridge.failed"
  | "autonomy.tick.blocked"
  | "autonomy.tick.noop"
  | "autonomy.task.seeded"
  | "autonomy.triage.recorded"
  | "autonomy.execution.requested"
  | "autonomy.execution.completed"
  | "autonomy.execution.failed"
  | "autonomy.progress.policy"
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
  | "runtime.stream_started"
  | "runtime.stream_first_event"
  | "runtime.stream_terminal"
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
  | "novel_claim.flagged"
  | "lmstudio.lifecycle.lock_wait_started"
  | "lmstudio.lifecycle.lock_acquired"
  | "lmstudio.lifecycle.lock_released"
  | "lmstudio.lifecycle.unload_started"
  | "lmstudio.lifecycle.unload_finished"
  | "lmstudio.lifecycle.load_started"
  | "lmstudio.lifecycle.load_finished"
  | "lmstudio.lifecycle.load_failed"
  | "lmstudio.lifecycle.query_lock_wait_started"
  | "lmstudio.lifecycle.query_lock_acquired"
  | "lmstudio.lifecycle.query_lock_released"
  | "lmstudio.lifecycle.context_mismatch_detected";

export type StewardRuntimeStateRow = {
  sessionKey: string;
  status: StewardRuntimeStatus;
  triggerSource: StewardRuntimeTriggerSource | null;
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

export type StewardHostTaskStatus = "pending" | "running" | "done" | "failed" | "blocked";

export type StewardGoalGapStatus = "open" | "resolved";
export type StewardTesterVerdict = "confirmed" | "challenged";
export type StewardMilestoneStatus = "sealed";

export type StewardGoalGapRow = {
  id: number;
  sessionId: string;
  sourceFlowId: number | null;
  sourceHostTaskId: number | null;
  gapKind: string;
  workClass: string;
  reason: string;
  status: StewardGoalGapStatus;
  title: string;
  details: string;
  evidenceJson: string;
  createdTs: number;
  updatedTs: number;
};

export type StewardTesterVerdictRow = {
  id: number;
  sessionId: string;
  gapId: number;
  workerProofId: number;
  testerProofId: number;
  verdict: StewardTesterVerdict;
  challengeSummary: string;
  createdTs: number;
  updatedTs: number;
};

export type StewardMilestoneRow = {
  id: number;
  sessionId: string;
  gapId: number;
  verdictId: number;
  milestoneKind: string;
  title: string;
  status: StewardMilestoneStatus;
  evidenceJson: string;
  createdTs: number;
  updatedTs: number;
};

export type StewardHostTaskRow = {
  id: number;
  sessionId: string;
  source: string;
  status: StewardHostTaskStatus;
  workClass: string;
  title: string;
  details: string;
  triageArtifactPath: string | null;
  triageKnowledgeId: number | null;
  claimedTs: number | null;
  completedTs: number | null;
  failedTs: number | null;
  errorJson: string;
  blockedReason: string;
  createdTs: number;
  updatedTs: number;
};
