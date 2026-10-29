import pg from 'pg';

const { Client } = pg;
const ids = {
  organization: '10000000-0000-4000-8000-000000000001',
  property: '10000000-0000-4000-8000-000000000002',
  user: '10000000-0000-4000-8000-000000000003',
  roomType: '10000000-0000-4000-8000-000000000004',
  room: '10000000-0000-4000-8000-000000000005',
  guest: '10000000-0000-4000-8000-000000000006',
};

export async function seed(connectionString = process.env.MIGRATION_DATABASE_URL ?? 'postgresql://keyora_owner:keyora-owner-local-only@127.0.0.1:5432/keyora_test') {
  const url = new URL(connectionString);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw new Error('Synthetic seed is restricted to a localhost _test database');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO organizations(id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ids.organization, 'Synthetic KEYORA Test Organization']);
    await client.query('INSERT INTO properties(id, organization_id, name, timezone, currency) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [ids.property, ids.organization, 'Synthetic Medina Test Property', 'Africa/Casablanca', 'MAD']);
    await client.query("INSERT INTO users(id, organization_id, email, display_name, password_hash) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING", [ids.user, ids.organization, 'owner@example.invalid', 'Synthetic Owner', '$argon2id$synthetic-not-a-login-secret']);
    await client.query("INSERT INTO user_property_roles(organization_id, property_id, user_id, role) VALUES ($1, $2, $3, 'owner') ON CONFLICT DO NOTHING", [ids.organization, ids.property, ids.user]);
    await client.query('INSERT INTO room_types(id, organization_id, property_id, name, capacity) VALUES ($1, $2, $3, $4, 2) ON CONFLICT DO NOTHING', [ids.roomType, ids.organization, ids.property, 'Synthetic King']);
    await client.query("INSERT INTO rooms(id, organization_id, property_id, room_type_id, name, status) VALUES ($1, $2, $3, $4, $5, 'available') ON CONFLICT DO NOTHING", [ids.room, ids.organization, ids.property, ids.roomType, 'Synthetic Room 101']);
    await client.query('INSERT INTO guests(id, organization_id, property_id, display_name, email) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [ids.guest, ids.organization, ids.property, 'Synthetic Guest', 'guest@example.invalid']);
    await client.query('COMMIT');
    console.log('Synthetic local seed applied. No credential in this seed is usable for authentication.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/seed.ts')) void seed().catch((error) => { console.error(error); process.exitCode = 1; });
