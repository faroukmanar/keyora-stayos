import assert from 'node:assert/strict';
import { buildApp } from '../src/app';
import { createDependencies } from '../src/bootstrap';
import { loadConfig } from '../src/config';

const connectionString = process.env.MIGRATION_DATABASE_URL ?? 'postgresql://keyora_owner:keyora-owner-local-only@127.0.0.1:5432/keyora_test';

// Regression: the server composition once omitted the pool, so every domain route 404'd outside tests.
async function main() {
  const config = loadConfig({ KEYORA_PROFILE: 'test', DATABASE_MODE: 'required', DATABASE_URL: connectionString });
  const app = await buildApp(config, await createDependencies(config));
  try {
    const routes: [string, string][] = [
      ['POST', '/v1/auth/login'],
      ['GET', '/v1/properties/:propertyId/rooms'],
      ['POST', '/v1/properties/:propertyId/rooms'],
      ['GET', '/v1/properties/:propertyId/reservations'],
      ['POST', '/v1/properties/:propertyId/quotes'],
      ['GET', '/v1/properties/:propertyId/guests'],
      ['GET', '/v1/properties/:propertyId/events'],
      ['GET', '/v1/properties/:propertyId/housekeeping/tasks'],
      ['POST', '/v1/properties/:propertyId/housekeeping/tasks/:taskId/transitions'],
      ['POST', '/v1/properties/:propertyId/notifications/preview'],
    ];
    for (const [method, url] of routes) assert.equal(app.hasRoute({ method: method as 'GET', url }), true, `${method} ${url} must be mounted by the production composition`);
    const ready = await app.inject({ method: 'GET', url: '/v1/ready' });
    assert.equal(ready.statusCode, 200, ready.body);
    console.log(`Bootstrap integration passed: production composition mounts ${routes.length} route groups and reports ready.`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
