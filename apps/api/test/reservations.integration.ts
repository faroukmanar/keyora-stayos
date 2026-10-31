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
const seedRoom = '10000000-0000-4000-8000-000000000005';
const seedRoomType = '10000000-0000-4000-8000-000000000004';
const seedGuest = '10000000-0000-4000-8000-000000000006';
const password = 'Local-Test-Only!2026';

async function main() {
  await migrate('down', { all: true, connectionString });
  await migrate('up', { all: true, connectionString });
  await seed(connectionString);
  const previousPassword = process.env.KEYORA_MOCK_PASSWORD;
  process.env.KEYORA_MOCK_PASSWORD = password;
  await seedAuthUsers(connectionString);
  if (previousPassword === undefined) delete process.env.KEYORA_MOCK_PASSWORD; else process.env.KEYORA_MOCK_PASSWORD = previousPassword;

  const pool = new pg.Pool({ connectionString, max: 12 });
  const config = loadConfig({ KEYORA_PROFILE: 'test', DATABASE_MODE: 'required', DATABASE_URL: connectionString, AUTH_RATE_LIMIT_MAX: '100' });
  const auth = await AuthService.create({ repository: new PgAuthRepository(pool), accessTokenSecret: config.accessTokenSecret, mfaKey: config.mfaEncryptionKey });
  const app = await buildApp(config, { auth, pool });

  const login = async (email: string) => {
    const response = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email, password, propertyId, clientType: 'native', deviceName: 'Reservation integration' } });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().accessToken as string;
  };
  const owner = await login('owner@demo.keyora.test');
  const frontDesk = await login('frontdesk@demo.keyora.test');
  const headers = (token: string, key = randomUUID()) => ({ authorization: `Bearer ${token}`, 'idempotency-key': key });
  const url = (path: string) => `/v1/properties/${propertyId}${path}`;

  const quote = async (roomId: string, checkIn: string, checkOut: string, discountCode?: string) => app.inject({
    method: 'POST', url: url('/quotes'), headers: headers(frontDesk),
    payload: { roomId, checkIn, checkOut, adults: 2, children: 0, ...(discountCode ? { discountCode } : {}) },
  });

  try {
    const roomType = await app.inject({ method: 'POST', url: url('/room-types'), headers: headers(owner), payload: { name: 'Garden Room', capacity: 3 } });
    assert.equal(roomType.statusCode, 201, roomType.body);
    const secondRoom = await app.inject({ method: 'POST', url: url('/rooms'), headers: headers(owner), payload: { roomTypeId: roomType.json().id, name: 'Garden 7', status: 'available' } });
    assert.equal(secondRoom.statusCode, 201, secondRoom.body);

    const plan = await app.inject({ method: 'POST', url: url('/rate-plans'), headers: headers(owner), payload: { roomTypeId: seedRoomType, name: 'Flexible', amountMinor: 150_000, currency: 'MAD', minStay: 1 } });
    assert.equal(plan.statusCode, 201, plan.body);
    const planId = plan.json().id;
    const secondPlan = await app.inject({ method: 'POST', url: url('/rate-plans'), headers: headers(owner), payload: { roomTypeId: roomType.json().id, name: 'Garden Flexible', amountMinor: 90_000, currency: 'MAD', minStay: 1 } });
    assert.equal(secondPlan.statusCode, 201, secondPlan.body);

    const tax = await app.inject({ method: 'POST', url: url('/taxes-fees'), headers: headers(owner), payload: { name: 'Tourism tax', kind: 'tax', calculation: 'percent', basisPoints: 1000, appliesPer: 'stay' } });
    assert.equal(tax.statusCode, 201, tax.body);
    const fee = await app.inject({ method: 'POST', url: url('/taxes-fees'), headers: headers(owner), payload: { name: 'Cleaning fee', kind: 'fee', calculation: 'fixed', amountMinor: 2_000, appliesPer: 'stay' } });
    assert.equal(fee.statusCode, 201, fee.body);
    const discount = await app.inject({ method: 'POST', url: url('/discounts'), headers: headers(owner), payload: { code: 'EARLY10', percentBasisPoints: 1000, startsOn: '2026-01-01', endsOn: '2027-12-31', minNights: 2 } });
    assert.equal(discount.statusCode, 201, discount.body);

    const priced = await quote(seedRoom, '2026-11-10', '2026-11-12', 'EARLY10');
    assert.equal(priced.statusCode, 201, priced.body);
    assert.equal(priced.json().total.amountMinor, 302_000, 'two nights, 10% tax, fixed fee, and 10% discount');
    assert.equal(priced.json().breakdown.subtotalMinor, 300_000);
    const quoteId = priced.json().id;

    const createKey = randomUUID();
    const createPayload = { roomId: seedRoom, guestId: seedGuest, checkIn: '2026-11-10', checkOut: '2026-11-12', adults: 2, children: 0, quoteId };
    const created = await app.inject({ method: 'POST', url: url('/reservations'), headers: headers(frontDesk, createKey), payload: createPayload });
    assert.equal(created.statusCode, 201, created.body);
    const reservation = created.json();
    assert.equal(reservation.total.amountMinor, 302_000);
    assert.equal(reservation.guest.displayName, 'Synthetic Guest');
    const replay = await app.inject({ method: 'POST', url: url('/reservations'), headers: headers(frontDesk, createKey), payload: createPayload });
    assert.equal(replay.statusCode, 201);
    assert.equal(replay.json().id, reservation.id);

    const mismatched = await app.inject({ method: 'POST', url: url('/reservations'), headers: headers(frontDesk), payload: { ...createPayload, checkIn: '2026-11-11', quoteId: randomUUID() } });
    assert.equal(mismatched.statusCode, 422);

    const firstQuote = await quote(secondRoom.json().id, '2026-12-01', '2026-12-03');
    const secondQuote = await quote(secondRoom.json().id, '2026-12-01', '2026-12-03');
    assert.equal(firstQuote.statusCode, 201, firstQuote.body);
    assert.equal(secondQuote.statusCode, 201, secondQuote.body);
    const concurrent = await Promise.all([
      app.inject({ method: 'POST', url: url('/reservations'), headers: headers(frontDesk), payload: { roomId: secondRoom.json().id, guestId: seedGuest, checkIn: '2026-12-01', checkOut: '2026-12-03', adults: 2, children: 0, quoteId: firstQuote.json().id } }),
      app.inject({ method: 'POST', url: url('/reservations'), headers: headers(frontDesk), payload: { roomId: secondRoom.json().id, guestId: seedGuest, checkIn: '2026-12-01', checkOut: '2026-12-03', adults: 2, children: 0, quoteId: secondQuote.json().id } }),
    ]);
    const statuses = concurrent.map((response) => response.statusCode).sort();
    assert.deepEqual(statuses, [201, 409], `concurrent bookings must accept exactly one: ${concurrent.map((response) => response.body).join(' | ')}`);
    const conflictResponse = concurrent.find((response) => response.statusCode === 409)!;
    assert.equal(conflictResponse.json().error.code, 'BOOKING_CONFLICT');

    const checkedIn = await app.inject({ method: 'POST', url: url(`/reservations/${reservation.id}/transitions`), headers: headers(frontDesk), payload: { version: reservation.version, target: 'checked-in' } });
    assert.equal(checkedIn.statusCode, 200, checkedIn.body);
    assert.equal(checkedIn.json().status, 'checked-in');
    const occupiedRoom = await app.inject({ method: 'GET', url: url(`/rooms/${seedRoom}`), headers: { authorization: `Bearer ${owner}` } });
    assert.equal(occupiedRoom.json().status, 'occupied');

    const checkedOut = await app.inject({ method: 'POST', url: url(`/reservations/${reservation.id}/transitions`), headers: headers(frontDesk), payload: { version: checkedIn.json().version, target: 'checked-out' } });
    assert.equal(checkedOut.statusCode, 200, checkedOut.body);
    const cleaningRoom = await app.inject({ method: 'GET', url: url(`/rooms/${seedRoom}`), headers: { authorization: `Bearer ${owner}` } });
    assert.equal(cleaningRoom.json().status, 'cleaning');
    const tasks = await pool.query('SELECT count(*)::int AS count FROM housekeeping_tasks WHERE reservation_id=$1', [reservation.id]);
    assert.equal(tasks.rows[0].count, 1, 'checkout creates exactly one room-turn task');
    const repeat = await app.inject({ method: 'POST', url: url(`/reservations/${reservation.id}/transitions`), headers: headers(frontDesk), payload: { version: checkedOut.json().version, target: 'cancelled' } });
    assert.equal(repeat.statusCode, 409);

    const cancelQuote = await quote(secondRoom.json().id, '2026-12-05', '2026-12-06');
    assert.equal(cancelQuote.statusCode, 201, cancelQuote.body);
    const toCancel = await app.inject({ method: 'POST', url: url('/reservations'), headers: headers(frontDesk), payload: { roomId: secondRoom.json().id, guestId: seedGuest, checkIn: '2026-12-05', checkOut: '2026-12-06', adults: 2, children: 0, quoteId: cancelQuote.json().id } });
    assert.equal(toCancel.statusCode, 201, toCancel.body);
    const cancelled = await app.inject({ method: 'POST', url: url(`/reservations/${toCancel.json().id}/transitions`), headers: headers(frontDesk), payload: { version: 1, target: 'cancelled' } });
    assert.equal(cancelled.statusCode, 200, cancelled.body);
    assert.equal((await app.inject({ method: 'GET', url: url(`/rooms/${secondRoom.json().id}`), headers: { authorization: `Bearer ${owner}` } })).json().status, 'available');

    const modifyQuote = await quote(secondRoom.json().id, '2026-12-10', '2026-12-11');
    const toModify = await app.inject({ method: 'POST', url: url('/reservations'), headers: headers(frontDesk), payload: { roomId: secondRoom.json().id, guestId: seedGuest, checkIn: '2026-12-10', checkOut: '2026-12-11', adults: 2, children: 0, quoteId: modifyQuote.json().id } });
    assert.equal(toModify.statusCode, 201, toModify.body);
    const newQuote = await quote(secondRoom.json().id, '2026-12-10', '2026-12-13');
    const changed = await app.inject({ method: 'POST', url: url(`/reservations/${toModify.json().id}/change-stay`), headers: headers(frontDesk), payload: { version: 1, checkIn: '2026-12-10', checkOut: '2026-12-13', adults: 2, children: 0, quoteId: newQuote.json().id } });
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal(changed.json().version, 2);
    const reassigned = await app.inject({ method: 'POST', url: url(`/reservations/${changed.json().id}/reassign`), headers: headers(frontDesk), payload: { version: 2, roomId: seedRoom } });
    assert.equal(reassigned.statusCode, 200, reassigned.body);
    assert.equal(reassigned.json().roomId, seedRoom);

    const stopSell = await app.inject({ method: 'PUT', url: url(`/rate-plans/${planId}/calendar`), headers: headers(owner), payload: { entries: [{ stayDate: '2026-12-20', amountMinor: 150_000, stopSell: true }] } });
    assert.equal(stopSell.statusCode, 204, stopSell.body);
    const soldOut = await quote(seedRoom, '2026-12-20', '2026-12-21');
    assert.equal(soldOut.statusCode, 409);
    assert.equal(soldOut.json().error.code, 'SOLD_OUT');
    const minStay = await app.inject({ method: 'PUT', url: url(`/rate-plans/${planId}/calendar`), headers: headers(owner), payload: { entries: [{ stayDate: '2026-12-22', amountMinor: 150_000, minStay: 3 }] } });
    assert.equal(minStay.statusCode, 204, minStay.body);
    const tooShort = await quote(seedRoom, '2026-12-22', '2026-12-23');
    assert.equal(tooShort.statusCode, 409);
    assert.equal(tooShort.json().error.code, 'MIN_STAY');

    const tamperedQuote = await quote(secondRoom.json().id, '2026-12-25', '2026-12-26');
    await pool.query('UPDATE quotes SET total_minor=1 WHERE id=$1', [tamperedQuote.json().id]);
    const tampered = await app.inject({ method: 'POST', url: url('/reservations'), headers: headers(frontDesk), payload: { roomId: secondRoom.json().id, guestId: seedGuest, checkIn: '2026-12-25', checkOut: '2026-12-26', adults: 2, children: 0, quoteId: tamperedQuote.json().id } });
    assert.equal(tampered.statusCode, 422, tampered.body);
    assert.equal(tampered.json().error.code, 'QUOTE_TAMPERED');

    const audit = await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE category='reservation' AND action LIKE 'reservation.%'");
    assert.ok(audit.rows[0].count >= 4, 'reservation mutations are audit logged');

    console.log('Reservation integration passed: signed quotes, golden pricing, idempotent create, concurrent double-booking rejection, lifecycle, room-turn idempotency, change/reassign, stop-sell/min-stay, tamper detection, and audit.');
  } finally {
    await app.close();
    await pool.end();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
