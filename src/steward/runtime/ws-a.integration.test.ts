import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MsgContext } from "../../auto-reply/templating.js";
import { clearSessionStoreCacheForTest, loadSessionStore, recordSessionMetaFromInbound } from "../../config/sessions.js";
import { updateSessionStoreAfterAgentRun } from "../../agents/command/session-store.js";
import {
  closeStewardDb,
  getDb,
  initStewardDb,
  resetDbForTest,
} from "../db/db-bootstrap.js";
import { computeStewardSessionId } from "./session-authority.js";
import { casUpdateRuntimeState, getOrCreateRuntimeState } from "./runtime-state-repo.js";

function createInboundContext(sessionKey: string): MsgContext {
  return {
    Provider: "webchat",
    Surface: "webchat",
    ChatType: "direct",
    From: "webchat:user-1",
    To: "webchat:agent",
    SessionKey: sessionKey,
    OriginatingTo: "webchat:user-1",
  };
}

async function withTempStore<T>(
  run: (params: { dir: string; storePath: string }) => Promise<T>,
): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-steward-ws-a-"));
  try {
    const storePath = path.join(dir, "sessions.json");
    await fs.writeFile(storePath, "{}", "utf8");
    return await run({ dir, storePath });
  } finally {
    closeStewardDb();
    resetDbForTest();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

afterEach(() => {
  clearSessionStoreCacheForTest();
  closeStewardDb();
  resetDbForTest();
});

describe("WS-A steward runtime authority", () => {
  it("bootstraps steward.db and applies the initial schema migration", async () => {
    await withTempStore(async ({ storePath }) => {
      const db = initStewardDb(storePath);
      const version = db.prepare("PRAGMA user_version").get() as { user_version: number };
      const tables = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'steward_%'`)
        .all() as Array<{ name: string }>;

      expect(version.user_version).toBe(9);
      expect(tables.map((row) => row.name).sort()).toEqual(
        expect.arrayContaining([
          "steward_blockers",
          "steward_events",
          "steward_flow_tasks",
          "steward_flows",
          "steward_goal_gaps",
          "steward_host_tasks",
          "steward_knowledge",
          "steward_kv",
          "steward_memories",
          "steward_milestones",
          "steward_runtime_state",
          "steward_session_entries",
          "steward_sessions",
          "steward_tester_verdicts",
        ]),
      );
    });
  });

  it("derives a deterministic steward session id from agentId + channelKey", () => {
    expect(computeStewardSessionId("main", "webchat:dm:user-1")).toBe(
      computeStewardSessionId("main", "webchat:dm:user-1"),
    );
    expect(computeStewardSessionId("main", "webchat:dm:user-1")).not.toBe(
      computeStewardSessionId("main", "webchat:dm:user-2"),
    );
  });

  it("rejects stale CAS writes for the same session", async () => {
    initStewardDb(":memory:");
    const state = getOrCreateRuntimeState("session-a");
    const first = casUpdateRuntimeState({
      sessionKey: "session-a",
      expectedVersion: state.version,
      status: "running",
      activeFlowId: 1,
      activeTaskId: 1,
      ownerPid: process.pid,
      heartbeatTs: Date.now(),
    });
    const stale = casUpdateRuntimeState({
      sessionKey: "session-a",
      expectedVersion: state.version,
      status: "idle",
    });

    expect(first).toBe(true);
    expect(stale).toBe(false);
  });

  it("writes inbound runtime state to DB and returns to idle after run completion", async () => {
    await withTempStore(async ({ storePath }) => {
      const sessionKey = "agent:main:webchat:direct:user-1";
      await recordSessionMetaFromInbound({
        storePath,
        sessionKey,
        ctx: createInboundContext(sessionKey),
      });

      const authorityId = computeStewardSessionId("main", "webchat:direct:user-1");
      const db = getDb();
      const runtimeAfterInbound = db
        .prepare(
          `SELECT status, active_flow_id, active_task_id, version
           FROM steward_runtime_state
           WHERE session_key = ?`,
        )
        .get(authorityId) as {
        status: string;
        active_flow_id: number | null;
        active_task_id: number | null;
        version: number;
      };
      expect(runtimeAfterInbound.status).toBe("running");
      expect(runtimeAfterInbound.active_flow_id).not.toBeNull();
      expect(runtimeAfterInbound.active_task_id).not.toBeNull();

      const sessionStore = loadSessionStore(storePath, { skipCache: true });
      await updateSessionStoreAfterAgentRun({
        cfg: {} as never,
        sessionId: sessionStore[sessionKey]!.sessionId,
        sessionKey,
        storePath,
        sessionStore,
        defaultProvider: "openai",
        defaultModel: "gpt-test",
        result: {
          meta: {
            durationMs: 1,
            aborted: false,
            finalAssistantVisibleText:
              "Evidence recorded from the inbound turn started event confirms the agent turn completed successfully.",
          },
        } as never,
      });

      const runtimeAfterComplete = db
        .prepare(
          `SELECT status, active_flow_id, active_task_id, version
           FROM steward_runtime_state
           WHERE session_key = ?`,
        )
        .get(authorityId) as {
        status: string;
        active_flow_id: number | null;
        active_task_id: number | null;
        version: number;
      };
      const flow = db
        .prepare(`SELECT status FROM steward_flows WHERE id = ?`)
        .get(runtimeAfterInbound.active_flow_id) as { status: string };
      const events = db
        .prepare(`SELECT kind FROM steward_events WHERE session_id = ? ORDER BY id`)
        .all(authorityId) as Array<{ kind: string }>;

      expect(runtimeAfterComplete.status).toBe("idle");
      expect(runtimeAfterComplete.active_flow_id).toBeNull();
      expect(runtimeAfterComplete.active_task_id).toBeNull();
      expect(flow.status).toBe("completed");
      expect(events.map((row) => row.kind)).toEqual(
        expect.arrayContaining([
          "runtime.started",
          "proof.accepted",
          "mission.task_value.adjudicated",
          "runtime.idle",
        ]),
      );
    });
  });

  it("persists a failed terminal task status for aborted turns", async () => {
    await withTempStore(async ({ storePath }) => {
      const sessionKey = "agent:main:webchat:direct:user-abort";
      await recordSessionMetaFromInbound({
        storePath,
        sessionKey,
        ctx: createInboundContext(sessionKey),
      });

      const sessionStore = loadSessionStore(storePath, { skipCache: true });
      await updateSessionStoreAfterAgentRun({
        cfg: {} as never,
        sessionId: sessionStore[sessionKey]!.sessionId,
        sessionKey,
        storePath,
        sessionStore,
        defaultProvider: "openai",
        defaultModel: "gpt-test",
        result: {
          meta: {
            durationMs: 1,
            aborted: true,
            finalAssistantVisibleText: "",
          },
        } as never,
      });

      const authorityId = computeStewardSessionId("main", "webchat:direct:user-abort");
      const taskRow = getDb()
        .prepare(
          `SELECT t.link_status
           FROM steward_flow_tasks t
           JOIN steward_flows f ON f.id = t.flow_id
           WHERE f.session_id = ?
           ORDER BY t.id DESC
           LIMIT 1`,
        )
        .get(authorityId) as { link_status: string };
      const idleEvent = getDb()
        .prepare(
          `SELECT data_json
           FROM steward_events
           WHERE session_id = ? AND kind = 'runtime.idle'
           ORDER BY id DESC
           LIMIT 1`,
        )
        .get(authorityId) as { data_json: string };

      expect(taskRow.link_status).toBe("failed");
      expect(idleEvent.data_json).toContain("\"terminalTaskStatus\":\"failed\"");
    });
  });
});
