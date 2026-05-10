import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { extractMilestoneSkill, matchGapSkill } from "./skill-bridge.js";
import type { RecordedStewardMilestone } from "./milestone-registry.js";

describe("WS-Z4 skill bridge", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  function insertProof(params: {
    sessionId: string;
    proofId: number;
    flowId: number | null;
    title: string;
    now: number;
  }): void {
    if (params.flowId != null) {
      getDb()
        .prepare(
          `INSERT INTO steward_flows (
             id, session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
           ) VALUES (?, ?, 'research', 'completed', '{}', ?, ?, ?, ?)`,
        )
        .run(
          params.flowId,
          params.sessionId,
          process.pid,
          params.now,
          params.now,
          params.now,
        );
    }
    getDb()
      .prepare(
        `INSERT INTO steward_proofs (
           id, task_id, session_id, flow_id, task_type, task_title, proof_text, history_summary,
           verdict, score, failure_class, grounded, reason, accepted_at, rejected_at, rejection_reason, created_ts
         ) VALUES (?, NULL, ?, ?, 'general', ?, 'accepted proof', '', 'accepted', 1, '', 1, '', ?, NULL, '', ?)`,
      )
      .run(params.proofId, params.sessionId, params.flowId, params.title, params.now, params.now);
  }

  function insertToolEvent(params: {
    sessionId: string;
    flowId: number;
    toolName: string;
    now: number;
  }): void {
    getDb()
      .prepare(
        `INSERT INTO steward_events (ts, session_id, flow_id, kind, message, data_json)
         VALUES (?, ?, ?, 'tool.postcheck.normalized', ?, ?)`,
      )
      .run(
        params.now,
        params.sessionId,
        params.flowId,
        `Tool postcheck normalized ${params.toolName}`,
        JSON.stringify({ toolName: params.toolName }),
      );
  }

  function buildMilestone(params: {
    sessionId: string;
    workerProofId: number;
    verdictId?: number;
  }): RecordedStewardMilestone {
    return {
      milestoneId: 1,
      sessionId: params.sessionId,
      gapId: 1,
      verdictId: params.verdictId ?? 1,
      milestoneKind: "goal_gap_confirmed",
      title: "Milestone sealed: tester gap",
      status: "sealed",
      evidence: {
        workerProofId: params.workerProofId,
      },
      createdTs: 1_000,
      updatedTs: 1_000,
      reused: false,
    };
  }

  it("extracts a skill from worker proof title + persisted tool sequence and emits an event", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z4-extract", 1_000);
    insertProof({
      sessionId: authority.sessionId,
      proofId: 101,
      flowId: 11,
      title: "Fix broken import",
      now: 1_050,
    });
    insertToolEvent({
      sessionId: authority.sessionId,
      flowId: 11,
      toolName: "read",
      now: 1_060,
    });
    insertToolEvent({
      sessionId: authority.sessionId,
      flowId: 11,
      toolName: "edit",
      now: 1_061,
    });

    const knowledgeId = await extractMilestoneSkill({
      milestone: buildMilestone({
        sessionId: authority.sessionId,
        workerProofId: 101,
      }),
      sessionId: authority.sessionId,
      now: 1_100,
    });

    const row = getDb()
      .prepare(
        `SELECT memory_type, metadata_json
         FROM steward_knowledge
         WHERE id = ?`,
      )
      .get(knowledgeId) as { memory_type: string; metadata_json: string };
    const event = getDb()
      .prepare(
        `SELECT data_json
         FROM steward_events
         WHERE session_id = ?
           AND kind = 'autonomy.skill.extracted'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get(authority.sessionId) as { data_json: string };

    expect(knowledgeId).toBeTypeOf("number");
    expect(row.memory_type).toBe("skill_sequence");
    expect(row.metadata_json).toContain("\"normalized\":\"fix broken import\"");
    expect(row.metadata_json).toContain("\"tool_sequence\":[\"read\",\"edit\"]");
    expect(event.data_json).toContain(`"knowledgeId":${knowledgeId}`);
  });

  it("returns null and stores nothing when the worker proof flow_id is null", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z4-null-flow", 2_000);
    insertProof({
      sessionId: authority.sessionId,
      proofId: 201,
      flowId: null,
      title: "Fix broken import",
      now: 2_050,
    });

    const knowledgeId = await extractMilestoneSkill({
      milestone: buildMilestone({
        sessionId: authority.sessionId,
        workerProofId: 201,
      }),
      sessionId: authority.sessionId,
      now: 2_100,
    });

    const count = getDb()
      .prepare(`SELECT COUNT(*) AS count FROM steward_knowledge WHERE session_key = ?`)
      .get(authority.sessionId) as { count: number };

    expect(knowledgeId).toBeNull();
    expect(Number(count.count)).toBe(0);
  });

  it("matches a prior skill by normalized title overlap", async () => {
    const authority = getOrCreateStewardSession("agent:main:webchat:direct:z4-match", 3_000);
    insertProof({
      sessionId: authority.sessionId,
      proofId: 301,
      flowId: 31,
      title: "Fix broken import",
      now: 3_050,
    });
    insertToolEvent({
      sessionId: authority.sessionId,
      flowId: 31,
      toolName: "read",
      now: 3_060,
    });
    insertToolEvent({
      sessionId: authority.sessionId,
      flowId: 31,
      toolName: "edit",
      now: 3_061,
    });
    await extractMilestoneSkill({
      milestone: buildMilestone({
        sessionId: authority.sessionId,
        workerProofId: 301,
      }),
      sessionId: authority.sessionId,
      now: 3_100,
    });

    const match = matchGapSkill({
      title: "Fix broken import regression",
      sessionId: authority.sessionId,
    });
    const mismatch = matchGapSkill({
      title: "Investigate memory leak",
      sessionId: authority.sessionId,
    });

    expect(match).toMatchObject({
      matchedSkillTitle: "Fix broken import",
    });
    expect((match?.matchedSkillScore ?? 0)).toBeGreaterThanOrEqual(0.3);
    expect(mismatch).toBeNull();
  });
});
