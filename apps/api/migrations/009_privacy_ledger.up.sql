-- Erasure ledger: guest ids whose personal data was erased. Holds no personal data itself, so it can be
-- exported next to every backup and replayed after restoring an older snapshot (issue #27).
CREATE TABLE privacy_erasure_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  guest_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('request', 'retention', 'merge')),
  erased_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX privacy_erasure_ledger_scope_idx ON privacy_erasure_ledger(organization_id, property_id, erased_at);

ALTER TABLE privacy_erasure_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON privacy_erasure_ledger USING (organization_id = active_organization_id() AND property_id = active_property_id()) WITH CHECK (organization_id = active_organization_id() AND property_id = active_property_id());
-- Append-only for the application role.
GRANT SELECT, INSERT ON privacy_erasure_ledger TO keyora_app;

-- Backfill guests anonymized before the ledger existed.
INSERT INTO privacy_erasure_ledger(organization_id, property_id, guest_id, reason, erased_at)
SELECT organization_id, property_id, id, 'request', anonymized_at FROM guests WHERE anonymized_at IS NOT NULL;
