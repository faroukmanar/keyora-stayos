CREATE TABLE notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL, event_type text NOT NULL CHECK (event_type IN ('reservation.confirmed','reservation.changed','arrival.reminder','task.assigned','task.blocked')),
  channel text NOT NULL CHECK (channel IN ('email','push')), locale text NOT NULL CHECK (locale IN ('en','fr','ar')),
  version integer NOT NULL CHECK (version > 0), subject_template text NOT NULL CHECK (char_length(subject_template) BETWEEN 1 AND 200),
  body_template text NOT NULL CHECK (char_length(body_template) BETWEEN 1 AND 4000), variable_names text[] NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(property_id,event_type,channel,locale,version), UNIQUE(id,property_id,organization_id),
  FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX notification_one_active_template ON notification_templates(property_id,event_type,channel,locale) WHERE active;

CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL, recipient_type text NOT NULL CHECK (recipient_type IN ('user','guest')), recipient_id uuid NOT NULL,
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','fr','ar')), email_enabled boolean NOT NULL DEFAULT true, push_enabled boolean NOT NULL DEFAULT true,
  arrival_reminders boolean NOT NULL DEFAULT true, quiet_start time NOT NULL DEFAULT '22:00', quiet_end time NOT NULL DEFAULT '07:00',
  timezone text NOT NULL DEFAULT 'UTC', urgent_bypass boolean NOT NULL DEFAULT true, unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id,recipient_type,recipient_id), UNIQUE(id,property_id,organization_id),
  FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id) ON DELETE RESTRICT
);

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL, event_id uuid NOT NULL, event_type text NOT NULL,
  template_id uuid, recipient_type text NOT NULL CHECK (recipient_type IN ('user','guest')), recipient_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','push')), content_ciphertext bytea,
  status text NOT NULL CHECK (status IN ('queued','deferred','sending','sent','delivered','failed','bounced','suppressed')),
  not_before timestamptz NOT NULL DEFAULT now(), attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  provider_message_id text, last_error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
  UNIQUE(event_id,recipient_type,recipient_id,channel), UNIQUE(provider_message_id), UNIQUE(id,property_id,organization_id),
  FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id) ON DELETE RESTRICT,
  FOREIGN KEY(template_id,property_id,organization_id) REFERENCES notification_templates(id,property_id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX notification_due_idx ON notification_deliveries(status,not_before) WHERE status IN ('queued','deferred');
CREATE INDEX notification_history_idx ON notification_deliveries(organization_id,property_id,recipient_type,recipient_id,created_at DESC);

CREATE TABLE notification_callback_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL, provider text NOT NULL, provider_event_id text NOT NULL, payload_hash bytea NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,provider_event_id),
  FOREIGN KEY(property_id,organization_id) REFERENCES properties(id,organization_id) ON DELETE RESTRICT
);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['notification_templates','notification_preferences','notification_deliveries','notification_callback_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_scope ON %I USING (organization_id=active_organization_id() AND property_id=active_property_id()) WITH CHECK (organization_id=active_organization_id() AND property_id=active_property_id())',table_name);
  END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON notification_templates,notification_preferences,notification_deliveries,notification_callback_events TO keyora_app;
GRANT USAGE,SELECT ON SEQUENCE notification_callback_events_id_seq TO keyora_app;

CREATE FUNCTION notification_resolve_delivery(p_provider_message_id text) RETURNS TABLE(organization_id uuid,property_id uuid)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$ SELECT d.organization_id,d.property_id FROM public.notification_deliveries d WHERE d.provider_message_id=p_provider_message_id LIMIT 1 $$;
CREATE FUNCTION notification_due_tenants() RETURNS TABLE(organization_id uuid,property_id uuid)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path='' AS $$ SELECT DISTINCT d.organization_id,d.property_id FROM public.notification_deliveries d WHERE d.status IN ('queued','deferred') AND d.not_before<=now() LIMIT 1000 $$;
REVOKE ALL ON FUNCTION notification_resolve_delivery(text),notification_due_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notification_resolve_delivery(text),notification_due_tenants() TO keyora_app;
