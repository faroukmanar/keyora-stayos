import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { z } from 'zod';
import {
  guestSchema, maintenanceBlockSchema, pageSchema, quoteSchema, reservationSchema, roomSchema,
} from '../../../packages/contracts/src';
import { buildApp } from '../src/app';
import { createDependencies } from '../src/bootstrap';
import { loadConfig } from '../src/config';
import { migrate } from '../src/database/migrate';
import { seed } from '../src/database/seed';
import { seedAuthUsers } from '../src/database/seed-auth-users';

const connectionString = process.env.MIGRATION_DATABASE_URL ?? 'postgresql://keyora_owner:keyora-owner-local-only@127.0.0.1:5432/keyora_test';
const propertyId = '10000000-0000-4000-8000-000000000002';
const seedRoomTypeId = '10000000-0000-4000-8000-000000000004';
const password = 'Local-Test-Only!2026';

/**
 * Every endpoint the native and web clients call is parsed with the shared zod schemas,
 * through the production composition root, so server/client drift fails locally.
 */
async function main() {
  await migrate('down', { all: true, connectionString });
  await migrate('up', { all: true, connectionString });
  await seed(connectionString);
  const previousPassword = process.env.KEYORA_MOCK_PASSWORD;
  process.env.KEYORA_MOCK_PASSWORD = password;
  await seedAuthUsers(connectionString);
  if (previousPassword === undefined) delete process.env.KEYORA_MOCK_PASSWORD; else process.env.KEYORA_MOCK_PASSWORD = previousPassword;

  const config = loadConfig({ KEYORA_PROFILE: 'test', DATABASE_MODE: 'required', DATABASE_URL: connectionString, AUTH_RATE_LIMIT_MAX: '100' });
  const app = await buildApp(config, await createDependencies(config));
  const pool = new pg.Pool({ connectionString, max: 2 });
  try {
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'owner@demo.keyora.test', password, propertyId, clientType: 'native', deviceName: 'Contract conformance' } });
    assert.equal(login.statusCode, 200, login.body);
    const token = login.json().accessToken as string;
    const ownerId = login.json().user.id as string;
    const call = async <T>(schema: z.ZodType<T>, method: 'GET' | 'POST' | 'PATCH', path: string, payload?: unknown, status = method === 'POST' ? 201 : 200): Promise<T> => {
      const response = await app.inject({ method, url: `/v1/properties/${propertyId}${path}`, headers: { authorization: `Bearer ${token}`, ...(method === 'GET' ? {} : { 'idempotency-key': randomUUID() }) }, ...(payload === undefined ? {} : { payload: payload as object }) });
      assert.equal(response.statusCode, status, `${method} ${path}: ${response.body}`);
      const parsed = schema.safeParse(response.json());
      assert.ok(parsed.success, `${method} ${path} drifted from the contract: ${parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3))}`);
      return parsed.data;
    };

    const rooms = await call(pageSchema(roomSchema), 'GET', '/rooms');
    assert.ok(rooms.data.length > 0);
    const room = await call(roomSchema, 'POST', '/rooms', { roomTypeId: seedRoomTypeId, name: `Contract Room ${randomUUID().slice(0, 6)}` });
    await call(roomSchema, 'GET', `/rooms/${room.id}`);
    await call(z.object({ id: z.string() }).passthrough(), 'POST', '/rate-plans', { roomTypeId: seedRoomTypeId, name: `Contract Rate ${randomUUID().slice(0, 6)}`, amountMinor: 90000, currency: 'MAD', minStay: 1 });

    const guests = await call(pageSchema(guestSchema), 'GET', '/guests?limit=20');
    assert.ok(guests.data.length > 0);
    const guest = await call(guestSchema, 'POST', '/guests', { displayName: 'Contract Guest', email: 'contract.guest@example.test', phone: '+212 600 000 111' });
    await call(pageSchema(guestSchema), 'GET', `/guests?q=${encodeURIComponent('Contract')}`);

    const stay = { roomId: room.id, checkIn: '2027-09-01', checkOut: '2027-09-03', adults: 2, children: 0 };
    const quote = await call(quoteSchema, 'POST', '/quotes', stay);
    assert.equal(quote.total.amountMinor, quote.breakdown.totalMinor);
    const reservation = await call(reservationSchema, 'POST', '/reservations', { ...stay, guestId: guest.id, quoteId: quote.id });
    await call(pageSchema(reservationSchema), 'GET', '/reservations?limit=100');
    await call(reservationSchema, 'GET', `/reservations/${reservation.id}`);
    const checkedIn = await call(reservationSchema, 'POST', `/reservations/${reservation.id}/transitions`, { version: reservation.version, target: 'checked-in' }, 200);
    const checkedOut = await call(reservationSchema, 'POST', `/reservations/${reservation.id}/transitions`, { version: checkedIn.version, target: 'checked-out' }, 200);
    assert.equal(checkedOut.status, 'checked-out');
    const events = await pool.query("SELECT payload FROM domain_events WHERE entity_id=$1 AND type='reservation.checked-out'", [reservation.id]);
    assert.equal(events.rows[0].payload.actorId, ownerId, 'reservation events are attributed to the actor');

    const roomAfter = await call(roomSchema, 'GET', `/rooms/${room.id}`);
    const otherRoom = rooms.data.find((item) => item.status === 'available') ?? rooms.data[0];
    const block = await call(maintenanceBlockSchema, 'POST', '/maintenance-blocks', { roomId: otherRoom.id, reason: 'Contract inspection', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString() });
    await call(z.array(maintenanceBlockSchema), 'GET', '/maintenance-blocks');
    await call(maintenanceBlockSchema, 'POST', `/maintenance-blocks/${block.id}/release`, {}, 200);
    assert.equal(roomAfter.status, 'cleaning');

    console.log('Contract conformance passed: rooms, guests, quotes, reservations (create, list, detail, check-in, check-out), and maintenance blocks match the shared v1 schemas.');
  } finally {
    await app.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
