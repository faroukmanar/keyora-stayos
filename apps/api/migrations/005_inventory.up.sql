-- Inventory, media, maintenance, idempotency, and domain events.
CREATE TABLE property_policies (
  property_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  check_in_time text NOT NULL DEFAULT '15:00' CHECK (check_in_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  check_out_time text NOT NULL DEFAULT '11:00' CHECK (check_out_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  cancellation_policy jsonb NOT NULL DEFAULT '{"freeUntilHours":48,"penaltyPercent":100}'::jsonb CHECK (jsonb_typeof(cancellation_policy) = 'object'),
  house_rules jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(house_rules) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9-]{1,39}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, code),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE room_amenities (
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  room_id uuid NOT NULL,
  amenity_id uuid NOT NULL,
  PRIMARY KEY (room_id, amenity_id),
  FOREIGN KEY (room_id, property_id, organization_id) REFERENCES rooms(id, property_id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (amenity_id, property_id, organization_id) REFERENCES amenities(id, property_id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE room_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  room_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image', 'floorplan')),
  object_key text NOT NULL CHECK (object_key ~ '^[a-zA-Z0-9/_.-]{8,255}$'),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  checksum_sha256 char(64) NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  alt_text text NOT NULL CHECK (char_length(alt_text) BETWEEN 1 AND 300),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  metadata_stripped boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_key),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (room_id, property_id, organization_id) REFERENCES rooms(id, property_id, organization_id) ON DELETE CASCADE
);
CREATE INDEX room_media_order_idx ON room_media(room_id, sort_order) WHERE archived_at IS NULL;

CREATE TABLE maintenance_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  room_id uuid NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 300),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  CHECK (ends_at > starts_at),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (room_id, property_id, organization_id) REFERENCES rooms(id, property_id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX maintenance_one_active_block ON maintenance_blocks(room_id) WHERE status = 'active';
CREATE INDEX maintenance_window_idx ON maintenance_blocks(organization_id, property_id, room_id, starts_at, ends_at);

CREATE TABLE idempotency_keys (
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  route text NOT NULL CHECK (char_length(route) BETWEEN 1 AND 200),
  idempotency_key uuid NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  status_code integer NOT NULL CHECK (status_code BETWEEN 200 AND 299),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_user_id, route, idempotency_key),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE CASCADE
);

CREATE TABLE domain_events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  type text NOT NULL CHECK (type ~ '^[a-z][a-z0-9_.-]{2,119}$'),
  entity_type text NOT NULL CHECK (char_length(entity_type) BETWEEN 1 AND 80),
  entity_id uuid,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX domain_events_stream_idx ON domain_events(organization_id, property_id, sequence);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['property_policies','amenities','room_amenities','room_media','maintenance_blocks','idempotency_keys','domain_events']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON %I USING (organization_id = active_organization_id() AND property_id = active_property_id()) WITH CHECK (organization_id = active_organization_id() AND property_id = active_property_id())', table_name);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON property_policies, amenities, room_amenities, room_media, maintenance_blocks, idempotency_keys, domain_events TO keyora_app;
GRANT USAGE, SELECT ON SEQUENCE domain_events_sequence_seq TO keyora_app;

CREATE INDEX amenities_tenant_idx ON amenities(organization_id, property_id, code);
CREATE INDEX maintenance_tenant_status_idx ON maintenance_blocks(organization_id, property_id, status, ends_at);
CREATE INDEX idempotency_created_idx ON idempotency_keys(created_at);
