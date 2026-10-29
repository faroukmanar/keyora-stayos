import assert from 'node:assert/strict';
import { buildApp } from '../src/app';
import type { AuthService } from '../src/auth/auth-service';
import { loadConfig } from '../src/config';

async function main() {
  const config = loadConfig({ KEYORA_PROFILE: 'test', RATE_LIMIT_MAX: '10' });
  const app = await buildApp(config);
  app.post('/v1/security-limit-probe', async () => ({ ok: true }));
  try {
    const health = await app.inject({ method: 'GET', url: '/v1/health', headers: { origin: config.corsOrigins[0] } });
    assert.equal(health.statusCode, 200);
    assert.equal(health.headers['access-control-allow-origin'], config.corsOrigins[0]);
    assert.equal(health.headers['x-content-type-options'], 'nosniff');
    assert.equal(health.headers['x-frame-options'], 'SAMEORIGIN');
    assert.match(String(health.headers['content-security-policy']), /default-src 'self'/);
    assert.equal(health.headers['cache-control'], 'no-store');

    const csrf = await app.inject({ method: 'DELETE', url: '/v1/auth/sessions/10000000-0000-4000-8000-000000000001', headers: { cookie: '__Host-keyora_access=stolen', origin: config.corsOrigins[0], 'sec-fetch-site': 'cross-site' } });
    assert.equal(csrf.statusCode, 403);
    assert.equal(csrf.json().error.code, 'CSRF_REJECTED');

    const oversized = await app.inject({ method: 'POST', url: '/v1/unknown', payload: { attack: 'x'.repeat(1_100_000) } });
    assert.equal(oversized.statusCode, 413);
    assert.equal(oversized.body.includes('xxxxxxxx'), false);

    let limited;
    for (let count = 0; count < 11; count += 1) limited = await app.inject({ method: 'POST', url: '/v1/security-limit-probe', payload: {} });
    assert.equal(limited?.statusCode, 429);
    assert.equal(limited?.json().error.code, 'RATE_LIMITED');
    assert.ok(Number(limited?.headers['retry-after']) > 0);

    const poisonedRequestId = await app.inject({ method: 'GET', url: '/v1/health', headers: { 'x-request-id': 'not-a-uuid\r\nset-cookie: stolen=true' } });
    assert.equal(poisonedRequestId.statusCode, 200);
    assert.notEqual(poisonedRequestId.headers['x-request-id'], 'not-a-uuid\r\nset-cookie: stolen=true');

    console.log('Security integration passed: headers, CORS, CSRF, body limit, global rate limit, and correlation sanitization.');
  } finally {
    await app.close();
  }

  const authConfig = loadConfig({ KEYORA_PROFILE: 'test', AUTH_RATE_LIMIT_MAX: '3' });
  const fakeAuth = { login: async () => { throw Object.assign(new Error('Invalid credentials.'), { statusCode: 401, code: 'INVALID_CREDENTIALS' }); } } as unknown as AuthService;
  const authApp = await buildApp(authConfig, { auth: fakeAuth });
  try {
    const payload = { email: 'attacker@example.test', password: 'wrong', propertyId: '10000000-0000-4000-8000-000000000002', clientType: 'native', deviceName: 'Attack probe' };
    const webWithoutOrigin = await authApp.inject({ method: 'POST', url: '/v1/auth/login', payload: { ...payload, email: 'other@example.test', clientType: 'web' } });
    assert.equal(webWithoutOrigin.statusCode, 403);
    assert.equal(webWithoutOrigin.json().error.code, 'CSRF_REJECTED');
    for (let count = 0; count < 2; count += 1) assert.equal((await authApp.inject({ method: 'POST', url: '/v1/auth/login', payload })).statusCode, 401);
    const limitedLogin = await authApp.inject({ method: 'POST', url: '/v1/auth/login', payload });
    assert.equal(limitedLogin.statusCode, 429);
    assert.equal(limitedLogin.json().error.code, 'RATE_LIMITED');
  } finally {
    await authApp.close();
  }
  console.log('Authentication abuse controls passed: web-origin enforcement and tight shared login rate limit.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
