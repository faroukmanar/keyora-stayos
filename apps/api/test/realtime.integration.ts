import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { buildApp } from '../src/app';
import { AuthService } from '../src/auth/auth-service';
import { PgAuthRepository } from '../src/auth/pg-auth-repository';
import { loadConfig } from '../src/config';
import { migrate } from '../src/database/migrate';
import { seed } from '../src/database/seed';
import { seedAuthUsers } from '../src/database/seed-auth-users';

const connectionString = process.env.MIGRATION_DATABASE_URL ?? 'postgresql://keyora_owner:keyora-owner-local-only@127.0.0.1:5432/keyora_test';
const propertyId = '10000000-0000-4000-8000-000000000002';
const seedRoomId = '10000000-0000-4000-8000-000000000005';
const password = 'Local-Test-Only!2026';

type Frame = { event: string; id?: string; data: string };

/** Minimal SSE reader over fetch so the test exercises the real HTTP stream. */
async function openStream(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const response = await fetch(url, { headers, signal: controller.signal });
  const frames: Frame[] = [];
  let buffer = '';
  let ended = false;
  const pump = (async () => {
    if (!response.body) return;
    const decoder = new TextDecoder();
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true });
        let index: number;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          if (raw.startsWith(':')) continue;
          const frame: Frame = { event: 'message', data: '' };
          for (const line of raw.split('\n')) {
            const [key, ...rest] = line.split(': ');
            if (key === 'event') frame.event = rest.join(': ');
            else if (key === 'id') frame.id = rest.join(': ');
            else if (key === 'data') frame.data = rest.join(': ');
          }
          frames.push(frame);
        }
      }
    } catch { /* aborted */ }
    ended = true;
  })();
  const waitFor = async (predicate: (frames: Frame[]) => boolean, label: string, timeoutMs = 5_000) => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate(frames)) {
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}; frames=${JSON.stringify(frames)}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  return { response, frames, waitFor, isEnded: () => ended, close: async () => { controller.abort(); await pump; } };
}

async function main() {
  await migrate('down', { all: true, connectionString });
  await migrate('up', { all: true, connectionString });
  await seed(connectionString);
  const previousPassword = process.env.KEYORA_MOCK_PASSWORD;
  process.env.KEYORA_MOCK_PASSWORD = password;
  await seedAuthUsers(connectionString);
  if (previousPassword === undefined) delete process.env.KEYORA_MOCK_PASSWORD; else process.env.KEYORA_MOCK_PASSWORD = previousPassword;

  const pool = new pg.Pool({ connectionString, max: 8 });
  const webOrigin = 'http://localhost:19137';
  const config = loadConfig({ KEYORA_PROFILE: 'test', DATABASE_MODE: 'required', DATABASE_URL: connectionString, AUTH_RATE_LIMIT_MAX: '100', CORS_ORIGINS: webOrigin });
  const auth = await AuthService.create({ repository: new PgAuthRepository(pool), accessTokenSecret: config.accessTokenSecret, mfaKey: config.mfaEncryptionKey });
  const app = await buildApp(config, { auth, pool, realtimeSessionRecheckMs: 200 });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const streams: Awaited<ReturnType<typeof openStream>>[] = [];

  const login = async (email: string) => {
    const response = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email, password, propertyId, clientType: 'native', deviceName: 'Realtime integration' } });
    assert.equal(response.statusCode, 200, response.body);
    return response.json() as { accessToken: string; refreshToken: string; user: { id: string } };
  };

  try {
    const owner = await login('owner@demo.keyora.test');
    const housekeeping = await login('housekeeping@demo.keyora.test');
    const eventsUrl = `${base}/v1/properties/${propertyId}/events`;

    const anonymous = await fetch(eventsUrl);
    assert.equal(anonymous.status, 401);
    const otherProperty = await fetch(`${base}/v1/properties/${randomUUID()}/events`, { headers: { authorization: `Bearer ${owner.accessToken}` } });
    assert.equal(otherProperty.status, 403);

    const baseline = await pool.query('SELECT COALESCE(max(sequence),0)::bigint AS sequence FROM domain_events');
    const stream = await openStream(`${eventsUrl}?cursor=${baseline.rows[0].sequence}`, { authorization: `Bearer ${housekeeping.accessToken}` });
    streams.push(stream);
    assert.equal(stream.response.status, 200);
    assert.match(stream.response.headers.get('content-type') ?? '', /text\/event-stream/);

    // Browsers reject the stream without CORS headers, even though hijack() skips Fastify's reply pipeline.
    const browserStream = await openStream(`${eventsUrl}?cursor=${baseline.rows[0].sequence}`, { authorization: `Bearer ${owner.accessToken}`, origin: webOrigin });
    streams.push(browserStream);
    assert.equal(browserStream.response.headers.get('access-control-allow-origin'), webOrigin);
    assert.equal(browserStream.response.headers.get('access-control-allow-credentials'), 'true');

    const created = await app.inject({ method: 'POST', url: `/v1/properties/${propertyId}/housekeeping/tasks`, headers: { authorization: `Bearer ${owner.accessToken}`, 'idempotency-key': randomUUID() }, payload: { roomId: seedRoomId } });
    assert.equal(created.statusCode, 201, created.body);
    await stream.waitFor((frames) => frames.some((frame) => frame.event === 'domain' && JSON.parse(frame.data).entityId === created.json().id), 'task created event');
    const frame = stream.frames.find((item) => item.event === 'domain' && JSON.parse(item.data).entityId === created.json().id)!;
    const payload = JSON.parse(frame.data);
    assert.equal(payload.type, 'housekeeping.task.created');
    assert.equal(payload.actorId, owner.user.id, 'realtime frames attribute the change to the acting user');
    assert.ok(payload.occurredAt);
    assert.equal(frame.id, String(payload.sequence));
    assert.equal(Object.keys(payload).sort().join(','), 'actorId,entityId,entityType,occurredAt,sequence,type,version', 'frames expose metadata only');

    const resumed = await openStream(eventsUrl, { authorization: `Bearer ${housekeeping.accessToken}`, 'last-event-id': String(payload.sequence - 1) });
    streams.push(resumed);
    await resumed.waitFor((frames) => frames.some((item) => item.id === String(payload.sequence)), 'resume from Last-Event-ID');
    assert.equal(resumed.frames.some((item) => Number(item.id) < payload.sequence), false, 'resume does not replay older events');

    const logout = await app.inject({ method: 'POST', url: '/v1/auth/logout', payload: { refreshToken: housekeeping.refreshToken } });
    assert.equal(logout.statusCode, 204, logout.body);
    await stream.waitFor((frames) => frames.some((item) => item.event === 'session-expired'), 'session-expired after logout');
    await stream.waitFor(() => stream.isEnded(), 'stream closed after logout');

    const afterLogout = await fetch(eventsUrl, { headers: { authorization: `Bearer ${housekeeping.accessToken}` } });
    assert.equal(afterLogout.status, 401, 'revoked sessions cannot reopen the stream');
    await afterLogout.body?.cancel();

    console.log('Realtime integration passed: auth and tenant gating, actor-attributed metadata-only frames, Last-Event-ID resume, and revoked-session stream termination.');
  } finally {
    for (const stream of streams) await stream.close();
    await app.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
