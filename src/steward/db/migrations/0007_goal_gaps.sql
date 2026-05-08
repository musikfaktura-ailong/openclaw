CREATE TABLE IF NOT EXISTS steward_goal_gaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES steward_sessions(id),
  source_flow_id INTEGER REFERENCES steward_flows(id),
  source_host_task_id INTEGER REFERENCES steward_host_tasks(id),
  gap_kind TEXT NOT NULL,
  work_class TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  evidence_json TEXT DEFAULT '{}',
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_steward_goal_gaps_session_status_updated
  ON steward_goal_gaps(session_id, status, updated_ts);
