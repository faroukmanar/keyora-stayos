CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  CREATE ROLE keyora_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  timezone text NOT NULL CHECK (char_length(timezone) BETWEEN 1 AND 80),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  email text NOT NULL CHECK (email = lower(email) AND char_length(email) <= 254),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 160),
  password_hash text NOT NULL CHECK (char_length(password_hash) >= 20),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'locked', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email),
  UNIQUE (id, organization_id)
);

CREATE TABLE user_property_roles (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'front-desk', 'housekeeping')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, user_id, role),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE CASCADE
);

CREATE TABLE room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  capacity smallint NOT NULL CHECK (capacity BETWEEN 1 AND 50),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, property_id, organization_id),
  UNIQUE (property_id, name),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  status text NOT NULL CHECK (status IN ('available', 'occupied', 'cleaning', 'maintenance')),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  archived_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, property_id, organization_id),
  UNIQUE (property_id, name),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (room_type_id, property_id, organization_id) REFERENCES room_types(id, property_id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (room_type_id, property_id, organization_id) REFERENCES room_types(id, property_id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 160),
  email text CHECK (email IS NULL OR (email = lower(email) AND char_length(email) <= 254)),
  phone_encrypted bytea,
  vip boolean NOT NULL DEFAULT false,
  anonymized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  room_id uuid NOT NULL,
  guest_id uuid NOT NULL,
  check_in date NOT NULL,
  check_out date NOT NULL,
  stay daterange GENERATED ALWAYS AS (daterange(check_in, check_out, '[)')) STORED,
  adults smallint NOT NULL CHECK (adults BETWEEN 1 AND 50),
  children smallint NOT NULL DEFAULT 0 CHECK (children BETWEEN 0 AND 50),
  status text NOT NULL CHECK (status IN ('confirmed', 'checked-in', 'checked-out', 'cancelled', 'no-show')),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  price_snapshot jsonb NOT NULL CHECK (jsonb_typeof(price_snapshot) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out > check_in),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (room_id, property_id, organization_id) REFERENCES rooms(id, property_id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (guest_id, property_id, organization_id) REFERENCES guests(id, property_id, organization_id) ON DELETE RESTRICT,
  EXCLUDE USING gist (room_id WITH =, stay WITH &&) WHERE (status IN ('confirmed', 'checked-in'))
);

CREATE TABLE housekeeping_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  room_id uuid NOT NULL,
  reservation_id uuid,
  assignee_user_id uuid,
  status text NOT NULL CHECK (status IN ('ready', 'in-progress', 'blocked', 'inspection', 'done')),
  priority text NOT NULL CHECK (priority IN ('normal', 'rush')),
  due_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (room_id, property_id, organization_id) REFERENCES rooms(id, property_id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (reservation_id, property_id, organization_id) REFERENCES reservations(id, property_id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (assignee_user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX housekeeping_one_turn_per_reservation ON housekeeping_tasks(reservation_id) WHERE reservation_id IS NOT NULL;

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  provider text NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 40),
  provider_reference text NOT NULL CHECK (char_length(provider_reference) BETWEEN 1 AND 200),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL CHECK (status IN ('pending', 'authorized', 'captured', 'failed', 'refunded', 'partially-refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_reference),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (reservation_id, property_id, organization_id) REFERENCES reservations(id, property_id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  actor_user_id uuid,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 120),
  entity_type text NOT NULL CHECK (char_length(entity_type) BETWEEN 1 AND 80),
  entity_id uuid,
  request_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT
);

CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only';
END $$;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

CREATE FUNCTION active_organization_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.organization_id', true), '')::uuid
$$;
CREATE FUNCTION active_property_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.property_id', true), '')::uuid
$$;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_organizations ON organizations USING (id = active_organization_id()) WITH CHECK (id = active_organization_id());

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['user_property_roles', 'room_types', 'rooms', 'rate_plans', 'guests', 'reservations', 'housekeeping_tasks', 'payments', 'audit_events']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON %I USING (organization_id = active_organization_id() AND property_id = active_property_id()) WITH CHECK (organization_id = active_organization_id() AND property_id = active_property_id())', table_name);
  END LOOP;
  ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_properties ON properties USING (organization_id = active_organization_id() AND id = active_property_id()) WITH CHECK (organization_id = active_organization_id() AND id = active_property_id());
  ALTER TABLE users ENABLE ROW LEVEL SECURITY;
  CREATE POLICY tenant_users ON users USING (organization_id = active_organization_id()) WITH CHECK (organization_id = active_organization_id());
END $$;

GRANT USAGE ON SCHEMA public TO keyora_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, properties, users, user_property_roles, room_types, rooms, rate_plans, guests, reservations, housekeeping_tasks, payments TO keyora_app;
GRANT SELECT, INSERT ON audit_events TO keyora_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO keyora_app;
GRANT EXECUTE ON FUNCTION active_organization_id(), active_property_id() TO keyora_app;

CREATE INDEX properties_tenant_idx ON properties(organization_id, id);
CREATE INDEX users_tenant_idx ON users(organization_id, id);
CREATE INDEX rooms_tenant_idx ON rooms(organization_id, property_id, id);
CREATE INDEX reservations_tenant_stay_idx ON reservations(organization_id, property_id, check_in, check_out);
CREATE INDEX guests_tenant_name_idx ON guests(organization_id, property_id, display_name);
CREATE INDEX housekeeping_tenant_status_idx ON housekeeping_tasks(organization_id, property_id, status, due_at);
CREATE INDEX audit_tenant_time_idx ON audit_events(organization_id, property_id, occurred_at DESC);
