import { getDb } from "../db/db-bootstrap.js";
import { withImmediateTransactionAsync } from "../db/tx.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { countSealedMilestones, sealCurrentMilestone } from "./milestone-registry.js";
import { resolveAutonomyWorkClassBoundary } from "./progress-discipline.js";
import { extractMilestoneSkill, matchGapSkill } from "./skill-bridge.js";
import { recordLatestTesterVerdict, resolveTesterGapRequirement } from "./tester-policy.js";

export type AutonomyGapWorkClass =
  | "goal_work"
  | "tester_work"
  | "diagnostic_work"
  | "maintenance_work"
  | "review_or_consolidation";

export type RecordedAutonomyGoalGap = {
  gapId: number;
  sessionId: string;
  gapKind: string;
  workClass: AutonomyGapWorkClass;
  reason: string;
  title: string;
  details: string;
  sourceFlowId: number | null;
  sourceHostTaskId: number | null;
  status: "open";
  evidence: Record<string, unknown>;
  reused: boolean;
};

type SqlParam = string | number | bigint | Uint8Array | null;

function countRows(sql: string, ...params: SqlParam[]): number {
  const row = getDb().prepare(sql).get(...params) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

type ProposedGap = Omit<RecordedAutonomyGoalGap, "gapId" | "sessionId" | "status" | "reused">;

function finalizeProposedGap(params: {
  sessionId: string;
  gap: ProposedGap;
  sealedMilestoneCount: number;
}): ProposedGap {
  const matchedSkill = matchGapSkill({
    title: params.gap.title,
    sessionId: params.sessionId,
  });
  const evidence = {
    ...params.gap.evidence,
    ...(matchedSkill ?? {}),
  };
  return {
    ...params.gap,
    evidence: withMilestoneEvidence(evidence, params.sealedMilestoneCount),
  };
}

function latestProofSummary(sessionId: string): {
  verdict: "accepted" | "rejected" | null;
  score: number | null;
  failureClass: string | null;
  taskTitle: string | null;
  flowId: number | null;
} {
  const row = getDb()
    .prepare(
      `SELECT verdict, score, failure_class, task_title, flow_id
       FROM steward_proofs
       WHERE session_id = ?
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(sessionId) as
    | {
        verdict: "accepted" | "rejected";
        score: number;
        failure_class: string;
        task_title: string;
        flow_id: number | null;
      }
    | undefined;
  return {
    verdict: row?.verdict ?? null,
    score: row == null ? null : Number(row.score ?? 0),
    failureClass: row?.failure_class ?? null,
    taskTitle: row?.task_title ?? null,
    flowId: row?.flow_id ?? null,
  };
}

function findLatestFailedAutonomyTask(sessionId: string, workClass?: string): {
  id: number;
  seed_flow_id: number | null;
} | null {
  const row = getDb()
    .prepare(
      `SELECT id, seed_flow_id
       FROM steward_host_tasks
       WHERE session_id = ?
         AND source = 'autonomy'
         AND status = 'failed'
         ${workClass ? "AND work_class = ?" : ""}
       ORDER BY updated_ts DESC, id DESC
       LIMIT 1`,
    )
    .get(...(workClass ? [sessionId, workClass] : [sessionId])) as
    | { id: number; seed_flow_id: number | null }
    | undefined;
  return row ?? null;
}

function applyBoundary(params: {
  sessionId: string;
  proposedWorkClass: AutonomyGapWorkClass;
  fallbackReason: string;
}): { workClass: AutonomyGapWorkClass; reason: string; boundaryApplied: boolean } {
  const boundary = resolveAutonomyWorkClassBoundary({
    sessionId: params.sessionId,
    proposedWorkClass: params.proposedWorkClass,
  });
  return {
    workClass: boundary.workClass,
    reason: boundary.boundaryApplied ? boundary.reason : params.fallbackReason,
    boundaryApplied: boundary.boundaryApplied,
  };
}

function withMilestoneEvidence(
  evidence: Record<string, unknown>,
  sealedMilestoneCount: number,
): Record<string, unknown> {
  return {
    ...evidence,
    sealedMilestoneCount,
  };
}

function proposeCurrentGap(params: { sessionId: string; now: number; sealedMilestoneCount: number }): ProposedGap {
  const testerRequirement = resolveTesterGapRequirement(params);
  if (testerRequirement) {
    if (testerRequirement.kind === "tester_required") {
      return finalizeProposedGap({
        sessionId: params.sessionId,
        sealedMilestoneCount: params.sealedMilestoneCount,
        gap: {
        gapKind: testerRequirement.reason,
        workClass: testerRequirement.workClass,
        reason: testerRequirement.reason,
        title: "Autonomy gap: independent tester required",
        details:
          "A goal-work proof was accepted, but the host requires one independent tester turn before the governing gap can move toward resolved.",
        sourceFlowId: testerRequirement.workerFlowId,
        sourceHostTaskId: testerRequirement.workerTaskId,
        evidence: testerRequirement.evidence,
      },
      });
    }
    return finalizeProposedGap({
      sessionId: params.sessionId,
      sealedMilestoneCount: params.sealedMilestoneCount,
      gap: {
      gapKind: testerRequirement.reason,
      workClass: testerRequirement.workClass,
      reason: testerRequirement.reason,
      title: "Autonomy gap: tester challenged worker proof",
      details:
        "The independent tester challenged the previous worker proof. The next host-owned action must reopen bounded goal work with the tester challenge evidence attached.",
      sourceFlowId: null,
      sourceHostTaskId: null,
      evidence: testerRequirement.evidence,
    },
    });
  }

  const activeBlockers = countRows(
    `SELECT COUNT(*) AS count
     FROM steward_blockers b
     JOIN steward_flows f ON f.id = b.flow_id
     WHERE f.session_id = ? AND b.status = 'active'`,
    params.sessionId,
  );
  if (activeBlockers > 0) {
    const applied = applyBoundary({
      sessionId: params.sessionId,
      proposedWorkClass: "diagnostic_work",
      fallbackReason: "active_blockers_present",
    });
    const sourceTask = findLatestFailedAutonomyTask(params.sessionId);
    return finalizeProposedGap({
      sessionId: params.sessionId,
      sealedMilestoneCount: params.sealedMilestoneCount,
      gap: {
      gapKind: applied.reason,
      workClass: applied.workClass,
      reason: applied.reason,
      title: "Autonomy gap: active blockers require diagnosis",
      details:
        "Open blockers exist in the steward ledger. The next host-owned action must investigate or clear those blockers before more autonomous goal work continues.",
      sourceFlowId: sourceTask?.seed_flow_id ?? null,
      sourceHostTaskId: sourceTask?.id ?? null,
      evidence: {
        activeBlockerCount: activeBlockers,
        proposedWorkClass: "diagnostic_work",
        boundaryApplied: applied.boundaryApplied,
      },
    },
    });
  }

  const proofCount = countRows(`SELECT COUNT(*) AS count FROM steward_proofs WHERE session_id = ?`, params.sessionId);
  if (proofCount === 0) {
    const applied = applyBoundary({
      sessionId: params.sessionId,
      proposedWorkClass: "goal_work",
      fallbackReason: "no_recorded_proof_yet",
    });
    return finalizeProposedGap({
      sessionId: params.sessionId,
      sealedMilestoneCount: params.sealedMilestoneCount,
      gap: {
      gapKind: applied.reason,
      workClass: applied.workClass,
      reason: applied.reason,
      title: "Autonomy gap: no recorded proof yet",
      details:
        "No steward proof is recorded for this session. The next autonomy cycle must reopen the requirement gap by producing bounded goal work toward a first proof-bearing opportunity.",
      sourceFlowId: null,
      sourceHostTaskId: null,
      evidence: {
        proofCount,
        proposedWorkClass: "goal_work",
        boundaryApplied: applied.boundaryApplied,
      },
    },
    });
  }

  const recentPrimaryFailures = countRows(
    `SELECT COUNT(*) AS count
     FROM (
       SELECT t.link_status
       FROM steward_flow_tasks t
       JOIN steward_flows f ON f.id = t.flow_id
       WHERE f.session_id = ?
         AND t.role = 'primary'
       ORDER BY t.id DESC
       LIMIT 2
     ) recent_failures
     WHERE link_status = 'failed'`,
    params.sessionId,
  );
  if (recentPrimaryFailures >= 2) {
    const applied = applyBoundary({
      sessionId: params.sessionId,
      proposedWorkClass: "diagnostic_work",
      fallbackReason: "consecutive_primary_failures",
    });
    const sourceTask = findLatestFailedAutonomyTask(params.sessionId);
    return finalizeProposedGap({
      sessionId: params.sessionId,
      sealedMilestoneCount: params.sealedMilestoneCount,
      gap: {
      gapKind: applied.reason,
      workClass: applied.workClass,
      reason: applied.reason,
      title: "Autonomy gap: consecutive primary failures",
      details:
        "Recent primary autonomy work failed repeatedly. The next host-owned action must reopen the failure gap through diagnosis rather than continuing ordinary goal work.",
      sourceFlowId: sourceTask?.seed_flow_id ?? null,
      sourceHostTaskId: sourceTask?.id ?? null,
      evidence: {
        recentPrimaryFailures,
        proposedWorkClass: "diagnostic_work",
        boundaryApplied: applied.boundaryApplied,
      },
    },
    });
  }

  const lastAuditTsRow = getDb()
    .prepare(
      `SELECT MAX(ts) AS ts
       FROM steward_events
       WHERE session_id = ?
         AND kind = 'mission.audit.report'`,
    )
    .get(params.sessionId) as { ts: number | null };
  const hasSessionEvents = countRows(`SELECT COUNT(*) AS count FROM steward_events WHERE session_id = ?`, params.sessionId);
  const reviewWindowMs = 24 * 60 * 60 * 1000;
  if (hasSessionEvents > 0 && (lastAuditTsRow.ts == null || params.now - Number(lastAuditTsRow.ts) >= reviewWindowMs)) {
    const applied = applyBoundary({
      sessionId: params.sessionId,
      proposedWorkClass: "review_or_consolidation",
      fallbackReason: lastAuditTsRow.ts == null ? "audit_missing" : "audit_stale",
    });
    const sourceTask = findLatestFailedAutonomyTask(params.sessionId);
    return finalizeProposedGap({
      sessionId: params.sessionId,
      sealedMilestoneCount: params.sealedMilestoneCount,
      gap: {
      gapKind: applied.reason,
      workClass: applied.workClass,
      reason: applied.reason,
      title: "Autonomy gap: review or consolidation required",
      details:
        "Mission evidence has not been audited recently enough. The next autonomy cycle must reopen the review gap before more ordinary maintenance continues.",
      sourceFlowId: sourceTask?.seed_flow_id ?? null,
      sourceHostTaskId: sourceTask?.id ?? null,
      evidence: {
        lastAuditTs: lastAuditTsRow.ts,
        reviewWindowMs,
        proposedWorkClass: "review_or_consolidation",
        boundaryApplied: applied.boundaryApplied,
      },
    },
    });
  }

  const latestProof = latestProofSummary(params.sessionId);
  const applied = applyBoundary({
    sessionId: params.sessionId,
    proposedWorkClass: "maintenance_work",
    fallbackReason: "baseline_maintenance_window",
  });
  const sourceTask = findLatestFailedAutonomyTask(params.sessionId, "maintenance_work");
  return finalizeProposedGap({
    sessionId: params.sessionId,
    sealedMilestoneCount: params.sealedMilestoneCount,
    gap: {
    gapKind: applied.reason,
    workClass: applied.workClass,
    reason: applied.reason,
    title: applied.reason === "baseline_maintenance_window"
      ? "Autonomy gap: bounded maintenance follow-up"
      : "Autonomy gap: repeated bad maintenance outcomes",
    details:
      applied.reason === "baseline_maintenance_window"
        ? "No higher-priority blocker, proof gap, or review gap is active. The next autonomy cycle may spend one bounded step on maintenance continuity."
        : "Repeated bad maintenance outcomes were recorded. The next autonomy cycle must change class instead of reseeding the same maintenance family.",
    sourceFlowId: sourceTask?.seed_flow_id ?? latestProof.flowId ?? null,
    sourceHostTaskId: sourceTask?.id ?? null,
    evidence: {
      latestProofVerdict: latestProof.verdict,
      latestProofFailureClass: latestProof.failureClass,
      latestProofTaskTitle: latestProof.taskTitle,
      proposedWorkClass: "maintenance_work",
      boundaryApplied: applied.boundaryApplied,
    },
  },
  });
}

export async function recordCurrentAutonomyGoalGap(params: {
  sessionId: string;
  now?: number;
}): Promise<RecordedAutonomyGoalGap> {
  const now = params.now ?? Date.now();
  const db = getDb();
  return withImmediateTransactionAsync(db, async () => {
    const recordedVerdict = recordLatestTesterVerdict({
      sessionId: params.sessionId,
      now,
    });
    const milestone = sealCurrentMilestone({
      sessionId: params.sessionId,
      verdict: recordedVerdict,
      now,
    });
    if (milestone && !milestone.reused) {
      await extractMilestoneSkill({
        milestone,
        sessionId: params.sessionId,
        now,
      });
    }
    const proposed = proposeCurrentGap({
      sessionId: params.sessionId,
      now,
      sealedMilestoneCount: countSealedMilestones(params.sessionId),
    });
    const currentOpen = db
      .prepare(
        `SELECT id, gap_kind, work_class, reason
         FROM steward_goal_gaps
         WHERE session_id = ?
           AND status = 'open'
         ORDER BY id DESC`,
      )
      .all(params.sessionId) as Array<{ id: number; gap_kind: string; work_class: string; reason: string }>;

    db.prepare(
      `UPDATE steward_goal_gaps
       SET status = 'resolved', updated_ts = ?
       WHERE session_id = ?
         AND status = 'open'
         AND NOT (
           gap_kind = ?
           AND work_class = ?
           AND reason = ?
         )`,
    ).run(now, params.sessionId, proposed.gapKind, proposed.workClass, proposed.reason);

    const matchingOpen = currentOpen.find(
      (row) =>
        row.gap_kind === proposed.gapKind &&
        row.work_class === proposed.workClass &&
        row.reason === proposed.reason,
    );

    let gapId: number;
    let reused = false;
    if (matchingOpen) {
      reused = true;
      gapId = matchingOpen.id;
      db.prepare(
        `UPDATE steward_goal_gaps
         SET source_flow_id = ?, source_host_task_id = ?, title = ?, details = ?, evidence_json = ?, updated_ts = ?, status = 'open'
         WHERE id = ?`,
      ).run(
        proposed.sourceFlowId,
        proposed.sourceHostTaskId,
        proposed.title,
        proposed.details,
        JSON.stringify(proposed.evidence),
        now,
        gapId,
      );
    } else {
      const result = db
        .prepare(
          `INSERT INTO steward_goal_gaps (
             session_id, source_flow_id, source_host_task_id, gap_kind, work_class, reason, status, title, details, evidence_json, created_ts, updated_ts
           ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
        )
        .run(
          params.sessionId,
          proposed.sourceFlowId,
          proposed.sourceHostTaskId,
          proposed.gapKind,
          proposed.workClass,
          proposed.reason,
          proposed.title,
          proposed.details,
          JSON.stringify(proposed.evidence),
          now,
          now,
        ) as { lastInsertRowid: number | bigint };
      gapId = Number(result.lastInsertRowid);
    }

    appendStewardEvent({
      kind: "autonomy.gap.recorded",
      message: proposed.title,
      sessionId: params.sessionId,
      flowId: proposed.sourceFlowId,
      now,
      data: {
        gapId,
        gapKind: proposed.gapKind,
        workClass: proposed.workClass,
        reason: proposed.reason,
        sourceHostTaskId: proposed.sourceHostTaskId,
        sourceFlowId: proposed.sourceFlowId,
        reused,
        evidence: proposed.evidence,
      },
    });

    return {
      gapId,
      sessionId: params.sessionId,
      gapKind: proposed.gapKind,
      workClass: proposed.workClass,
      reason: proposed.reason,
      title: proposed.title,
      details: proposed.details,
      sourceFlowId: proposed.sourceFlowId,
      sourceHostTaskId: proposed.sourceHostTaskId,
      status: "open",
      evidence: proposed.evidence,
      reused,
    };
  });
}
