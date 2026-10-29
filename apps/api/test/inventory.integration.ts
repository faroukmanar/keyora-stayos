import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
const password = 'Local-Test-Only!2026';

async function main() {
  await migrate('down', { all: true, connectionString });
  await migrate('up', { all: true, connectionString });
  await seed(connectionString);
  const previousPassword = process.env.KEYORA_MOCK_PASSWORD;
  process.env.KEYORA_MOCK_PASSWORD = password;
  await seedAuthUsers(connectionString);
  if (previousPassword === undefined) delete process.env.KEYORA_MOCK_PASSWORD; else process.env.KEYORA_MOCK_PASSWORD = previousPassword;

  const pool = new pg.Pool({ connectionString, max: 8 });
  const config = loadConfig({ KEYORA_PROFILE: 'test', DATABASE_MODE: 'required', DATABASE_URL: connectionString, AUTH_RATE_LIMIT_MAX: '100' });
  const auth = await AuthService.create({ repository: new PgAuthRepository(pool), accessTokenSecret: config.accessTokenSecret, mfaKey: config.mfaEncryptionKey });
  const app = await buildApp(config, { auth, pool });

  const login = async (email: string) => {
    const response = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email, password, propertyId, clientType: 'native', deviceName: 'Inventory integration' } });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().accessToken as string;
  };
  const owner = await login('owner@demo.keyora.test');
  const housekeeping = await login('housekeeping@demo.keyora.test');
  const headers = (token: string, key = randomUUID()) => ({ authorization: `Bearer ${token}`, 'idempotency-key': key });
  const url = (suffix = '') => `/v1/properties/${propertyId}${suffix}`;

  try {
    const initial = await app.inject({ method: 'GET', url: url('/rooms'), headers: { authorization: `Bearer ${owner}` } });
    assert.equal(initial.statusCode, 200, initial.body);
    assert.equal(initial.json().data.length, 1);

    const amenity = await app.inject({ method: 'POST', url: url('/amenities'), headers: headers(owner), payload: { code: 'sea-view', name: 'Sea view' } });
    assert.equal(amenity.statusCode, 201, amenity.body);
    const roomType = await app.inject({ method: 'POST', url: url('/room-types'), headers: headers(owner), payload: { name: 'Deluxe Suite', capacity: 4 } });
    assert.equal(roomType.statusCode, 201, roomType.body);

    const createKey = randomUUID();
    const createPayload = { roomTypeId: roomType.json().id, name: 'Suite 202', status: 'available', amenityIds: [amenity.json().id] };
    const created = await app.inject({ method: 'POST', url: url('/rooms'), headers: headers(owner, createKey), payload: createPayload });
    assert.equal(created.statusCode, 201, created.body);
    const room = created.json();
    assert.equal(room.name, 'Suite 202');
    assert.deepEqual(room.amenities, ['sea-view']);

    const replay = await app.inject({ method: 'POST', url: url('/rooms'), headers: headers(owner, createKey), payload: createPayload });
    assert.equal(replay.statusCode, 201);
    assert.equal(replay.json().id, room.id, 'idempotent replay must return the original room');
    const mismatch = await app.inject({ method: 'POST', url: url('/rooms'), headers: headers(owner, createKey), payload: { ...createPayload, name: 'Different' } });
    assert.equal(mismatch.statusCode, 409);
    assert.equal(mismatch.json().error.code, 'IDEMPOTENCY_MISMATCH');

    const updated = await app.inject({ method: 'PATCH', url: url(`/rooms/${room.id}`), headers: headers(owner), payload: { version: room.version, name: 'Suite 202B', status: 'cleaning' } });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(updated.json().version, room.version + 1);
    const stale = await app.inject({ method: 'PATCH', url: url(`/rooms/${room.id}`), headers: headers(owner), payload: { version: room.version, name: 'Stale write' } });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().error.code, 'STALE_VERSION');

    const ordered = await app.inject({ method: 'POST', url: url('/rooms/reorder'), headers: headers(owner), payload: { roomIds: [room.id, '10000000-0000-4000-8000-000000000005'] } });
    assert.equal(ordered.statusCode, 204, ordered.body);
    const afterOrder = await app.inject({ method: 'GET', url: url('/rooms'), headers: { authorization: `Bearer ${owner}` } });
    assert.equal(afterOrder.json().data[0].id, room.id);

    const deniedBulk = await app.inject({ method: 'PATCH', url: url('/rooms/bulk'), headers: headers(housekeeping), payload: { roomIds: [room.id], patch: { status: 'available' } } });
    assert.equal(deniedBulk.statusCode, 403);
    const bulk = await app.inject({ method: 'PATCH', url: url('/rooms/bulk'), headers: headers(owner), payload: { roomIds: [room.id], patch: { status: 'available' } } });
    assert.equal(bulk.statusCode, 204, bulk.body);

    const badMedia = await app.inject({ method: 'POST', url: url(`/rooms/${room.id}/media`), headers: headers(owner), payload: { kind: 'image', objectKey: 'properties/1/evil.svg', mimeType: 'image/svg+xml', sizeBytes: 100, checksumSha256: 'a'.repeat(64), altText: 'bad', metadataStripped: true } });
    assert.equal(badMedia.statusCode, 422);
    assert.equal(badMedia.json().error.code, 'MEDIA_TYPE_REJECTED');
    const validMedia = await app.inject({ method: 'POST', url: url(`/rooms/${room.id}/media`), headers: headers(owner), payload: { kind: 'image', objectKey: 'properties/1/room-202.webp', mimeType: 'image/webp', sizeBytes: 182_000, checksumSha256: 'b'.repeat(64), altText: 'Suite 202 with sea view', metadataStripped: true } });
    assert.equal(validMedia.statusCode, 201, validMedia.body);
    assert.match(validMedia.json().url, /^\/v1\/media\/.+\&sig=/);
    const signed = await app.inject({ method: 'GET', url: validMedia.json().url });
    assert.equal(signed.statusCode, 200, signed.body);
    assert.equal(signed.json().signed, true);
    const tampered = await app.inject({ method: 'GET', url: validMedia.json().url.replace(/sig=.*/, `sig=${'A'.repeat(43)}`) });
    assert.equal(tampered.statusCode, 403);

    const block = await app.inject({ method: 'POST', url: url('/maintenance-blocks'), headers: headers(owner), payload: { roomId: room.id, reason: 'Air conditioning repair', startsAt: '2026-11-01T08:00:00+01:00', endsAt: '2026-11-02T18:00:00+01:00' } });
    assert.equal(block.statusCode, 201, block.body);
    const blockedRoom = await app.inject({ method: 'GET', url: url(`/rooms/${room.id}`), headers: { authorization: `Bearer ${owner}` } });
    assert.equal(blockedRoom.json().status, 'maintenance');
    const duplicateBlock = await app.inject({ method: 'POST', url: url('/maintenance-blocks'), headers: headers(owner), payload: { roomId: room.id, reason: 'Second active block', startsAt: '2026-11-03T08:00:00+01:00', endsAt: '2026-11-04T18:00:00+01:00' } });
    assert.equal(duplicateBlock.statusCode, 409);
    const released = await app.inject({ method: 'POST', url: url(`/maintenance-blocks/${block.json().id}/release`), headers: headers(owner) });
    assert.equal(released.statusCode, 200, released.body);
    const available = await app.inject({ method: 'GET', url: url(`/rooms/${room.id}`), headers: { authorization: `Bearer ${owner}` } });
    assert.equal(available.json().status, 'available');

    const crossTenant = await app.inject({ method: 'GET', url: `/v1/properties/${randomUUID()}/rooms`, headers: { authorization: `Bearer ${owner}` } });
    assert.equal(crossTenant.statusCode, 403);

    const policies = await app.inject({ method: 'PUT', url: url('/policies'), headers: headers(owner), payload: { checkInTime: '15:00', checkOutTime: '11:00', cancellationPolicy: { freeUntilHours: 48, penaltyPercent: 100 }, houseRules: ['No smoking'] } });
    assert.equal(policies.statusCode, 200, policies.body);
    const managerPolicies = await app.inject({ method: 'PUT', url: url('/policies'), headers: headers(await login('manager@demo.keyora.test')), payload: { checkInTime: '15:00', checkOutTime: '11:00', cancellationPolicy: {}, houseRules: [] } });
    assert.equal(managerPolicies.statusCode, 403, 'property policy changes remain owner-only');

    const archived = await app.inject({ method: 'DELETE', url: url(`/rooms/${room.id}`), headers: headers(owner) });
    assert.equal(archived.statusCode, 204, archived.body);
    const afterArchive = await app.inject({ method: 'GET', url: url('/rooms'), headers: { authorization: `Bearer ${owner}` } });
    assert.equal(afterArchive.json().data.some((item: { id: string }) => item.id === room.id), false);

    console.log('Inventory integration passed: CRUD, idempotency, optimistic versions, bulk/reorder permissions, media signing, maintenance blocking, and tenant isolation.');
  } finally {
    await app.close();
    await pool.end();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
