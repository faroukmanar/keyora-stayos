import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const { Client } = pg;
const migrationsDirectory = resolve(process.cwd(), 'apps/api/migrations');
const migrationUrl = () => process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://keyora_owner:keyora-owner-local-only@127.0.0.1:5432/keyora_test';

function assertLocalTestDatabase(connectionString: string) {
  const url = new URL(connectionString);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw new Error('Local migration command requires a localhost database whose name ends in _test');
}

async function migrationNames() {
  const files = await readdir(migrationsDirectory);
  return files.filter((file) => /^\d+_.+\.up\.sql$/.test(file)).map((file) => file.replace(/\.up\.sql$/, '')).sort();
}

export async function migrate(direction: 'up' | 'down', options: { all?: boolean; connectionString?: string } = {}) {
  const connectionString = options.connectionString ?? migrationUrl();
  assertLocalTestDatabase(connectionString);
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const names = await migrationNames();
    const appliedResult = await client.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name');
    const applied = new Set(appliedResult.rows.map((row) => row.name));
    const pending = direction === 'up' ? names.filter((name) => !applied.has(name)) : names.filter((name) => applied.has(name)).reverse();
    const selected = options.all ? pending : pending.slice(0, direction === 'up' ? pending.length : 1);
    for (const name of selected) {
      const sql = await readFile(resolve(migrationsDirectory, `${name}.${direction}.sql`), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        if (direction === 'up') await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
        else await client.query('DELETE FROM schema_migrations WHERE name = $1', [name]);
        await client.query('COMMIT');
        console.log(`${direction === 'up' ? 'Applied' : 'Rolled back'} ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    if (selected.length === 0) console.log(`No migrations to ${direction}.`);
  } finally { await client.end(); }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/migrate.ts')) {
  const direction = process.argv[2] === 'down' ? 'down' : 'up';
  void migrate(direction).catch((error) => { console.error(error); process.exitCode = 1; });
}
