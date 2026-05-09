CREATE TABLE IF NOT EXISTS steward_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES steward_sessions(id),
  gap_id INTEGER NOT NULL REFERENCES steward_goal_gaps(id),
  verdict_id INTEGER NOT NULL REFERENCES steward_tester_verdicts(id),
  milestone_kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'sealed',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_steward_milestones_verdict
  ON steward_milestones(verdict_id);

CREATE INDEX IF NOT EXISTS idx_steward_milestones_session_status
  ON steward_milestones(session_id, status, created_ts);
