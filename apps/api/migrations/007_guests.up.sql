-- Guest CRM: encrypted contact data, preferences, consent, notes, merge history, and search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE guests
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN phone_hash text CHECK (phone_hash IS NULL OR phone_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN preferred_language text CHECK (preferred_language IS NULL OR char_length(preferred_language) BETWEEN 2 AND 16),
  ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(preferences) = 'object'),
  ADD COLUMN marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN marketing_opt_in_at timestamptz,
  ADD COLUMN analytics_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN merged_into_guest_id uuid,
  ADD CONSTRAINT guest_merge_target FOREIGN KEY (merged_into_guest_id, property_id, organization_id)
    REFERENCES guests(id, property_id, organization_id) ON DELETE RESTRICT;

CREATE INDEX guests_email_lookup_idx ON guests(organization_id, property_id, lower(email));
CREATE INDEX guests_phone_hash_idx ON guests(organization_id, property_id, phone_hash);
CREATE INDEX guests_name_trgm_idx ON guests USING gin (display_name gin_trgm_ops);

CREATE TABLE guest_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  guest_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('preference', 'internal', 'alert')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (guest_id, property_id, organization_id) REFERENCES guests(id, property_id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (created_by, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX guest_notes_guest_idx ON guest_notes(organization_id, property_id, guest_id, created_at DESC);

CREATE TABLE guest_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  source_guest_id uuid NOT NULL,
  target_guest_id uuid NOT NULL,
  source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot) = 'object'),
  merged_by uuid,
  merged_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_guest_id <> target_guest_id),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (source_guest_id, property_id, organization_id) REFERENCES guests(id, property_id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (target_guest_id, property_id, organization_id) REFERENCES guests(id, property_id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (merged_by, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX guest_merges_tenant_idx ON guest_merges(organization_id, property_id, merged_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['guest_notes', 'guest_merges']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON %I USING (organization_id = active_organization_id() AND property_id = active_property_id()) WITH CHECK (organization_id = active_organization_id() AND property_id = active_property_id())', table_name);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON guest_notes, guest_merges TO keyora_app;

ALTER TABLE audit_events DROP CONSTRAINT audit_events_category_check;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_category_check
  CHECK (category IN ('authentication', 'permission', 'reservation', 'room', 'payment', 'export', 'operations', 'guest'));
