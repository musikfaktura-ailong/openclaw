import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeStewardDb, getDb, initStewardDb, resetDbForTest } from "../db/db-bootstrap.js";
import { getOrCreateStewardSession } from "../runtime/session-authority.js";
import { persistAutonomyTriageArtifact } from "./triage-artifacts.js";

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
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
