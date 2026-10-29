import assert from 'node:assert/strict';
import pg from 'pg';
import { migrate } from '../src/database/migrate';
import { seed } from '../src/database/seed';

const { Client } = pg;
const connectionString = process.env.MIGRATION_DATABASE_URL ?? 'postgresql://keyora_owner:keyora-owner-local-only@127.0.0.1:5432/keyora_test';
const ids = {
  organizationA: '10000000-0000-4000-8000-000000000001', propertyA: '10000000-0000-4000-8000-000000000002',
  roomA: '10000000-0000-4000-8000-000000000005', guestA: '10000000-0000-4000-8000-000000000006',
  organizationB: '20000000-0000-4000-8000-000000000001', propertyB: '20000000-0000-4000-8000-000000000002',
  roomTypeB: '20000000-0000-4000-8000-000000000004', roomB: '20000000-0000-4000-8000-000000000005',
};

async function main() {
  await migrate('down', { all: true, connectionString });
  await migrate('up', { all: true, connectionString });
  await seed(connectionString);
  const admin = new Client({ connectionString });
  await admin.connect();
  try {
    await admin.query('INSERT INTO organizations(id, name) VALUES ($1, $2)', [ids.organizationB, 'Synthetic Other Tenant']);
    await admin.query("INSERT INTO properties(id, organization_id, name, timezone, currency) VALUES ($1, $2, 'Other Property', 'UTC', 'USD')", [ids.propertyB, ids.organizationB]);
    await admin.query("INSERT INTO room_types(id, organization_id, property_id, name, capacity) VALUES ($1, $2, $3, 'Other Type', 2)", [ids.roomTypeB, ids.organizationB, ids.propertyB]);
    await admin.query("INSERT INTO rooms(id, organization_id, property_id, room_type_id, name, status) VALUES ($1, $2, $3, $4, 'Other Room', 'available')", [ids.roomB, ids.organizationB, ids.propertyB, ids.roomTypeB]);
    await admin.query('SET ROLE keyora_app');
    await admin.query("SELECT set_config('app.organization_id', $1, false), set_config('app.property_id', $2, false)", [ids.organizationA, ids.propertyA]);
    const visible = await admin.query<{ id: string }>('SELECT id FROM rooms ORDER BY id');
    assert.deepEqual(visible.rows.map((row) => row.id), [ids.roomA], 'RLS must hide every other tenant room');
    await assert.rejects(admin.query("INSERT INTO rooms(organization_id, property_id, room_type_id, name, status) VALUES ($1, $2, $3, 'Tenant breakout', 'available')", [ids.organizationB, ids.propertyB, ids.roomTypeB]), /row-level security|violates/);
    await admin.query('RESET ROLE');
    await assert.rejects(admin.query("INSERT INTO reservations(organization_id, property_id, room_id, guest_id, check_in, check_out, adults, status, total_minor, currency, price_snapshot) VALUES ($1,$2,$3,$4,'2026-11-10','2026-11-09',1,'confirmed',100,'MAD','{}')", [ids.organizationA, ids.propertyA, ids.roomA, ids.guestA]), /check|range lower bound/);
    await admin.query("INSERT INTO reservations(id, organization_id, property_id, room_id, guest_id, check_in, check_out, adults, status, total_minor, currency, price_snapshot) VALUES ('30000000-0000-4000-8000-000000000001',$1,$2,$3,$4,'2026-11-10','2026-11-12',1,'confirmed',100,'MAD','{}')", [ids.organizationA, ids.propertyA, ids.roomA, ids.guestA]);
    await assert.rejects(admin.query("INSERT INTO reservations(organization_id, property_id, room_id, guest_id, check_in, check_out, adults, status, total_minor, currency, price_snapshot) VALUES ($1,$2,$3,$4,'2026-11-11','2026-11-13',1,'confirmed',100,'MAD','{}')", [ids.organizationA, ids.propertyA, ids.roomA, ids.guestA]), /conflicting key value|exclusion constraint/);
  } finally { await admin.end(); }
  await migrate('down', { all: true, connectionString });
  const verify = new Client({ connectionString });
  await verify.connect();
  try {
    const result = await verify.query("SELECT to_regclass('public.organizations') AS table_name");
    assert.equal(result.rows[0].table_name, null, 'rollback must remove the core schema');
  } finally { await verify.end(); }
  await migrate('up', { all: true, connectionString });
  console.log('Database integration passed: forward/rollback, constraints, overlap prevention, and tenant RLS.');
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
