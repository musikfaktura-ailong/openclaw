CREATE TABLE IF NOT EXISTS steward_tester_verdicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES steward_sessions(id),
  gap_id INTEGER NOT NULL REFERENCES steward_goal_gaps(id),
  worker_proof_id INTEGER NOT NULL REFERENCES steward_proofs(id),
  tester_proof_id INTEGER NOT NULL REFERENCES steward_proofs(id),
  verdict TEXT NOT NULL,
  challenge_summary TEXT NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_steward_tester_verdicts_tester_proof
  ON steward_tester_verdicts(tester_proof_id);

CREATE INDEX IF NOT EXISTS idx_steward_tester_verdicts_gap_updated
  ON steward_tester_verdicts(gap_id, updated_ts);

CREATE INDEX IF NOT EXISTS idx_steward_tester_verdicts_worker_proof
  ON steward_tester_verdicts(worker_proof_id);
