import assert from 'node:assert/strict';
import pg from 'pg';
import { buildApp } from '../src/app';
import { AuthService } from '../src/auth/auth-service';
import { assertPermission, hasPermission, permissions, type Permission } from '../src/auth/permissions';
import { PgAuthRepository } from '../src/auth/pg-auth-repository';
import { totp } from '../src/auth/mfa';
import { loadConfig } from '../src/config';
import { migrate } from '../src/database/migrate';
import { seed } from '../src/database/seed';
import { seedAuthUsers } from '../src/database/seed-auth-users';

const connectionString = process.env.MIGRATION_DATABASE_URL ?? 'postgresql://keyora_owner:keyora-owner-local-only@127.0.0.1:5432/keyora_test';
const propertyId = '10000000-0000-4000-8000-000000000002';
const originalPassword = 'Local-Test-Only!2026';
const replacementPassword = 'Replaced-Test-Only!2026';

async function main() {
  await migrate('down', { all: true, connectionString });
  await migrate('up', { all: true, connectionString });
  await seed(connectionString);
  const previousPassword = process.env.KEYORA_MOCK_PASSWORD;
  process.env.KEYORA_MOCK_PASSWORD = originalPassword;
  await seedAuthUsers(connectionString);
  if (previousPassword === undefined) delete process.env.KEYORA_MOCK_PASSWORD; else process.env.KEYORA_MOCK_PASSWORD = previousPassword;

  const pool = new pg.Pool({ connectionString, max: 5 });
  const delivered: Array<{ email: string; token: string }> = [];
  const config = loadConfig({ KEYORA_PROFILE: 'test', DATABASE_MODE: 'required', DATABASE_URL: connectionString });
  const auth = await AuthService.create({ repository: new PgAuthRepository(pool), accessTokenSecret: config.accessTokenSecret, mfaKey: config.mfaEncryptionKey, deliverPasswordReset: async ({ email, token }) => { delivered.push({ email, token }); } });
  const app = await buildApp(config, { auth });
  const login = (email: string, password = originalPassword, extra: Record<string, unknown> = {}) => app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email, password, propertyId, clientType: 'native', deviceName: 'Integration device', ...extra } });

  try {
    for (const permission of permissions) assert.equal(hasPermission('owner', permission), true, `owner missing ${permission}`);
    const housekeepingAllowed: Permission[] = ['room:read', 'housekeeping:read', 'housekeeping:write'];
    for (const permission of permissions) assert.equal(hasPermission('housekeeping', permission), housekeepingAllowed.includes(permission), `housekeeping matrix mismatch for ${permission}`);
    assert.equal(hasPermission('front-desk', 'payment:refund'), false);
    assert.equal(hasPermission('manager', 'property:manage'), false);
    assert.doesNotThrow(() => assertPermission('front-desk', 'reservation:check-in'));
    assert.throws(() => assertPermission('housekeeping', 'guest:export'), (error: unknown) => Boolean(error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 403));

    const first = await login('owner@demo.keyora.test');
    assert.equal(first.statusCode, 200, first.body);
    const firstBody = first.json();
    assert.ok(firstBody.accessToken && firstBody.refreshToken);
    assert.equal('password' in firstBody, false);
    const sessions = await app.inject({ method: 'GET', url: '/v1/auth/sessions', headers: { authorization: `Bearer ${firstBody.accessToken}` } });
    assert.equal(sessions.statusCode, 200, sessions.body);
    assert.equal(sessions.json().length, 1);

    const rotated = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { clientType: 'native', refreshToken: firstBody.refreshToken } });
    assert.equal(rotated.statusCode, 200, rotated.body);
    assert.notEqual(rotated.json().refreshToken, firstBody.refreshToken);
    const reuse = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { clientType: 'native', refreshToken: firstBody.refreshToken } });
    assert.equal(reuse.statusCode, 401);
    const familyRevoked = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { clientType: 'native', refreshToken: rotated.json().refreshToken } });
    assert.equal(familyRevoked.statusCode, 401, familyRevoked.body);

    const web = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'owner@demo.keyora.test', password: originalPassword, propertyId, clientType: 'web', deviceName: 'Browser test' } });
    assert.equal(web.statusCode, 200, web.body);
    assert.equal('accessToken' in web.json(), false);
    const cookies = web.headers['set-cookie'];
    assert.ok(cookies && String(cookies).includes('HttpOnly') && String(cookies).includes('SameSite=Strict'));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await login('manager@demo.keyora.test', 'Wrong-Password!');
      assert.equal(failed.statusCode, 401);
    }
    const locked = await login('manager@demo.keyora.test');
    assert.equal(locked.statusCode, 401, 'account must remain locked with the correct password');

    const resetRequest = await app.inject({ method: 'POST', url: '/v1/auth/password-reset/request', payload: { email: 'owner@demo.keyora.test', propertyId } });
    assert.equal(resetRequest.statusCode, 202);
    assert.equal(resetRequest.body.includes('token'), false);
    assert.equal(delivered.length, 1);
    const reset = await app.inject({ method: 'POST', url: '/v1/auth/password-reset/confirm', payload: { token: delivered[0].token, newPassword: replacementPassword } });
    assert.equal(reset.statusCode, 204, reset.body);
    assert.equal((await login('owner@demo.keyora.test')).statusCode, 401);
    const afterReset = await login('owner@demo.keyora.test', replacementPassword);
    assert.equal(afterReset.statusCode, 200, afterReset.body);

    const resetActor = afterReset.json();
    const mfaSetup = await app.inject({ method: 'POST', url: '/v1/auth/mfa/setup', headers: { authorization: `Bearer ${resetActor.accessToken}` } });
    assert.equal(mfaSetup.statusCode, 200, mfaSetup.body);
    const secret = mfaSetup.json().secret;
    const mfaConfirm = await app.inject({ method: 'POST', url: '/v1/auth/mfa/confirm', headers: { authorization: `Bearer ${resetActor.accessToken}` }, payload: { code: totp(secret) } });
    assert.equal(mfaConfirm.statusCode, 204, mfaConfirm.body);
    const preMfaSession = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { clientType: 'native', refreshToken: resetActor.refreshToken } });
    assert.equal(preMfaSession.statusCode, 401, 'MFA changes must revoke pre-MFA sessions');
    assert.equal((await login('owner@demo.keyora.test', replacementPassword)).statusCode, 401, 'MFA-enabled login must require a code');
    const withMfa = await login('owner@demo.keyora.test', replacementPassword, { mfaCode: totp(secret) });
    assert.equal(withMfa.statusCode, 200, withMfa.body);

    const logout = await app.inject({ method: 'POST', url: '/v1/auth/logout', payload: { clientType: 'native', refreshToken: withMfa.json().refreshToken } });
    assert.equal(logout.statusCode, 204);
    const loggedOut = await app.inject({ method: 'POST', url: '/v1/auth/refresh', payload: { clientType: 'native', refreshToken: withMfa.json().refreshToken } });
    assert.equal(loggedOut.statusCode, 401);

    console.log('Auth integration passed: RBAC, lockout, native/web sessions, rotation/reuse revocation, reset, MFA, and logout.');
  } finally {
    await app.close();
    await pool.end();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
