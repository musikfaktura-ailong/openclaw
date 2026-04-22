CREATE TABLE IF NOT EXISTS steward_proofs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER,
  session_id TEXT NOT NULL REFERENCES steward_sessions(id),
  flow_id INTEGER REFERENCES steward_flows(id),
  task_type TEXT NOT NULL DEFAULT 'general',
  task_title TEXT NOT NULL DEFAULT '',
  proof_text TEXT NOT NULL,
  history_summary TEXT NOT NULL DEFAULT '',
  verdict TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  failure_class TEXT NOT NULL DEFAULT '',
  grounded INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  accepted_at INTEGER,
  rejected_at INTEGER,
  rejection_reason TEXT NOT NULL DEFAULT '',
  created_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_steward_proofs_session_ts
  ON steward_proofs(session_id, created_ts);

CREATE TABLE IF NOT EXISTS steward_proof_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  knowledge_id INTEGER NOT NULL UNIQUE REFERENCES steward_knowledge(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  label TEXT NOT NULL,
  label_source TEXT NOT NULL DEFAULT 'judge',
  judge_verdict TEXT NOT NULL,
  judge_reason TEXT NOT NULL DEFAULT '',
  failure_class TEXT NOT NULL DEFAULT '',
  task_title TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_steward_proof_examples_task_label
  ON steward_proof_examples(task_type, label);

CREATE INDEX IF NOT EXISTS idx_steward_proof_examples_content_hash
  ON steward_proof_examples(content_hash);
