CREATE TABLE IF NOT EXISTS steward_host_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES steward_sessions(id),
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  work_class TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  triage_artifact_path TEXT,
  triage_knowledge_id INTEGER REFERENCES steward_knowledge(id),
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_steward_host_tasks_session_created
  ON steward_host_tasks(session_id, created_ts);
