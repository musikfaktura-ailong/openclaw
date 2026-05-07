import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { loadTriageArtifact, persistAutonomyTriageArtifact } from "./triage-artifacts.js";

describe("WS-K triage artifacts", () => {
  beforeEach(() => {
    initStewardDb(":memory:");
  });

  afterEach(() => {
    closeStewardDb();
    resetDbForTest();
  });

  it("persists a bounded triage artifact and searchable knowledge reference", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-triage-"));
    try {
      const sessionKey = "agent:main:webchat:direct:ws-k-triage";
      const authority = getOrCreateStewardSession(sessionKey, 1_000);

      const artifact = await persistAutonomyTriageArtifact({
        sessionId: authority.sessionId,
        sessionKey,
        workClass: "goal_work",
        classificationReason: "no_recorded_proof_yet",
        plan: {
          flowType: "research",
          role: "primary",
          title: "Research pick: steward-vetted opportunity",
          details: "truth first",
          phase: "pick",
          goalKind: "proof_first_research",
        },
        artifactRoot: tempRoot,
        now: Date.UTC(2026, 4, 1, 8, 0, 0),
        embedder: async () => Float32Array.from([1, 0, 0, 0]),
      });
      const fileText = await fs.readFile(artifact.artifactPath, "utf8");
      const knowledge = getDb()
        .prepare(`SELECT metadata_json FROM steward_knowledge WHERE id = ?`)
        .get(artifact.knowledgeId) as { metadata_json: string };

      expect(fileText).toContain("\"classificationReason\": \"no_recorded_proof_yet\"");
      expect(knowledge.metadata_json).toContain("\"autonomy_triage_ref\":true");
    } finally {
      closeStewardDb();
      resetDbForTest();
      initStewardDb(":memory:");
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("stores default triage artifacts under the active steward db directory", async () => {
    closeStewardDb();
    resetDbForTest();
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-triage-db-"));
    const storePath = path.join(tempRoot, "sessions.json");
    initStewardDb(storePath);
    try {
      const sessionKey = "agent:main:webchat:direct:ws-k-triage-default-root";
      const authority = getOrCreateStewardSession(sessionKey, 2_000);

      const artifact = await persistAutonomyTriageArtifact({
        sessionId: authority.sessionId,
        sessionKey,
        workClass: "goal_work",
        classificationReason: "no_recorded_proof_yet",
        plan: {
          flowType: "research",
          role: "primary",
          title: "Research pick: steward-vetted opportunity",
          details: "truth first",
          phase: "pick",
          goalKind: "proof_first_research",
        },
        now: Date.UTC(2026, 4, 1, 9, 0, 0),
        embedder: async () => Float32Array.from([1, 0, 0, 0]),
      });

      expect(path.isAbsolute(artifact.artifactPath)).toBe(true);
      expect(artifact.artifactPath).toContain(path.join(tempRoot, "artifacts", "steward"));
    } finally {
      closeStewardDb();
      resetDbForTest();
      initStewardDb(":memory:");
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("resolves legacy relative triage artifact paths from the steward db directory", async () => {
    closeStewardDb();
    resetDbForTest();
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "steward2-triage-relative-"));
    const storePath = path.join(tempRoot, "sessions.json");
    initStewardDb(storePath);
    try {
      const relativeArtifactPath = path.join(
        "artifacts",
        "steward",
        "autonomy",
        "2026-05-05",
        "legacy-triage.json",
      );
      const absoluteArtifactPath = path.join(tempRoot, relativeArtifactPath);
      await fs.mkdir(path.dirname(absoluteArtifactPath), { recursive: true });
      await fs.writeFile(
        absoluteArtifactPath,
        JSON.stringify({
          sessionId: "session-1",
          sessionKey: "agent:main:main",
          workClass: "goal_work",
          classificationReason: "legacy_relative_path",
          generatedAt: 123,
          seedPlan: {
            flowType: "research",
            role: "primary",
            title: "Legacy",
            details: "Legacy",
            phase: "pick",
            goalKind: "proof_first_research",
          },
        }),
        "utf8",
      );

      const artifact = await loadTriageArtifact(relativeArtifactPath);
      expect(artifact.classificationReason).toBe("legacy_relative_path");
    } finally {
      closeStewardDb();
      resetDbForTest();
      initStewardDb(":memory:");
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
