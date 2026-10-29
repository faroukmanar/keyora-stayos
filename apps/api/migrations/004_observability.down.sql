DROP INDEX IF EXISTS audit_category_time_idx;ALTER TABLE audit_events DROP COLUMN IF EXISTS trace_id,DROP COLUMN IF EXISTS outcome,DROP COLUMN IF EXISTS category;
