DROP TABLE guest_merges;
DROP TABLE guest_notes;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM audit_events WHERE category = 'guest') THEN
    ALTER TABLE audit_events DROP CONSTRAINT audit_events_category_check;
    ALTER TABLE audit_events ADD CONSTRAINT audit_events_category_check
      CHECK (category IN ('authentication', 'permission', 'reservation', 'room', 'payment', 'export', 'operations'));
  END IF;
END $$;

DROP INDEX IF EXISTS guests_name_trgm_idx;
DROP INDEX IF EXISTS guests_phone_hash_idx;
DROP INDEX IF EXISTS guests_email_lookup_idx;

ALTER TABLE guests
  DROP CONSTRAINT IF EXISTS guest_merge_target,
  DROP COLUMN IF EXISTS merged_into_guest_id,
  DROP COLUMN IF EXISTS analytics_opt_in,
  DROP COLUMN IF EXISTS marketing_opt_in_at,
  DROP COLUMN IF EXISTS marketing_opt_in,
  DROP COLUMN IF EXISTS preferences,
  DROP COLUMN IF EXISTS preferred_language,
  DROP COLUMN IF EXISTS phone_hash,
  DROP COLUMN IF EXISTS version;
