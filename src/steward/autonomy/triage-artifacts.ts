import fs from "node:fs/promises";
import path from "node:path";
import { getStewardDbPath } from "../db/db-bootstrap.js";
import { resolveStewardDbPath } from "../db/runtime-db.js";
import { storeKnowledge } from "../memory/knowledge-store.js";
import type { StewardEmbedder } from "../memory/embedder.js";
import { appendStewardEvent } from "../runtime/runtime-events.js";
import type { AutonomyWorkClass } from "./work-classifier.js";
import type { AutonomySeedPlan } from "./goal-orchestrator.js";

export type AutonomyTriageArtifact = {
  artifactPath: string;
  knowledgeId: number;
};

export type PersistedAutonomyTriageArtifact = {
  sessionId: string;
  sessionKey: string;
  workClass: AutonomyWorkClass;
  classificationReason: string;
  generatedAt: number;
  seedPlan: AutonomySeedPlan;
};

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function defaultArtifactRoot(): string {
  let dbPath: string;
  try {
    dbPath = getStewardDbPath();
  } catch {
    dbPath = resolveStewardDbPath(process.env.OPENCLAW_STEWARD_DB_PATH ?? "steward.db");
  }
  return dbPath === ":memory:"
    ? path.join(process.cwd(), "artifacts", "steward")
    : path.join(path.dirname(dbPath), "artifacts", "steward");
}

function resolveStewardDbDir(): string {
  let dbPath: string;
  try {
    dbPath = getStewardDbPath();
  } catch {
    dbPath = resolveStewardDbPath(process.env.OPENCLAW_STEWARD_DB_PATH ?? "steward.db");
  }
  return dbPath === ":memory:" ? process.cwd() : path.dirname(dbPath);
}

function resolveTriageArtifactPath(artifactPath: string): string {
  if (path.isAbsolute(artifactPath)) {
    return artifactPath;
  }
  return path.resolve(resolveStewardDbDir(), artifactPath);
}

export async function persistAutonomyTriageArtifact(params: {
  sessionId: string;
  sessionKey: string;
  workClass: AutonomyWorkClass;
  classificationReason: string;
  plan: AutonomySeedPlan;
  artifactRoot?: string;
  embedder?: StewardEmbedder;
  now?: number;
}): Promise<AutonomyTriageArtifact> {
  const now = params.now ?? Date.now();
  const artifactRoot = params.artifactRoot ?? defaultArtifactRoot();
  const dayDir = path.join(artifactRoot, "autonomy", utcDay(now));
  await fs.mkdir(dayDir, { recursive: true });
  const filePath = path.join(dayDir, `${params.sessionId}-${now}-triage.json`);
  const payload = {
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    workClass: params.workClass,
    classificationReason: params.classificationReason,
    generatedAt: now,
    seedPlan: params.plan,
  };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  const knowledgeId = await storeKnowledge({
    sessionKey: params.sessionKey,
    memoryType: "shared_thread",
    text: `AUTONOMY_TRIAGE work_class=${params.workClass} phase=${params.plan.phase} title=${params.plan.title}`,
    embedder: params.embedder,
    now,
    metadata: {
      autonomy_triage_ref: true,
      work_class: params.workClass,
      classification_reason: params.classificationReason,
      phase: params.plan.phase,
      artifact_path: filePath,
    },
  });
  appendStewardEvent({
    kind: "autonomy.triage.recorded",
    message: "autonomy triage recorded",
    sessionId: params.sessionId,
    now,
    data: {
      workClass: params.workClass,
      classificationReason: params.classificationReason,
      phase: params.plan.phase,
      artifactPath: filePath,
      knowledgeId,
    },
  });
  return {
    artifactPath: filePath,
    knowledgeId,
  };
}

export async function loadTriageArtifact(artifactPath: string): Promise<PersistedAutonomyTriageArtifact> {
  const raw = await fs.readFile(resolveTriageArtifactPath(artifactPath), "utf8");
  return JSON.parse(raw) as PersistedAutonomyTriageArtifact;
}
