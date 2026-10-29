import type { Pool, PoolClient } from 'pg';
import type { Actor, AuthRepository, AuthUser, NewSession, SessionRecord } from './types';

type Row = Record<string, unknown>;
const invalidCredentials = () => Object.assign(new Error('Invalid or expired session.'), { statusCode: 401, code: 'INVALID_SESSION' });

function userFrom(row: Row): AuthUser {
  return {
    id: String(row.id), organizationId: String(row.organization_id), propertyId: String(row.property_id), email: String(row.email), displayName: String(row.display_name),
    passwordHash: String(row.password_hash), passwordVersion: Number(row.password_version), failedAuthAttempts: Number(row.failed_auth_attempts), lockedUntil: row.locked_until ? new Date(String(row.locked_until)) : null,
    status: String(row.status), role: row.role as AuthUser['role'], mfaEnabled: Boolean(row.mfa_enabled), mfaSecretCiphertext: row.mfa_secret_ciphertext as Buffer | null,
  };
}

function sessionFrom(row: Row): SessionRecord {
  return {
    id: String(row.id), familyId: String(row.family_id), userId: String(row.user_id), organizationId: String(row.organization_id), propertyId: String(row.property_id),
    role: row.role as SessionRecord['role'], clientType: row.client_type as SessionRecord['clientType'], deviceName: String(row.device_name), expiresAt: new Date(String(row.expires_at)),
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)) : null, passwordVersion: Number(row.password_version), displayName: String(row.display_name),
  };
}

