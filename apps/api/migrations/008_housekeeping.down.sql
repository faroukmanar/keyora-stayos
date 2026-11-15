DROP TABLE housekeeping_inspections;
DROP TABLE housekeeping_checklist_items;

ALTER TABLE maintenance_blocks
  DROP CONSTRAINT IF EXISTS maintenance_housekeeping_task,
  DROP COLUMN IF EXISTS housekeeping_task_id;

ALTER TABLE housekeeping_tasks
  DROP CONSTRAINT IF EXISTS housekeeping_completed_by,
  DROP CONSTRAINT IF EXISTS housekeeping_blocked_by,
  DROP COLUMN IF EXISTS inspection_required,
  DROP COLUMN IF EXISTS blocked_by,
  DROP COLUMN IF EXISTS blocked_at,
  DROP COLUMN IF EXISTS blocked_reason,
  DROP COLUMN IF EXISTS completed_by,
  DROP COLUMN IF EXISTS completed_at,
  DROP COLUMN IF EXISTS started_at;
