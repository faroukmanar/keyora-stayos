DROP FUNCTION IF EXISTS auth_resolve_reset(bytea);
DROP FUNCTION IF EXISTS auth_resolve_session(bytea);
DROP FUNCTION IF EXISTS auth_lookup_user(text, uuid);
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS auth_sessions CASCADE;
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS mfa_secret_when_enabled,
  DROP COLUMN IF EXISTS mfa_pending_secret_ciphertext,
  DROP COLUMN IF EXISTS mfa_secret_ciphertext,
  DROP COLUMN IF EXISTS mfa_enabled,
  DROP COLUMN IF EXISTS last_login_at,
  DROP COLUMN IF EXISTS locked_until,
  DROP COLUMN IF EXISTS failed_auth_attempts,
  DROP COLUMN IF EXISTS password_version;
