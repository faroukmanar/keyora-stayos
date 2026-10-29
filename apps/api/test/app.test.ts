import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

const config = loadConfig({ KEYORA_PROFILE: 'test' });

describe('production API foundation', () => {
  it('serves health with request correlation and security headers', async () => {
    const app = await buildApp(config);
    const response = await app.inject({ method: 'GET', url: '/v1/health', headers: { 'x-request-id': '10000000-0000-4000-8000-000000000001' } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok', version: '1.0.0' });
    assert.equal(response.headers['x-request-id'], '10000000-0000-4000-8000-000000000001');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.match(String(response.headers['content-security-policy']), /default-src 'self'/);
    assert.equal(response.headers['cache-control'], 'no-store');
    await app.close();
  });

  it('reports unavailable dependencies without leaking an exception', async () => {
    const app = await buildApp(config, { ready: async () => { throw new Error('database password must not leak'); } });
    const response = await app.inject({ method: 'GET', url: '/v1/ready' });
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.includes('password'), false);
    assert.deepEqual(response.json(), { status: 'unavailable', version: '1.0.0' });
    await app.close();
  });

  it('returns a safe correlated error for unknown routes', async () => {
    const app = await buildApp(config);
    const response = await app.inject({ method: 'GET', url: '/private/unknown' });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, 'NOT_FOUND');
    assert.equal(response.json().error.message, 'The requested resource was not found.');
    assert.equal(response.json().error.requestId, response.headers['x-request-id']);
    await app.close();
  });

  it('rejects disallowed browser origins', async () => {
    const app = await buildApp(config);
    const response = await app.inject({ method: 'OPTIONS', url: '/v1/health', headers: { origin: 'https://attacker.example', 'access-control-request-method': 'GET' } });
    assert.ok(response.statusCode >= 400);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
    await app.close();
  });

  it('rejects cross-site cookie mutations before route handling', async () => {
    const app = await buildApp(config);
    const response = await app.inject({ method: 'POST', url: '/v1/unknown', headers: { cookie: 'keyora_access=stolen', origin: config.corsOrigins[0], 'sec-fetch-site': 'cross-site' }, payload: {} });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, 'CSRF_REJECTED');
    await app.close();
  });

  it('enforces global abuse limits and returns retry metadata', async () => {
    const app = await buildApp(loadConfig({ KEYORA_PROFILE: 'test', RATE_LIMIT_MAX: '10' }));
    app.post('/v1/security-limit-probe', async () => ({ ok: true }));
    let response;
    for (let attempt = 0; attempt < 11; attempt += 1) response = await app.inject({ method: 'POST', url: '/v1/security-limit-probe', payload: {} });
    assert.equal(response?.statusCode, 429);
    assert.equal(response?.json().error.code, 'RATE_LIMITED');
    assert.ok(Number(response?.headers['retry-after']) >= 1);
    await app.close();
  });

  it('rejects oversized request bodies without echoing content', async () => {
    const app = await buildApp(config);
    const response = await app.inject({ method: 'POST', url: '/v1/unknown', payload: { value: 's'.repeat(1_100_000) } });
    assert.equal(response.statusCode, 413);
    assert.equal(response.body.includes('ssssssss'), false);
    await app.close();
  });
});

describe('strict environment profiles', () => {
  it('rejects wildcard CORS and insecure production configuration', () => {
    assert.throws(() => loadConfig({ CORS_ORIGINS: '*' }), /wildcards/);
    assert.throws(() => loadConfig({ KEYORA_PROFILE: 'production', DATABASE_TLS: 'false', DATABASE_URL: 'postgresql://db.example/keyora', CORS_ORIGINS: 'https://app.example' }), /DATABASE_TLS/);
    assert.throws(() => loadConfig({ KEYORA_PROFILE: 'production', DATABASE_TLS: 'true', DATABASE_URL: 'postgresql://localhost/keyora', CORS_ORIGINS: 'https://app.example' }), /local/);
    assert.throws(() => loadConfig({ KEYORA_PROFILE: 'production', DATABASE_TLS: 'true', DATABASE_URL: 'postgresql://db.example/keyora', CORS_ORIGINS: 'http://app.example' }), /HTTPS/);
    assert.throws(() => loadConfig({ KEYORA_PROFILE: 'staging', DATABASE_MODE: 'required', DATABASE_TLS: 'true', DATABASE_URL: 'postgresql://keyora_owner@db.example/keyora', CORS_ORIGINS: 'https://app.example', ACCESS_TOKEN_SECRET: 'a-secure-staging-secret-that-is-long-enough', MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32).toString('base64') }), /non-owner/);
  });

  it('requires a TLS rate-limit store and trusted proxy in production', () => {
    const production = {
      KEYORA_PROFILE: 'production', DATABASE_TLS: 'true', DATABASE_MODE: 'required', DATABASE_URL: 'postgresql://keyora_app:secret@db.example/keyora', CORS_ORIGINS: 'https://app.example',
      ACCESS_TOKEN_SECRET: 'production-access-secret-with-at-least-32-characters', MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 1).toString('base64'),
      EMAIL_PROVIDER_URL: 'https://email.example/send', EMAIL_PROVIDER_TOKEN: 'production-email-token-value', PASSWORD_RESET_WEB_URL: 'https://app.example/reset',
      NOTIFICATION_MODE: 'http', NOTIFICATION_PROVIDER_URL: 'https://notify.example/send', NOTIFICATION_PROVIDER_TOKEN: 'production-notify-token', NOTIFICATION_WEBHOOK_SECRET: 'production-webhook-secret-at-least-32-chars', NOTIFICATION_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 2).toString('base64'),
      OBSERVABILITY_MODE: 'export', METRICS_TOKEN: 'production-metrics-token-at-least-32-chars', TRACE_EXPORT_URL: 'https://trace.example/v1', TRACE_EXPORT_TOKEN: 'production-trace-token', ERROR_REPORT_URL: 'https://errors.example/v1', ERROR_REPORT_TOKEN: 'production-error-token',
    } as const;
    assert.throws(() => loadConfig({ ...production, TRUST_PROXY: 'true' }), /RATE_LIMIT_REDIS_URL/);
    assert.throws(() => loadConfig({ ...production, TRUST_PROXY: 'true', RATE_LIMIT_REDIS_URL: 'redis:\/\/cache.example:6379' }), /rediss/);
    assert.throws(() => loadConfig({ ...production, TRUST_PROXY: 'false', RATE_LIMIT_REDIS_URL: 'rediss:\/\/cache.example:6379' }), /TRUST_PROXY/);
    assert.equal(loadConfig({ ...production, TRUST_PROXY: 'true', RATE_LIMIT_REDIS_URL: 'rediss:\/\/cache.example:6379' }).profile, 'production');
  });
});
