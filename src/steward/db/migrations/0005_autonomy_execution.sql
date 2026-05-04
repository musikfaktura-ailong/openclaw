ALTER TABLE steward_runtime_state
  ADD COLUMN trigger_source TEXT;

ALTER TABLE steward_host_tasks
  ADD COLUMN claimed_at INTEGER;

ALTER TABLE steward_host_tasks
  ADD COLUMN completed_at INTEGER;

ALTER TABLE steward_host_tasks
  ADD COLUMN failed_at INTEGER;

ALTER TABLE steward_host_tasks
  ADD COLUMN error_json TEXT DEFAULT '';

ALTER TABLE steward_host_tasks
  ADD COLUMN blocked_reason TEXT DEFAULT '';

UPDATE steward_host_tasks
SET status = 'running'
WHERE status = 'claimed';

UPDATE steward_host_tasks
SET status = 'done'
WHERE status = 'completed';

UPDATE steward_host_tasks
SET status = 'blocked'
WHERE status = 'cancelled';
