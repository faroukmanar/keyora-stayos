import { hash } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const organizationId = '10000000-0000-4000-8000-000000000001';
const propertyId = '10000000-0000-4000-8000-000000000002';
const users = [
  { id: '11000000-0000-4000-8000-000000000001', email: 'owner@demo.keyora.test', name: 'Synthetic Owner', role: 'owner' },
  { id: '11000000-0000-4000-8000-000000000002', email: 'manager@demo.keyora.test', name: 'Synthetic Manager', role: 'manager' },
  { id: '11000000-0000-4000-8000-000000000003', email: 'frontdesk@demo.keyora.test', name: 'Synthetic Front Desk', role: 'front-desk' },
  { id: '11000000-0000-4000-8000-000000000004', email: 'housekeeping@demo.keyora.test', name: 'Synthetic Housekeeping', role: 'housekeeping' },
] as const;

export async function seedAuthUsers(connectionString = process.env.MIGRATION_DATABASE_URL ?? 'postgresql://keyora_owner:keyora-owner-local-only@127.0.0.1:5432/keyora_test') {
  const url = new URL(connectionString);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw new Error('Mock users are restricted to a localhost _test database');
  const supplied = process.env.KEYORA_MOCK_PASSWORD;
  const password = supplied ?? `K3yora-${randomBytes(12).toString('base64url')}!`;
  const passwordHash = await hash(password, { memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32 });
  const client = new Client({ connectionString }); await client.connect();
  try {
    await client.query('BEGIN');
    for (const user of users) {
      await client.query(`INSERT INTO users(id,organization_id,email,display_name,password_hash,status) VALUES($1,$2,$3,$4,$5,'active')
        ON CONFLICT(organization_id,email) DO UPDATE SET display_name=excluded.display_name,password_hash=excluded.password_hash,password_version=users.password_version+1,failed_auth_attempts=0,locked_until=NULL,status='active'`, [user.id, organizationId, user.email, user.name, passwordHash]);
      await client.query('INSERT INTO user_property_roles(organization_id,property_id,user_id,role) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [organizationId, propertyId, user.id, user.role]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
  console.log(JSON.stringify({ scope: 'LOCAL SYNTHETIC TEST ONLY', propertyId, users: users.map((user) => ({ email: user.email, role: user.role })), password, generatedPassword: !supplied }, null, 2));
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/seed-auth-users.ts')) void seedAuthUsers().catch((error) => { console.error(error); process.exitCode = 1; });
