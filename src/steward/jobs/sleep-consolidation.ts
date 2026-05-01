import { gzipSync } from "node:zlib";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { getDb } from "../db/db-bootstrap.js";
import { resolveStewardDbPath } from "../db/runtime-db.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { storeKnowledge, type StewardKnowledgeEntry } from "../memory/knowledge-store.js";
import type { StewardEmbedder } from "../memory/embedder.js";
import { SLEEP_CONSOLIDATION_CADENCE_MS } from "./job-types.js";

const DEFAULT_PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SAFE_REDACTABLE_EVENT_KINDS = [
  "session.touched",
  "autonomy.policy.allowed",
  "autonomy.policy.blocked",
  "autonomy.tick.blocked",
  "autonomy.tick.noop",
] as const;

export type SleepConsolidationSummary = {
  day: string;
  windowStartTs: number;
  windowEndTs: number;
  eventCount: number;
  flowCount: number;
  knowledgeCount: number;
  flowSummaries: Array<{
    flowId: number;
    flowType: string;
    status: string;
    eventCount: number;
    lastEventKind: string;
    lastEventTs: number;
  }>;
};

export type SleepConsolidationResult = {
  created: boolean;
  reused: boolean;
  day: string;
  flowId: number;
  taskId: number;
  summaryPath: string;
  archivePath: string | null;
  redactedEventCount: number;
  summaryKnowledgeId: number;
};

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function utcDayWindow(now: number): { day: string; startTs: number; endTs: number } {
  const iso = new Date(now).toISOString();
  const day = iso.slice(0, 10);
  const startTs = Date.parse(`${day}T00:00:00.000Z`);
  return { day, startTs, endTs: startTs + SLEEP_CONSOLIDATION_CADENCE_MS };
}

function redactArchivePayload(value: string): string {
  return JSON.stringify({
    archived: true,
    redacted: true,
    originalBytes: Buffer.byteLength(value || "", "utf8"),
  });
}

function archiveHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

