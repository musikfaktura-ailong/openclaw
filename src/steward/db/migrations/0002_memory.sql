CREATE TABLE IF NOT EXISTS steward_knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key TEXT,
  memory_type TEXT NOT NULL,
  text TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  embedding_blob BLOB NOT NULL,
  embedding_dims INTEGER NOT NULL,
  embedding_model TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_steward_knowledge_session_type_ts
  ON steward_knowledge(session_key, memory_type, created_ts);

CREATE TABLE IF NOT EXISTS steward_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key TEXT NOT NULL,
  knowledge_id INTEGER NOT NULL UNIQUE REFERENCES steward_knowledge(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 0.5,
  salience_weight REAL NOT NULL DEFAULT 0.6,
  source TEXT NOT NULL DEFAULT 'relationship',
  task_id INTEGER,
  payload_json TEXT NOT NULL DEFAULT '{}',
  confidence_score REAL,
  last_verified_ts INTEGER,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_steward_memories_session_type_ts
  ON steward_memories(session_key, memory_type, created_ts);

CREATE INDEX IF NOT EXISTS idx_steward_memories_task_id
  ON steward_memories(task_id);
