-- Revenue calendar, taxes/fees, discounts, cancellation policies, and signed quotes.
CREATE TABLE cancellation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  free_until_hours smallint NOT NULL DEFAULT 48 CHECK (free_until_hours BETWEEN 0 AND 8760),
  penalty_basis_points integer NOT NULL DEFAULT 10000 CHECK (penalty_basis_points BETWEEN 0 AND 10000),
  no_show_basis_points integer NOT NULL DEFAULT 10000 CHECK (no_show_basis_points BETWEEN 0 AND 10000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, name),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT
);

ALTER TABLE rate_plans
  ADD COLUMN min_stay smallint NOT NULL DEFAULT 1 CHECK (min_stay BETWEEN 1 AND 365),
  ADD COLUMN max_stay smallint CHECK (max_stay IS NULL OR max_stay BETWEEN 1 AND 365),
  ADD COLUMN closed_to_arrival boolean NOT NULL DEFAULT false,
  ADD COLUMN closed_to_departure boolean NOT NULL DEFAULT false,
  ADD COLUMN stop_sell boolean NOT NULL DEFAULT false,
  ADD COLUMN cancellation_policy_id uuid,
  ADD CONSTRAINT rate_plan_stay_window CHECK (max_stay IS NULL OR max_stay >= min_stay),
  ADD CONSTRAINT rate_plan_cancellation FOREIGN KEY (cancellation_policy_id, property_id, organization_id) REFERENCES cancellation_policies(id, property_id, organization_id) ON DELETE RESTRICT;
CREATE INDEX rate_plans_room_type_idx ON rate_plans(organization_id, property_id, room_type_id, active);

CREATE TABLE rate_plan_calendar (
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  rate_plan_id uuid NOT NULL,
  stay_date date NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  min_stay smallint CHECK (min_stay IS NULL OR min_stay BETWEEN 1 AND 365),
  max_stay smallint CHECK (max_stay IS NULL OR max_stay BETWEEN 1 AND 365),
  closed_to_arrival boolean NOT NULL DEFAULT false,
  closed_to_departure boolean NOT NULL DEFAULT false,
  stop_sell boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rate_plan_id, stay_date),
  FOREIGN KEY (rate_plan_id, property_id, organization_id) REFERENCES rate_plans(id, property_id, organization_id) ON DELETE CASCADE
);
CREATE INDEX rate_calendar_tenant_idx ON rate_plan_calendar(organization_id, property_id, stay_date);

CREATE TABLE taxes_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK (kind IN ('tax', 'fee')),
  calculation text NOT NULL CHECK (calculation IN ('percent', 'fixed')),
  basis_points integer CHECK (basis_points BETWEEN 0 AND 10000),
  amount_minor bigint CHECK (amount_minor >= 0),
  applies_per text NOT NULL DEFAULT 'stay' CHECK (applies_per IN ('stay', 'night')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((calculation = 'percent' AND basis_points IS NOT NULL AND amount_minor IS NULL) OR (calculation = 'fixed' AND amount_minor IS NOT NULL AND basis_points IS NULL)),
  UNIQUE (property_id, name),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9-]{3,32}$'),
  percent_basis_points integer NOT NULL CHECK (percent_basis_points BETWEEN 1 AND 10000),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  min_nights smallint NOT NULL DEFAULT 1 CHECK (min_nights BETWEEN 1 AND 365),
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemptions integer NOT NULL DEFAULT 0 CHECK (redemptions >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  UNIQUE (property_id, code),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  room_id uuid NOT NULL,
  rate_plan_id uuid NOT NULL,
  check_in date NOT NULL,
  check_out date NOT NULL,
  adults smallint NOT NULL CHECK (adults BETWEEN 1 AND 50),
  children smallint NOT NULL DEFAULT 0 CHECK (children BETWEEN 0 AND 50),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  breakdown jsonb NOT NULL CHECK (jsonb_typeof(breakdown) = 'object'),
  signature char(64) NOT NULL CHECK (signature ~ '^[a-f0-9]{64}$'),
  discount_code text,
  expires_at timestamptz NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out > check_in),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (room_id, property_id, organization_id) REFERENCES rooms(id, property_id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (rate_plan_id, property_id, organization_id) REFERENCES rate_plans(id, property_id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX quotes_expiry_idx ON quotes(expires_at);

ALTER TABLE reservations
  ADD COLUMN quote_id uuid,
  ADD COLUMN rate_plan_id uuid,
  ADD CONSTRAINT reservation_quote FOREIGN KEY (quote_id, property_id, organization_id) REFERENCES quotes(id, property_id, organization_id) ON DELETE RESTRICT,
  ADD CONSTRAINT reservation_rate_plan FOREIGN KEY (rate_plan_id, property_id, organization_id) REFERENCES rate_plans(id, property_id, organization_id) ON DELETE RESTRICT;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['cancellation_policies','rate_plan_calendar','taxes_fees','discount_codes','quotes']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON %I USING (organization_id = active_organization_id() AND property_id = active_property_id()) WITH CHECK (organization_id = active_organization_id() AND property_id = active_property_id())', table_name);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON cancellation_policies, rate_plan_calendar, taxes_fees, discount_codes, quotes TO keyora_app;
CREATE INDEX taxes_tenant_idx ON taxes_fees(organization_id, property_id, active);
CREATE INDEX discounts_tenant_idx ON discount_codes(organization_id, property_id, code, active);