export class PgAuthRepository implements AuthRepository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE keyora_app');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  private async scope(client: PoolClient, organizationId: string, propertyId: string) {
    await client.query("SELECT set_config('app.organization_id', $1, true), set_config('app.property_id', $2, true)", [organizationId, propertyId]);
  }

  async findLoginUser(email: string, propertyId: string) {
    return this.transaction(async (client) => {
      const result = await client.query('SELECT * FROM auth_lookup_user($1, $2)', [email.toLowerCase(), propertyId]);
      return result.rowCount ? userFrom(result.rows[0]) : null;
    });
  }

  async getUserForActor(actor: Actor) {
    return this.transaction(async (client) => {
      await this.scope(client, actor.organizationId, actor.propertyId);
      const result = await client.query(`SELECT u.*, r.property_id, r.role FROM users u JOIN user_property_roles r ON r.user_id=u.id AND r.organization_id=u.organization_id
        WHERE u.id=$1 AND r.property_id=$2 AND r.role=$3`, [actor.id, actor.propertyId, actor.role]);
      return result.rowCount ? userFrom(result.rows[0]) : null;
    });
  }

  async recordLoginFailure(user: AuthUser) {
    return this.transaction(async (client) => {
      await this.scope(client, user.organizationId, user.propertyId);
      const result = await client.query<{ locked_until: Date | null }>(`UPDATE users SET failed_auth_attempts = failed_auth_attempts + 1,
        locked_until = CASE WHEN failed_auth_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
        updated_at = now() WHERE id = $1 RETURNING locked_until`, [user.id]);
      return { lockedUntil: result.rows[0]?.locked_until ?? null };
    });
  }

  async recordLoginSuccess(user: AuthUser) {
    await this.transaction(async (client) => {
      await this.scope(client, user.organizationId, user.propertyId);
      await client.query('UPDATE users SET failed_auth_attempts = 0, locked_until = NULL, last_login_at = now(), updated_at = now() WHERE id = $1', [user.id]);
    });
  }

  async createSession(input: NewSession) {
    return this.transaction(async (client) => {
      await this.scope(client, input.user.organizationId, input.user.propertyId);
      const result = await client.query(`INSERT INTO auth_sessions(family_id, organization_id, property_id, user_id, role, refresh_token_hash, client_type, device_name, ip_hash, user_agent_hash, expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING auth_sessions.*, $12::integer AS password_version, $13::text AS display_name`, [input.familyId, input.user.organizationId, input.user.propertyId, input.user.id, input.user.role, input.refreshTokenHash, input.clientType, input.deviceName, input.ipHash, input.userAgentHash, input.expiresAt, input.user.passwordVersion, input.user.displayName]);
      return sessionFrom(result.rows[0]);
    });
  }

  async rotateSession(refreshHash: Buffer, nextHash: Buffer, expiresAt: Date, ipHash: Buffer | null, userAgentHash: Buffer | null) {
    const rotated = await this.transaction(async (client) => {
      const resolved = await client.query('SELECT * FROM auth_resolve_session($1)', [refreshHash]);
      if (!resolved.rowCount) return null;
      const { organization_id: organizationId, property_id: propertyId } = resolved.rows[0];
      await this.scope(client, organizationId, propertyId);
      const currentResult = await client.query(`SELECT s.*, u.password_version, u.display_name, u.status
        FROM auth_sessions s JOIN users u ON u.id = s.user_id AND u.organization_id = s.organization_id
        WHERE s.refresh_token_hash = $1 FOR UPDATE OF s`, [refreshHash]);
      if (!currentResult.rowCount) return null;
      const current = currentResult.rows[0];
      if (current.revoked_at) {
        await client.query("UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = COALESCE(revoke_reason, 'refresh-reuse') WHERE family_id = $1", [current.family_id]);
        return null;
      }
      if (new Date(current.expires_at) <= new Date() || current.status !== 'active') return null;
      const next = await client.query(`INSERT INTO auth_sessions(family_id, organization_id, property_id, user_id, role, refresh_token_hash, client_type, device_name, ip_hash, user_agent_hash, expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING auth_sessions.*, $12::integer AS password_version, $13::text AS display_name`,
        [current.family_id, current.organization_id, current.property_id, current.user_id, current.role, nextHash, current.client_type, current.device_name, ipHash, userAgentHash, expiresAt, current.password_version, current.display_name]);
      await client.query("UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'rotated', replaced_by_session_id = $2, last_used_at = now() WHERE id = $1", [current.id, next.rows[0].id]);
      return sessionFrom(next.rows[0]);
    });
    if (!rotated) throw invalidCredentials();
    return rotated;
  }

  async revokeSessionByHash(refreshHash: Buffer, reason: string) {
    await this.transaction(async (client) => {
      const resolved = await client.query('SELECT * FROM auth_resolve_session($1)', [refreshHash]);
      if (!resolved.rowCount) return;
      await this.scope(client, resolved.rows[0].organization_id, resolved.rows[0].property_id);
      await client.query('UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = COALESCE(revoke_reason, $2) WHERE refresh_token_hash = $1', [refreshHash, reason]);
    });
  }

  async getActorSession(claims: { sessionId: string; userId: string; organizationId: string; propertyId: string }) {
    return this.transaction(async (client) => {
      await this.scope(client, claims.organizationId, claims.propertyId);
      const result = await client.query(`SELECT s.*, u.password_version, u.display_name FROM auth_sessions s JOIN users u ON u.id=s.user_id AND u.organization_id=s.organization_id
        WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status='active'`, [claims.sessionId, claims.userId]);
      return result.rowCount ? sessionFrom(result.rows[0]) : null;
    });
  }

  async listSessions(actor: Actor) {
    return this.transaction(async (client) => {
      await this.scope(client, actor.organizationId, actor.propertyId);
      const result = await client.query('SELECT id, client_type, device_name, expires_at, revoked_at FROM auth_sessions WHERE user_id=$1 ORDER BY last_used_at DESC LIMIT 50', [actor.id]);
      return result.rows.map((row) => ({ id: String(row.id), clientType: row.client_type, deviceName: String(row.device_name), expiresAt: new Date(row.expires_at), revokedAt: row.revoked_at ? new Date(row.revoked_at) : null }));
    });
  }

  async revokeSession(actor: Actor, sessionId: string) {
    return this.transaction(async (client) => {
      await this.scope(client, actor.organizationId, actor.propertyId);
      const result = await client.query("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()), revoke_reason=COALESCE(revoke_reason,'user-revoked') WHERE id=$1 AND user_id=$2", [sessionId, actor.id]);
      return result.rowCount === 1;
    });
  }

  async createPasswordReset(user: AuthUser, tokenHash: Buffer, expiresAt: Date) {
    await this.transaction(async (client) => {
      await this.scope(client, user.organizationId, user.propertyId);
      await client.query('UPDATE password_reset_tokens SET used_at=COALESCE(used_at,now()) WHERE user_id=$1 AND used_at IS NULL', [user.id]);
      await client.query('INSERT INTO password_reset_tokens(organization_id,property_id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5)', [user.organizationId, user.propertyId, user.id, tokenHash, expiresAt]);
    });
  }

  async consumePasswordReset(tokenHash: Buffer, passwordHash: string) {
    return this.transaction(async (client) => {
      const resolved = await client.query('SELECT * FROM auth_resolve_reset($1)', [tokenHash]);
      if (!resolved.rowCount) return false;
      await this.scope(client, resolved.rows[0].organization_id, resolved.rows[0].property_id);
      const result = await client.query('SELECT * FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() FOR UPDATE', [tokenHash]);
      if (!result.rowCount) return false;
      const token = result.rows[0];
      await client.query('UPDATE users SET password_hash=$2,password_version=password_version+1,failed_auth_attempts=0,locked_until=NULL,updated_at=now() WHERE id=$1', [token.user_id, passwordHash]);
      await client.query("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()),revoke_reason=COALESCE(revoke_reason,'password-reset') WHERE user_id=$1", [token.user_id]);
      await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE id=$1', [token.id]);
      return true;
    });
  }

  async setPendingMfa(actor: Actor, ciphertext: Buffer) { await this.updateMfa(actor, 'UPDATE users SET mfa_pending_secret_ciphertext=$2 WHERE id=$1', [actor.id, ciphertext]); }
  async getPendingMfa(actor: Actor) {
    return this.transaction(async (client) => { await this.scope(client, actor.organizationId, actor.propertyId); const result = await client.query('SELECT mfa_pending_secret_ciphertext FROM users WHERE id=$1', [actor.id]); return result.rows[0]?.mfa_pending_secret_ciphertext ?? null; });
  }
  async enableMfa(actor: Actor) { await this.changeMfaAndRevoke(actor, 'UPDATE users SET mfa_secret_ciphertext=mfa_pending_secret_ciphertext,mfa_pending_secret_ciphertext=NULL,mfa_enabled=true,password_version=password_version+1 WHERE id=$1 AND mfa_pending_secret_ciphertext IS NOT NULL', 'mfa-enabled'); }
  async disableMfa(actor: Actor) { await this.changeMfaAndRevoke(actor, 'UPDATE users SET mfa_secret_ciphertext=NULL,mfa_pending_secret_ciphertext=NULL,mfa_enabled=false,password_version=password_version+1 WHERE id=$1', 'mfa-disabled'); }
  private async updateMfa(actor: Actor, sql: string, params: unknown[]) { await this.transaction(async (client) => { await this.scope(client, actor.organizationId, actor.propertyId); await client.query(sql, params); }); }
  private async changeMfaAndRevoke(actor: Actor, sql: string, reason: string) {
    await this.transaction(async (client) => {
      await this.scope(client, actor.organizationId, actor.propertyId);
      await client.query(sql, [actor.id]);
      await client.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()),revoke_reason=COALESCE(revoke_reason,$2) WHERE user_id=$1', [actor.id, reason]);
    });
  }
}
