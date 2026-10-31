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
const seedRoomId = '10000000-0000-4000-8000-000000000005';
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
    const response = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email, password, propertyId, clientType: 'native', deviceName: 'Guest integration' } });
    assert.equal(response.statusCode, 200, response.body);
    return response.json().accessToken as string;
  };
  const owner = await login('owner@demo.keyora.test');
  const frontDesk = await login('frontdesk@demo.keyora.test');
  const housekeeping = await login('housekeeping@demo.keyora.test');
  const headers = (token: string, key = randomUUID()) => ({ authorization: `Bearer ${token}`, 'idempotency-key': key });
  const url = (suffix = '') => `/v1/properties/${propertyId}${suffix}`;
  const createGuest = (token: string, payload: Record<string, unknown>) => app.inject({ method: 'POST', url: url('/guests'), headers: headers(token), payload });
  const getGuest = (token: string, id: string) => app.inject({ method: 'GET', url: url(`/guests/${id}`), headers: { authorization: `Bearer ${token}` } });

  try {
    const createKey = randomUUID();
    const payload = {
      displayName: 'Amina El Fassi',
      email: 'amina@example.com',
      phone: '+212 612-345-678',
      preferredLanguage: 'fr-MA',
      preferences: { pillow: 'firm', floor: 'high', dietary: ['vegetarian'], accessibility: [] },
      vip: true,
      marketingOptIn: true,
      analyticsOptIn: false,
    };
    const created = await app.inject({ method: 'POST', url: url('/guests'), headers: headers(owner, createKey), payload });
    assert.equal(created.statusCode, 201, created.body);
    const amina = created.json();
    assert.equal(amina.displayName, 'Amina El Fassi');
    assert.equal(amina.email, 'amina@example.com');
    assert.equal(amina.phone, '+212 612-345-678');
    assert.equal(amina.sensitiveFieldsMasked, false);
    assert.ok(amina.marketingOptInAt, 'consent must be timestamped');

    const replay = await app.inject({ method: 'POST', url: url('/guests'), headers: headers(owner, createKey), payload });
    assert.equal(replay.statusCode, 201);
    assert.equal(replay.json().id, amina.id);

    const file = await app.inject({ method: 'GET', url: url(`/guests/${amina.id}`), headers: { authorization: `Bearer ${owner}` } });
    assert.equal(file.json().email, 'amina@example.com');
    assert.equal(file.json().phone, '+212 612-345-678');
    assert.equal(file.json().staySummary.completedStays, 0);

    const masked = await getGuest(housekeeping, amina.id);
    assert.equal(masked.statusCode, 200, masked.body);
    assert.equal(masked.json().email, 'a***@example.com');
    assert.equal(masked.json().phone, '***5678');
    assert.equal(masked.json().sensitiveFieldsMasked, true);

    const search = await app.inject({ method: 'GET', url: url('/guests?q=amina'), headers: { authorization: `Bearer ${owner}` } });
    assert.equal(search.statusCode, 200, search.body);
    assert.equal(search.json().data.length, 1);
    const maskedSearch = await app.inject({ method: 'GET', url: url('/guests?q=amina'), headers: { authorization: `Bearer ${housekeeping}` } });
    assert.equal(maskedSearch.json().data[0].email, 'a***@example.com');

    const duplicatePayload = { displayName: 'Amina El-Fassi', email: 'second@example.com', phone: '212612345678' };
    const duplicate = await createGuest(owner, duplicatePayload);
    assert.equal(duplicate.statusCode, 201, duplicate.body);
    const duplicateGuest = duplicate.json();
    const byPhone = await app.inject({ method: 'GET', url: url('/guests/duplicates?phone=%2B212612345678&displayName=Amina%20El-Fassi'), headers: { authorization: `Bearer ${owner}` } });
    assert.equal(byPhone.statusCode, 200, byPhone.body);
    const reasons = new Set(byPhone.json().candidates.flatMap((candidate: { matchReasons: string[] }) => candidate.matchReasons));
    assert.ok(reasons.has('phone'), 'phone duplicate must be detected');
    assert.ok(reasons.has('name'), 'similar name must be detected');
    assert.equal(byPhone.json().candidates.length >= 2, true);
    const stillSeparate = await getGuest(owner, duplicateGuest.id);
    assert.equal(stillSeparate.json().mergedIntoGuestId, null, 'duplicate detection must never auto-merge');

    const note = await app.inject({ method: 'POST', url: url(`/guests/${amina.id}/notes`), headers: headers(owner), payload: { category: 'internal', body: 'Prefers a quiet room away from the elevator.' } });
    assert.equal(note.statusCode, 201, note.body);
    const alert = await app.inject({ method: 'POST', url: url(`/guests/${amina.id}/notes`), headers: headers(frontDesk), payload: { category: 'alert', body: 'Allergic to feather pillows.' } });
    assert.equal(alert.statusCode, 201, alert.body);
    assert.equal((await getGuest(owner, amina.id)).json().notes.length, 2);
    assert.equal((await getGuest(housekeeping, amina.id)).json().notes.length, 0, 'internal notes must be hidden from housekeeping');
    const duplicateNote = await app.inject({ method: 'POST', url: url(`/guests/${duplicateGuest.id}/notes`), headers: headers(owner), payload: { category: 'preference', body: 'Late check-out requested.' } });
    assert.equal(duplicateNote.statusCode, 201, duplicateNote.body);

    const patched = await app.inject({ method: 'PATCH', url: url(`/guests/${amina.id}`), headers: headers(owner), payload: { version: amina.version, displayName: 'Amina El Fassi', preferences: { ...amina.preferences, roomType: 'suite' } } });
    assert.equal(patched.statusCode, 200, patched.body);
    assert.equal(patched.json().version, amina.version + 1);
    const stale = await app.inject({ method: 'PATCH', url: url(`/guests/${amina.id}`), headers: headers(owner), payload: { version: amina.version, displayName: 'Stale' } });
    assert.equal(stale.statusCode, 409);
    assert.equal(stale.json().error.code, 'STALE_VERSION');
    const deniedWrite = await app.inject({ method: 'PATCH', url: url(`/guests/${amina.id}`), headers: headers(housekeeping), payload: { version: amina.version, displayName: 'Denied' } });
    assert.equal(deniedWrite.statusCode, 403);

    const reservation = await pool.query(
      `INSERT INTO reservations(organization_id, property_id, room_id, guest_id, check_in, check_out, adults, children, status, total_minor, currency, price_snapshot)
       VALUES($1,$2,$3,$4,'2027-01-10','2027-01-12',2,0,'confirmed',100000,'MAD','{}'::jsonb) RETURNING id`,
      ['10000000-0000-4000-8000-000000000001', propertyId, seedRoomId, duplicateGuest.id],
    );
    const merge = await app.inject({ method: 'POST', url: url(`/guests/${amina.id}/merge`), headers: headers(frontDesk), payload: { sourceGuestId: duplicateGuest.id, confirm: true } });
    assert.equal(merge.statusCode, 200, merge.body);
    const merged = merge.json();
    assert.equal(merged.id, amina.id);
    assert.equal(merged.notes.length, 3, 'notes from the source guest must move to the target');
    const movedStay = await pool.query('SELECT guest_id FROM reservations WHERE id=$1', [reservation.rows[0].id]);
    assert.equal(movedStay.rows[0].guest_id, amina.id);
    const sourceAfterMerge = await getGuest(owner, duplicateGuest.id);
    assert.ok(sourceAfterMerge.json().anonymizedAt);
    assert.equal(sourceAfterMerge.json().mergedIntoGuestId, amina.id);
    assert.equal(sourceAfterMerge.json().email, null);
    const unconfirmed = await app.inject({ method: 'POST', url: url(`/guests/${amina.id}/merge`), headers: headers(owner), payload: { sourceGuestId: amina.id } });
    assert.equal(unconfirmed.statusCode, 422, 'merge requires explicit confirmation');

    const exportCsv = await app.inject({ method: 'GET', url: url('/guests/export?format=csv'), headers: { authorization: `Bearer ${owner}` } });
    assert.equal(exportCsv.statusCode, 200, exportCsv.body);
    assert.match(String(exportCsv.headers['content-type']), /text\/csv/);
    assert.match(exportCsv.body, /"displayName"/);
    const exportDenied = await app.inject({ method: 'GET', url: url('/guests/export'), headers: { authorization: `Bearer ${frontDesk}` } });
    assert.equal(exportDenied.statusCode, 403);

    const retentionGuest = await createGuest(owner, { displayName: 'Old Guest', email: 'old@example.com', phone: '+212600000001' });
    assert.equal(retentionGuest.statusCode, 201, retentionGuest.body);
    await pool.query("UPDATE guests SET created_at = now() - interval '6 years' WHERE id=$1", [retentionGuest.json().id]);
    const dryRun = await app.inject({ method: 'POST', url: url('/guests/retention/run'), headers: headers(owner), payload: { olderThanYears: 3, dryRun: true } });
    assert.equal(dryRun.statusCode, 200, dryRun.body);
    assert.equal(dryRun.json().anonymized, 0);
    assert.equal(dryRun.json().candidates >= 1, true);
    const retention = await app.inject({ method: 'POST', url: url('/guests/retention/run'), headers: headers(owner), payload: { olderThanYears: 3 } });
    assert.equal(retention.statusCode, 200, retention.body);
    assert.equal(retention.json().anonymized >= 1, true);
    const retained = await getGuest(owner, retentionGuest.json().id);
    assert.ok(retained.json().anonymizedAt);

    const explicit = await createGuest(owner, { displayName: 'Delete Me', email: 'delete@example.com', phone: '+212600000002' });
    const explicitNote = await app.inject({ method: 'POST', url: url(`/guests/${explicit.json().id}/notes`), headers: headers(owner), payload: { category: 'internal', body: 'Sensitive note' } });
    assert.equal(explicitNote.statusCode, 201, explicitNote.body);
    const anonymize = await app.inject({ method: 'POST', url: url(`/guests/${explicit.json().id}/anonymize`), headers: headers(owner) });
    assert.equal(anonymize.statusCode, 200, anonymize.body);
    assert.equal(anonymize.json().displayName, 'Anonymized guest');
    assert.equal(anonymize.json().email, null);
    assert.equal(anonymize.json().phone, null);
    assert.equal(anonymize.json().notes.length, 0);
    const phoneRow = await pool.query('SELECT phone_encrypted, phone_hash FROM guests WHERE id=$1', [explicit.json().id]);
    assert.equal(phoneRow.rows[0].phone_encrypted, null);
    assert.equal(phoneRow.rows[0].phone_hash, null);
    const anonymizeDenied = await app.inject({ method: 'POST', url: url(`/guests/${explicit.json().id}/anonymize`), headers: headers(frontDesk) });
    assert.equal(anonymizeDenied.statusCode, 403);

    const notes = await pool.query('SELECT count(*)::int AS count FROM guest_notes WHERE guest_id=$1 AND deleted_at IS NULL', [explicit.json().id]);
    assert.equal(notes.rows[0].count, 0);
    const audit = await pool.query("SELECT action, metadata FROM audit_events WHERE category IN ('guest', 'export') ORDER BY id");
    assert.ok(audit.rows.some((row) => row.action === 'guest.merged'));
    assert.ok(audit.rows.some((row) => row.action === 'guest.exported'));
    assert.ok(audit.rows.some((row) => row.action === 'guest.anonymized'));
    const auditText = audit.rows.map((row) => JSON.stringify(row.metadata)).join(' ');
    assert.equal(auditText.includes('amina@example.com'), false, 'audit metadata must not contain guest email');
    assert.equal(auditText.includes('612345678'), false, 'audit metadata must not contain guest phone');

    const scrub = await app.inject({ method: 'POST', url: url(`/guests/${duplicateGuest.id}/anonymize`), headers: headers(owner) });
    assert.equal(scrub.statusCode, 200, scrub.body);
    const mergedSnapshots = await pool.query('SELECT source_snapshot FROM guest_merges WHERE source_guest_id=$1', [duplicateGuest.id]);
    assert.equal(mergedSnapshots.rowCount, 1);
    for (const snapshot of mergedSnapshots.rows) assert.equal('displayName' in snapshot.source_snapshot, false, 'anonymization must scrub merge snapshots');

    console.log('Guest integration passed: encrypted contacts, role masking, search, non-destructive duplicate detection, notes, optimistic updates, confirmed merge with history move, CSV export, explicit anonymization, retention, and PII-free audit.');
  } finally {
    await app.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