function findExistingSleepConsolidationFlow(sessionId: string, day: string): {
  flowId: number;
  taskId: number;
  summaryPath: string | null;
  archivePath: string | null;
  redactedEventCount: number;
  summaryKnowledgeId: number | null;
} | null {
  const rows = getDb()
    .prepare(
      `SELECT f.id, t.task_id, f.state_json
       FROM steward_flows f
       JOIN steward_flow_tasks t ON t.flow_id = f.id
       WHERE f.session_id = ?
         AND f.flow_type = 'maintenance'
       ORDER BY f.id DESC`,
    )
    .all(sessionId) as Array<{ id: number; task_id: number; state_json: string }>;
  for (const row of rows) {
    try {
      const state = JSON.parse(row.state_json || "{}") as Record<string, unknown>;
      if (state.job_type === "sleep_consolidation" && state.day === day) {
        return {
          flowId: Number(row.id),
          taskId: Number(row.task_id),
          summaryPath: typeof state.summary_path === "string" ? state.summary_path : null,
          archivePath: typeof state.archive_path === "string" ? state.archive_path : null,
          redactedEventCount: Number(state.redacted_event_count ?? 0),
          summaryKnowledgeId:
            state.summary_knowledge_id == null ? null : Number(state.summary_knowledge_id),
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function buildSleepConsolidationSummary(params: {
  sessionId: string;
  sessionKey?: string;
  now?: number;
}): SleepConsolidationSummary {
  const now = params.now ?? Date.now();
  const window = utcDayWindow(now);
  const db = getDb();
  const eventRows = db
    .prepare(
      `SELECT flow_id, kind, ts
       FROM steward_events
       WHERE session_id = ?
         AND ts >= ?
         AND ts < ?
       ORDER BY id ASC`,
    )
    .all(params.sessionId, window.startTs, window.endTs) as Array<{
    flow_id: number | null;
    kind: string;
    ts: number;
  }>;
  const grouped = new Map<number, { eventCount: number; lastEventKind: string; lastEventTs: number }>();
  for (const row of eventRows) {
    if (row.flow_id == null) {
      continue;
    }
    const current = grouped.get(row.flow_id) ?? {
      eventCount: 0,
      lastEventKind: "",
      lastEventTs: 0,
    };
    current.eventCount += 1;
    if (row.ts >= current.lastEventTs) {
      current.lastEventTs = row.ts;
      current.lastEventKind = row.kind;
    }
    grouped.set(row.flow_id, current);
  }

  const activeFlowIds = Array.from(grouped.keys());
  const flowRows =
    activeFlowIds.length === 0
      ? []
      : (db
          .prepare(
            `SELECT id, flow_type, status
             FROM steward_flows
             WHERE session_id = ?
               AND id IN (${activeFlowIds.map(() => "?").join(", ")})
             ORDER BY id ASC`,
          )
          .all(params.sessionId, ...activeFlowIds) as Array<{
          id: number;
          flow_type: string;
          status: string;
        }>);
  const knowledgeCount = Number(
    ((db.prepare(`SELECT COUNT(*) AS count FROM steward_knowledge WHERE session_key = ?`).get(params.sessionKey ?? null) as {
      count: number;
    })?.count ?? 0),
  );

  return {
    day: window.day,
    windowStartTs: window.startTs,
    windowEndTs: window.endTs,
    eventCount: eventRows.length,
    flowCount: flowRows.length,
    knowledgeCount,
    flowSummaries: flowRows.map((row) => {
      const aggregate = grouped.get(row.id);
      return {
        flowId: row.id,
        flowType: row.flow_type,
        status: row.status,
        eventCount: aggregate?.eventCount ?? 0,
        lastEventKind: aggregate?.lastEventKind ?? "",
        lastEventTs: aggregate?.lastEventTs ?? 0,
      };
    }),
  };
}

async function ensureSleepArtifactRoot(root: string): Promise<string> {
  await fs.mkdir(root, { recursive: true });
  return root;
}

async function writeSleepSummaryArtifact(params: {
  artifactRoot: string;
  sessionId: string;
  summary: SleepConsolidationSummary;
}): Promise<string> {
  const dayDir = path.join(params.artifactRoot, "sleep", params.summary.day);
  await fs.mkdir(dayDir, { recursive: true });
  const summaryPath = path.join(dayDir, `${params.sessionId}.day-summary.json`);
  await fs.writeFile(summaryPath, JSON.stringify(params.summary, null, 2), "utf8");
  return summaryPath;
}

async function archiveAndRedactOldEvents(params: {
  sessionId: string;
  artifactRoot: string;
  pruneOlderThanMs: number;
  now: number;
  dryRun?: boolean;
}): Promise<{ archivePath: string | null; redactedEventCount: number }> {
  const cutoff = params.now - params.pruneOlderThanMs;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, ts, kind, message, data_json
       FROM steward_events
       WHERE session_id = ?
         AND ts < ?
         AND kind IN (${SAFE_REDACTABLE_EVENT_KINDS.map(() => "?").join(", ")})
         AND data_json NOT LIKE '%"archived":true%'`,
    )
    .all(params.sessionId, cutoff, ...SAFE_REDACTABLE_EVENT_KINDS) as Array<{
    id: number;
    ts: number;
    kind: string;
    message: string;
    data_json: string;
  }>;
  if (rows.length === 0) {
    return { archivePath: null, redactedEventCount: 0 };
  }
  const archiveDir = path.join(params.artifactRoot, "sleep", "archive");
  await fs.mkdir(archiveDir, { recursive: true });
  const archivePayload = Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  const gzPayload = gzipSync(archivePayload);
  const archiveName = `${params.sessionId}-${params.now}-${archiveHash(gzPayload)}.jsonl.gz`;
  const archivePath = path.join(archiveDir, archiveName);
  if (!params.dryRun) {
    await fs.writeFile(archivePath, gzPayload);
    const update = db.prepare(`UPDATE steward_events SET data_json = ? WHERE id = ?`);
    for (const row of rows) {
      update.run(redactArchivePayload(row.data_json), row.id);
    }
  }
  return {
    archivePath,
    redactedEventCount: rows.length,
  };
}

export async function runSleepConsolidationJob(params: {
  sessionKey: string;
  now?: number;
  pruneOlderThanMs?: number;
  artifactRoot?: string;
  dryRun?: boolean;
  embedder?: StewardEmbedder;
}): Promise<SleepConsolidationResult> {
  const now = params.now ?? Date.now();
  const pruneOlderThanMs = params.pruneOlderThanMs ?? DEFAULT_PRUNE_AGE_MS;
  const authority = getOrCreateStewardSession(params.sessionKey, now);
  const window = utcDayWindow(now);
  const existing = findExistingSleepConsolidationFlow(authority.sessionId, window.day);
  if (existing) {
    appendStewardEvent({
      kind: "job.sleep_consolidation.reused",
      message: "sleep consolidation reused existing day record",
      sessionId: authority.sessionId,
      flowId: existing.flowId,
      now,
      data: {
        day: window.day,
        flowId: existing.flowId,
        taskId: existing.taskId,
        summaryPath: existing.summaryPath,
        archivePath: existing.archivePath,
      },
    });
    return {
      created: false,
      reused: true,
      day: window.day,
      flowId: existing.flowId,
      taskId: existing.taskId,
      summaryPath: existing.summaryPath ?? "",
      archivePath: existing.archivePath,
      redactedEventCount: existing.redactedEventCount,
      summaryKnowledgeId: existing.summaryKnowledgeId ?? 0,
    };
  }

  const dbPath = resolveStewardDbPath(process.env.OPENCLAW_STEWARD_DB_PATH ?? "steward.db");
  const artifactRoot =
    params.artifactRoot ?? path.join(path.dirname(dbPath), "artifacts", "steward");
  await ensureSleepArtifactRoot(artifactRoot);

  const summary = buildSleepConsolidationSummary({
    sessionId: authority.sessionId,
    sessionKey: params.sessionKey,
    now,
  });
  const summaryPath = await writeSleepSummaryArtifact({
    artifactRoot,
    sessionId: authority.sessionId,
    summary,
  });
  const archive = await archiveAndRedactOldEvents({
    sessionId: authority.sessionId,
    artifactRoot,
    pruneOlderThanMs,
    now,
    dryRun: params.dryRun,
  });
  const summaryKnowledgeId = await storeKnowledge({
    sessionKey: params.sessionKey,
    memoryType: "shared_thread",
    text: `SLEEP_SUMMARY day=${summary.day} events=${summary.eventCount} flows=${summary.flowCount}`,
    embedder: params.embedder,
    now,
    metadata: {
      sleep_summary_ref: true,
      day: summary.day,
      summary_path: summaryPath,
      archive_path: archive.archivePath,
      redacted_event_count: archive.redactedEventCount,
    },
  });

  const stateJson = JSON.stringify({
    job_type: "sleep_consolidation",
    day: summary.day,
    summary,
    summary_path: summaryPath,
    archive_path: archive.archivePath,
    redacted_event_count: archive.redactedEventCount,
    summary_knowledge_id: summaryKnowledgeId,
  });
  const db = getDb();
  const flowResult = db
    .prepare(
      `INSERT INTO steward_flows (
         session_id, flow_type, status, state_json, owner_pid, created_ts, updated_ts, heartbeat_ts
       ) VALUES (?, 'maintenance', 'completed', ?, ?, ?, ?, ?)` ,
    )
    .run(authority.sessionId, stateJson, process.pid, now, now, now) as { lastInsertRowid: number | bigint };
  const flowId = Number(flowResult.lastInsertRowid);
  const taskId = flowId;
  db.prepare(
    `INSERT INTO steward_flow_tasks (
       flow_id, task_id, role, link_status, created_ts, updated_ts
     ) VALUES (?, ?, 'diagnostic', 'succeeded', ?, ?)` ,
  ).run(flowId, taskId, now, now);

  appendStewardEvent({
    kind: "job.sleep_consolidation.recorded",
    message: "sleep consolidation recorded",
    sessionId: authority.sessionId,
    flowId,
    now,
    data: {
      day: summary.day,
      taskId,
      summaryPath,
      archivePath: archive.archivePath,
      redactedEventCount: archive.redactedEventCount,
      summaryKnowledgeId,
      eventCount: summary.eventCount,
      flowCount: summary.flowCount,
    },
  });
  appendStewardEvent({
    kind: "job.sleep_consolidation.pruned",
    message: "sleep consolidation pruned archived event payloads",
    sessionId: authority.sessionId,
    flowId,
    now,
    data: {
      day: summary.day,
      archivePath: archive.archivePath,
      redactedEventCount: archive.redactedEventCount,
      pruneOlderThanMs,
    },
  });

  return {
    created: true,
    reused: false,
    day: summary.day,
    flowId,
    taskId,
    summaryPath,
    archivePath: archive.archivePath,
    redactedEventCount: archive.redactedEventCount,
    summaryKnowledgeId,
  };
}
