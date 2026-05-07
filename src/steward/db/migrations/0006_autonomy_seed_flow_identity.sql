ALTER TABLE steward_host_tasks
  ADD COLUMN seed_flow_id INTEGER REFERENCES steward_flows(id);

UPDATE steward_host_tasks
SET seed_flow_id = (
  SELECT f.id
  FROM steward_flows f
  WHERE json_extract(f.state_json, '$.seeded_by') = 'autonomy'
    AND json_extract(f.state_json, '$.host_task_id') = steward_host_tasks.id
  ORDER BY f.id DESC
  LIMIT 1
)
WHERE source = 'autonomy'
  AND seed_flow_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_steward_host_tasks_seed_flow
  ON steward_host_tasks(seed_flow_id);
