CREATE TABLE IF NOT EXISTS steward_runtime_state (
  session_key TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'idle',
  owner_pid INTEGER,
  active_flow_id INTEGER,
  active_task_id INTEGER,
  heartbeat_ts INTEGER,
  last_transition_ts INTEGER,
  wait_reason TEXT DEFAULT '',
  last_error TEXT DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0,
  data_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS steward_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  channel_key TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  last_active_ts INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  data_json TEXT DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_steward_sessions_agent_channel
  ON steward_sessions(agent_id, channel_key);

CREATE TABLE IF NOT EXISTS steward_session_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES steward_sessions(id),
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  content_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS steward_flows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES steward_sessions(id),
  flow_type TEXT NOT NULL,
  status TEXT NOT NULL,
  state_json TEXT DEFAULT '{}',
  owner_pid INTEGER,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  heartbeat_ts INTEGER
);

CREATE TABLE IF NOT EXISTS steward_flow_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flow_id INTEGER NOT NULL REFERENCES steward_flows(id),
  task_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'primary',
  link_status TEXT NOT NULL,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_steward_flow_tasks_flow_id
  ON steward_flow_tasks(flow_id);

CREATE TABLE IF NOT EXISTS steward_blockers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flow_id INTEGER REFERENCES steward_flows(id),
  task_id INTEGER,
  blocker_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  retry_count INTEGER DEFAULT 0,
  data_json TEXT DEFAULT '{}',
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS steward_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  session_id TEXT REFERENCES steward_sessions(id),
  flow_id INTEGER REFERENCES steward_flows(id),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_steward_events_session_ts
  ON steward_events(session_id, ts);

CREATE TABLE IF NOT EXISTS steward_kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
