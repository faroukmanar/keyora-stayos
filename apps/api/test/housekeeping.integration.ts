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
const organizationId = '10000000-0000-4000-8000-000000000001';
const seedRoomId = '10000000-0000-4000-8000-000000000005';
const seedRoomTypeId = '10000000-0000-4000-8000-000000000004';
const seedGuestId = '10000000-0000-4000-8000-000000000006';
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
    const response = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email, password, propertyId, clientType: 'native', deviceName: 'Housekeeping integration' } });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().accessToken as string;
  };
  const owner = await login('owner@demo.keyora.test');
  const manager = await login('manager@demo.keyora.test');
  const frontDesk = await login('frontdesk@demo.keyora.test');
  const housekeeping = await login('housekeeping@demo.keyora.test');
  const headers = (token: string, key = randomUUID()) => ({ authorization: `Bearer ${token}`, 'idempotency-key': key });
  const url = (suffix = '') => `/v1/properties/${propertyId}${suffix}`;
  const taskUrl = (taskId: string, suffix = '') => url(`/housekeeping/tasks/${taskId}${suffix}`);

  try {
    const staff = await pool.query("SELECT id, display_name FROM users WHERE email='housekeeping@demo.keyora.test' AND organization_id=$1", [organizationId]);
    const housekeepingUserId = staff.rows[0].id as string;

    const create = await app.inject({ method: 'POST', url: url('/housekeeping/tasks'), headers: headers(owner), payload: { roomId: seedRoomId, priority: 'rush', dueAt: new Date(Date.now() + 3_600_000).toISOString() } });
    assert.equal(create.statusCode, 201, create.body);
    const task = create.json();
    assert.equal(task.status, 'ready');
    assert.equal(task.priority, 'rush');
    assert.equal(task.inspectionRequired, true);
    assert.equal(task.checklist.total, 5);
    assert.equal(task.assignee, null);

    const deniedCreate = await app.inject({ method: 'POST', url: url('/housekeeping/tasks'), headers: headers(frontDesk), payload: { roomId: seedRoomId } });
    assert.equal(deniedCreate.statusCode, 403);

    const assigned = await app.inject({ method: 'PATCH', url: taskUrl(task.id, '/assign'), headers: headers(owner), payload: { version: task.version, assigneeUserId: housekeepingUserId } });
    assert.equal(assigned.statusCode, 200, assigned.body);
    assert.equal(assigned.json().assignee.id, housekeepingUserId);
    assert.equal(assigned.json().assignee.displayName, staff.rows[0].display_name);
    const invalidAssignee = await app.inject({ method: 'PATCH', url: taskUrl(task.id, '/assign'), headers: headers(owner), payload: { version: assigned.json().version, assigneeUserId: randomUUID() } });
    assert.equal(invalidAssignee.statusCode, 422);
    assert.equal(invalidAssignee.json().error.code, 'ASSIGNEE_INVALID');

    const started = await app.inject({ method: 'POST', url: taskUrl(task.id, '/transitions'), headers: headers(housekeeping), payload: { version: assigned.json().version, target: 'in-progress' } });
    assert.equal(started.statusCode, 200, started.body);
    assert.equal(started.json().status, 'in-progress');
    assert.ok(started.json().startedAt);
    const frontDeskTransition = await app.inject({ method: 'POST', url: taskUrl(task.id, '/transitions'), headers: headers(frontDesk), payload: { version: started.json().version, target: 'inspection' } });
    assert.equal(frontDeskTransition.statusCode, 403);

    const premature = await app.inject({ method: 'POST', url: taskUrl(task.id, '/transitions'), headers: headers(housekeeping), payload: { version: started.json().version, target: 'done' } });
    assert.equal(premature.statusCode, 409);
    assert.equal(premature.json().error.code, 'CHECKLIST_INCOMPLETE');

    const detail = await app.inject({ method: 'GET', url: taskUrl(task.id), headers: { authorization: `Bearer ${housekeeping}` } });
    assert.equal(detail.statusCode, 200, detail.body);
    for (const item of detail.json().checklistItems) {
      const toggled = await app.inject({ method: 'PATCH', url: taskUrl(task.id, `/checklist/${item.id}`), headers: headers(housekeeping), payload: { completed: true } });
      assert.equal(toggled.statusCode, 200, toggled.body);
      assert.ok(toggled.json().completedAt);
    }
    const readyForInspection = await app.inject({ method: 'GET', url: taskUrl(task.id), headers: { authorization: `Bearer ${housekeeping}` } });
    assert.equal(readyForInspection.json().checklist.completed, 5);

    const toInspection = await app.inject({ method: 'POST', url: taskUrl(task.id, '/transitions'), headers: headers(housekeeping), payload: { version: readyForInspection.json().version, target: 'inspection' } });
    assert.equal(toInspection.statusCode, 200, toInspection.body);
    assert.equal(toInspection.json().status, 'inspection');

    const deniedInspection = await app.inject({ method: 'POST', url: taskUrl(task.id, '/inspections'), headers: headers(housekeeping), payload: { version: toInspection.json().version, result: 'passed' } });
    assert.equal(deniedInspection.statusCode, 403);
    const passed = await app.inject({ method: 'POST', url: taskUrl(task.id, '/inspections'), headers: headers(manager), payload: { version: toInspection.json().version, result: 'passed', notes: 'Ready for arrival' } });
    assert.equal(passed.statusCode, 200, passed.body);
    assert.equal(passed.json().status, 'done');
    assert.equal(passed.json().inspections[0].result, 'passed');
    assert.ok(passed.json().completedAt);
    const roomAfterDone = await pool.query('SELECT status FROM rooms WHERE id=$1', [seedRoomId]);
    assert.equal(roomAfterDone.rows[0].status, 'available');

    const reopened = await app.inject({ method: 'POST', url: taskUrl(task.id, '/transitions'), headers: headers(housekeeping), payload: { version: passed.json().version, target: 'in-progress' } });
    assert.equal(reopened.statusCode, 200, reopened.body);
    assert.equal(reopened.json().status, 'in-progress');
    assert.equal(reopened.json().completedAt, null);
    const roomAfterReopen = await pool.query('SELECT status FROM rooms WHERE id=$1', [seedRoomId]);
    assert.equal(roomAfterReopen.rows[0].status, 'cleaning');

    const blocked = await app.inject({ method: 'POST', url: taskUrl(task.id, '/transitions'), headers: headers(housekeeping), payload: { version: reopened.json().version, target: 'blocked', reason: 'Waiting for replacement lamp' } });
    assert.equal(blocked.statusCode, 200, blocked.body);
    assert.equal(blocked.json().blockedReason, 'Waiting for replacement lamp');
    const unblocked = await app.inject({ method: 'POST', url: taskUrl(task.id, '/transitions'), headers: headers(housekeeping), payload: { version: blocked.json().version, target: 'in-progress' } });
    assert.equal(unblocked.statusCode, 200, unblocked.body);
    assert.equal(unblocked.json().blockedReason, null);
    const missingReason = await app.inject({ method: 'POST', url: taskUrl(task.id, '/transitions'), headers: headers(housekeeping), payload: { version: unblocked.json().version, target: 'blocked' } });
    assert.equal(missingReason.statusCode, 422);

    const escalated = await app.inject({ method: 'POST', url: taskUrl(task.id, '/escalate'), headers: headers(housekeeping), payload: { version: unblocked.json().version, reason: 'Electrical fault needs a technician' } });
    assert.equal(escalated.statusCode, 200, escalated.body);
    assert.equal(escalated.json().status, 'blocked');
    const roomAfterEscalation = await pool.query('SELECT status FROM rooms WHERE id=$1', [seedRoomId]);
    assert.equal(roomAfterEscalation.rows[0].status, 'maintenance');
    const block = await pool.query('SELECT housekeeping_task_id, status FROM maintenance_blocks WHERE room_id=$1 AND status=\'active\'', [seedRoomId]);
    assert.equal(block.rowCount, 1);
    assert.equal(block.rows[0].housekeeping_task_id, task.id);

    const overdue = await app.inject({ method: 'POST', url: url('/housekeeping/tasks'), headers: headers(owner), payload: { roomId: seedRoomId, priority: 'normal', dueAt: new Date(Date.now() - 60_000).toISOString() } });
    assert.equal(overdue.statusCode, 201, overdue.body);
    const overdueList = await app.inject({ method: 'GET', url: url('/housekeeping/tasks?overdue=true'), headers: { authorization: `Bearer ${frontDesk}` } });
    assert.equal(overdueList.statusCode, 200, overdueList.body);
    assert.equal(overdueList.json().data.some((row: { id: string }) => row.id === overdue.json().id), true);
    const listed = await app.inject({ method: 'GET', url: url('/housekeeping/tasks?priority=rush'), headers: { authorization: `Bearer ${housekeeping}` } });
    assert.equal(listed.statusCode, 200, listed.body);
    assert.equal(listed.json().data[0].id, task.id, 'rush tasks sort first');

    const events = await pool.query("SELECT type, payload FROM domain_events WHERE entity_id=$1 ORDER BY sequence", [task.id]);
    assert.ok(events.rows.some((row) => row.type === 'housekeeping.task.inspection_passed'));
    const doneEvent = events.rows.find((row) => row.type === 'housekeeping.task.inspection_passed');
    assert.equal(doneEvent.payload.actorId, (await pool.query("SELECT id FROM users WHERE email='manager@demo.keyora.test'")).rows[0].id);
    assert.ok(doneEvent.payload.at);

    const room = await app.inject({ method: 'POST', url: url('/rooms'), headers: headers(owner), payload: { roomTypeId: seedRoomTypeId, name: 'Turnover Room 303' } });
    assert.equal(room.statusCode, 201, room.body);
    const plan = await app.inject({ method: 'POST', url: url('/rate-plans'), headers: headers(owner), payload: { roomTypeId: seedRoomTypeId, name: 'Turnover Rate', amountMinor: 50000, currency: 'MAD', minStay: 1 } });
    assert.equal(plan.statusCode, 201, plan.body);
    const quote = await app.inject({ method: 'POST', url: url('/quotes'), headers: headers(owner), payload: { roomId: room.json().id, checkIn: '2027-05-10', checkOut: '2027-05-12', adults: 2, children: 0 } });
    assert.equal(quote.statusCode, 201, quote.body);
    const reservation = await app.inject({ method: 'POST', url: url('/reservations'), headers: headers(owner), payload: { roomId: room.json().id, guestId: seedGuestId, checkIn: '2027-05-10', checkOut: '2027-05-12', adults: 2, children: 0, quoteId: quote.json().id } });
    assert.equal(reservation.statusCode, 201, reservation.body);
    const checkedIn = await app.inject({ method: 'POST', url: url(`/reservations/${reservation.json().id}/transitions`), headers: headers(owner), payload: { version: reservation.json().version, target: 'checked-in' } });
    assert.equal(checkedIn.statusCode, 200, checkedIn.body);
    const checkedOut = await app.inject({ method: 'POST', url: url(`/reservations/${reservation.json().id}/transitions`), headers: headers(owner), payload: { version: checkedIn.json().version, target: 'checked-out' } });
    assert.equal(checkedOut.statusCode, 200, checkedOut.body);
    const turnTasks = await pool.query('SELECT id, status, priority FROM housekeeping_tasks WHERE reservation_id=$1', [reservation.json().id]);
    assert.equal(turnTasks.rowCount, 1, 'checkout must create exactly one room-turn task');
    assert.equal(turnTasks.rows[0].status, 'ready');
    assert.equal(turnTasks.rows[0].priority, 'rush');
    const turnDetail = await app.inject({ method: 'GET', url: taskUrl(turnTasks.rows[0].id), headers: { authorization: `Bearer ${housekeeping}` } });
    assert.equal(turnDetail.statusCode, 200, turnDetail.body);
    assert.equal(turnDetail.json().checklist.total, 5, 'room-turn tasks receive the default checklist');
    const roomCleaning = await pool.query('SELECT status FROM rooms WHERE id=$1', [room.json().id]);
    assert.equal(roomCleaning.rows[0].status, 'cleaning');

    console.log('Housekeeping integration passed: assignment, priority/due windows, checklists, inspection gate, blocker and reopen flows, maintenance escalation, rush ordering, checkout room-turn idempotency, actor-stamped events, and RBAC.');
  } finally {
    await app.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
