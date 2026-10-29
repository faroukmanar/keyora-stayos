ALTER TABLE users
  ADD COLUMN password_version integer NOT NULL DEFAULT 1 CHECK (password_version > 0),
  ADD COLUMN failed_auth_attempts smallint NOT NULL DEFAULT 0 CHECK (failed_auth_attempts BETWEEN 0 AND 100),
  ADD COLUMN locked_until timestamptz,
  ADD COLUMN last_login_at timestamptz,
  ADD COLUMN mfa_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN mfa_secret_ciphertext bytea,
  ADD COLUMN mfa_pending_secret_ciphertext bytea,
  ADD CONSTRAINT mfa_secret_when_enabled CHECK (NOT mfa_enabled OR mfa_secret_ciphertext IS NOT NULL);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'front-desk', 'housekeeping')),
  refresh_token_hash bytea NOT NULL UNIQUE,
  client_type text NOT NULL CHECK (client_type IN ('native', 'web')),
  device_name text NOT NULL CHECK (char_length(device_name) BETWEEN 1 AND 160),
  ip_hash bytea,
  user_agent_hash bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  replaced_by_session_id uuid REFERENCES auth_sessions(id) ON DELETE SET NULL,
  CHECK (expires_at > created_at),
  UNIQUE (id, property_id, organization_id),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE RESTRICT
);

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CHECK (expires_at > created_at),
  FOREIGN KEY (property_id, organization_id) REFERENCES properties(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id, organization_id) REFERENCES users(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX auth_sessions_user_active_idx ON auth_sessions(organization_id, property_id, user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX auth_sessions_family_idx ON auth_sessions(family_id);
CREATE INDEX password_reset_user_idx ON password_reset_tokens(organization_id, user_id, expires_at) WHERE used_at IS NULL;

ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON auth_sessions USING (organization_id = active_organization_id() AND property_id = active_property_id()) WITH CHECK (organization_id = active_organization_id() AND property_id = active_property_id());
CREATE POLICY tenant_scope ON password_reset_tokens USING (organization_id = active_organization_id() AND property_id = active_property_id()) WITH CHECK (organization_id = active_organization_id() AND property_id = active_property_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON auth_sessions, password_reset_tokens TO keyora_app;

CREATE FUNCTION auth_lookup_user(p_email text, p_property_id uuid)
RETURNS TABLE (
  id uuid, organization_id uuid, property_id uuid, email text, display_name text, password_hash text,
  password_version integer, failed_auth_attempts smallint, locked_until timestamptz, status text, role text,
  mfa_enabled boolean, mfa_secret_ciphertext bytea
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT u.id, u.organization_id, r.property_id, u.email, u.display_name, u.password_hash,
    u.password_version, u.failed_auth_attempts, u.locked_until, u.status, r.role,
    u.mfa_enabled, u.mfa_secret_ciphertext
  FROM public.users u
  JOIN public.user_property_roles r ON r.user_id = u.id AND r.organization_id = u.organization_id
  WHERE u.email = lower(p_email) AND r.property_id = p_property_id
  ORDER BY CASE r.role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 WHEN 'front-desk' THEN 3 ELSE 4 END
  LIMIT 1
$$;

CREATE FUNCTION auth_resolve_session(p_refresh_hash bytea)
RETURNS TABLE (organization_id uuid, property_id uuid)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT s.organization_id, s.property_id FROM public.auth_sessions s WHERE s.refresh_token_hash = p_refresh_hash LIMIT 1
$$;

CREATE FUNCTION auth_resolve_reset(p_token_hash bytea)
RETURNS TABLE (organization_id uuid, property_id uuid)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '' AS $$
  SELECT t.organization_id, t.property_id FROM public.password_reset_tokens t WHERE t.token_hash = p_token_hash LIMIT 1
$$;

REVOKE ALL ON FUNCTION auth_lookup_user(text, uuid), auth_resolve_session(bytea), auth_resolve_reset(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_lookup_user(text, uuid), auth_resolve_session(bytea), auth_resolve_reset(bytea) TO keyora_app;
