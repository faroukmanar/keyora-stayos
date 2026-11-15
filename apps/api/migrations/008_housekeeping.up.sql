-- Housekeeping service workflow: assignment, blockers, escalation, checklists, and inspections.
ALTER TABLE housekeeping_tasks
  ADD COLUMN started_at timestamptz,
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN completed_by uuid,
  ADD COLUMN blocked_reason text CHECK (blocked_reason IS NULL OR char_length(blocked_reason) BETWEEN 3 AND 500),
  ADD COLUMN blocked_at timestamptz,
  ADD COLUMN blocked_by uuid,
  ADD COLUMN inspection_required boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT housekeeping_completed_by FOREIGN KEY (completed_by, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT,
  ADD CONSTRAINT housekeeping_blocked_by FOREIGN KEY (blocked_by, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT;

ALTER TABLE maintenance_blocks
  ADD COLUMN housekeeping_task_id uuid,
  ADD CONSTRAINT maintenance_housekeeping_task FOREIGN KEY (housekeeping_task_id, property_id, organization_id)
    REFERENCES housekeeping_tasks(id, property_id, organization_id) ON DELETE RESTRICT;

CREATE TABLE housekeeping_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  task_id uuid NOT NULL,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  required boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 1000),
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (task_id, property_id, organization_id) REFERENCES housekeeping_tasks(id, property_id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (completed_by, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX housekeeping_checklist_task_idx ON housekeeping_checklist_items(organization_id, property_id, task_id, sort_order);

CREATE TABLE housekeeping_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  task_id uuid NOT NULL,
  inspector_user_id uuid,
  result text NOT NULL CHECK (result IN ('passed', 'failed')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (task_id, property_id, organization_id) REFERENCES housekeeping_tasks(id, property_id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (inspector_user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX housekeeping_inspections_task_idx ON housekeeping_inspections(organization_id, property_id, task_id, created_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['housekeeping_checklist_items', 'housekeeping_inspections']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON %I USING (organization_id = active_organization_id() AND property_id = active_property_id()) WITH CHECK (organization_id = active_organization_id() AND property_id = active_property_id())', table_name);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON housekeeping_checklist_items, housekeeping_inspections TO keyora_app;

CREATE INDEX domain_events_entity_idx ON domain_events(organization_id, property_id, entity_type, entity_id, sequence DESC);
