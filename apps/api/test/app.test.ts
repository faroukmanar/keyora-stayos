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
});

describe('strict environment profiles', () => {
  it('rejects wildcard CORS and insecure production configuration', () => {
    assert.throws(() => loadConfig({ CORS_ORIGINS: '*' }), /wildcards/);
    assert.throws(() => loadConfig({ KEYORA_PROFILE: 'production', DATABASE_TLS: 'false', DATABASE_URL: 'postgresql://db.example/keyora', CORS_ORIGINS: 'https://app.example' }), /DATABASE_TLS/);
    assert.throws(() => loadConfig({ KEYORA_PROFILE: 'production', DATABASE_TLS: 'true', DATABASE_URL: 'postgresql://localhost/keyora', CORS_ORIGINS: 'https://app.example' }), /local/);
    assert.throws(() => loadConfig({ KEYORA_PROFILE: 'production', DATABASE_TLS: 'true', DATABASE_URL: 'postgresql://db.example/keyora', CORS_ORIGINS: 'http://app.example' }), /HTTPS/);
  });
});
