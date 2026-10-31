import type { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthService } from '../auth/auth-service';
import { hasPermission } from '../auth/permissions';
import type { Actor } from '../auth/types';
import { authorize, guestParams, idempotencyKey, scopeParams } from './http';
import { DomainError, runIdempotent, withActor } from './pg';
import type { GuestService, GuestInput } from './guest-service';

const preferences = z.object({
  pillow: z.string().trim().max(40).optional(),
  floor: z.enum(['low', 'high', 'any']).optional(),
  dietary: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  accessibility: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  roomType: z.string().trim().max(60).optional(),
}).strict();

const guestCreate = z.object({
  displayName: z.string().trim().min(1).max(160),
  email: z.email().max(254).nullable().optional(),
  phone: z.string().trim().regex(/^\+?[0-9][0-9 ()\-]{6,24}$/, 'Enter a valid phone number.').nullable().optional(),
  preferredLanguage: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/).nullable().optional(),
  preferences: preferences.optional(),
  vip: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
  analyticsOptIn: z.boolean().optional(),
}).strict();
const guestPatch = guestCreate.partial().extend({ version: z.number().int().positive() }).strict();
const note = z.object({ category: z.enum(['preference', 'internal', 'alert']).default('internal'), body: z.string().trim().min(1).max(4000) }).strict();
const noteParams = guestParams.extend({ noteId: z.uuid() });
const merge = z.object({ sourceGuestId: z.uuid(), confirm: z.literal(true) }).strict();
const duplicatesQuery = z.object({
  email: z.email().max(254).optional(),
  phone: z.string().trim().regex(/^\+?[0-9][0-9 ()\-]{6,24}$/).optional(),
  displayName: z.string().trim().min(1).max(160).optional(),
}).strict();
const listQuery = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().min(1).max(160).optional(),
  vip: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
}).strict();
const exportQuery = z.object({ format: z.enum(['json', 'csv']).default('json') }).strict();
const retention = z.object({ olderThanYears: z.number().int().min(1).max(20), dryRun: z.boolean().default(false) }).strict();

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function registerGuestRoutes(app: FastifyInstance, dependencies: { pool: Pool; auth: AuthService; guests: GuestService }) {
  const { pool, auth, guests } = dependencies;
  const sensitive = (actor: Actor) => hasPermission(actor.role, 'guest:sensitive');

  app.get('/v1/properties/:propertyId/guests', async (request) => {
    const { propertyId } = scopeParams.parse(request.params);
    const query = listQuery.parse(request.query);
    const actor = await authorize(request, auth, propertyId, 'guest:read');
    return withActor(pool, actor, (client) => guests.list(client, query, sensitive(actor)));
  });

  app.get('/v1/properties/:propertyId/guests/duplicates', async (request) => {
    const { propertyId } = scopeParams.parse(request.params);
    const query = duplicatesQuery.parse(request.query);
    const actor = await authorize(request, auth, propertyId, 'guest:read');
    if (!query.email && !query.phone && !query.displayName) return { candidates: [] };
    return withActor(pool, actor, (client) => guests.findDuplicates(client, actor, query, sensitive(actor)));
  });

  app.get('/v1/properties/:propertyId/guests/export', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const query = exportQuery.parse(request.query);
    const actor = await authorize(request, auth, propertyId, 'guest:export');
    const rows = await withActor(pool, actor, (client) => guests.exportGuests(client, actor, actor, request.id));
    if (query.format === 'json') return rows;
    const header = ['id', 'displayName', 'email', 'phone', 'preferredLanguage', 'preferences', 'vip', 'marketingOptIn', 'analyticsOptIn', 'createdAt'];
    const lines = [header.map(csvCell).join(',')];
    for (const row of rows) {
      lines.push([row.id, row.displayName, row.email, row.phone, row.preferredLanguage, row.preferences, row.vip, row.marketingOptIn, row.analyticsOptIn, row.createdAt].map(csvCell).join(','));
    }
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="guests.csv"');
    return reply.send(`${lines.join('\r\n')}\r\n`);
  });

  app.get('/v1/properties/:propertyId/guests/:guestId', async (request) => {
    const params = guestParams.parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'guest:read');
    return withActor(pool, actor, (client) => guests.get(client, actor, params.guestId, sensitive(actor)));
  });

  app.get('/v1/properties/:propertyId/guests/:guestId/stays', async (request) => {
    const params = guestParams.parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'guest:read');
    return withActor(pool, actor, (client) => guests.listStays(client, actor, params.guestId));
  });

  app.post('/v1/properties/:propertyId/guests', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'guest:write');
    const input = guestCreate.parse(request.body) as GuestInput;
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${propertyId}/guests`, key, input, 201, (client) => guests.create(client, actor, actor, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.patch('/v1/properties/:propertyId/guests/:guestId', async (request, reply) => {
    const params = guestParams.parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'guest:write');
    const input = guestPatch.parse(request.body) as Partial<GuestInput> & { version: number };
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `PATCH /v1/properties/${params.propertyId}/guests/${params.guestId}`, key, input, 200, (client) => guests.update(client, actor, actor, params.guestId, input.version, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.post('/v1/properties/:propertyId/guests/:guestId/notes', async (request, reply) => {
    const params = guestParams.parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'guest:write');
    const input = note.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${params.propertyId}/guests/${params.guestId}/notes`, key, input, 201, (client) => guests.addNote(client, actor, actor, params.guestId, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.delete('/v1/properties/:propertyId/guests/:guestId/notes/:noteId', async (request, reply) => {
    const params = noteParams.parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'guest:write');
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `DELETE /v1/properties/${params.propertyId}/guests/${params.guestId}/notes/${params.noteId}`, key, null, 200, (client) => guests.deleteNote(client, actor, actor, params.guestId, params.noteId, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.post('/v1/properties/:propertyId/guests/:guestId/merge', async (request, reply) => {
    const params = guestParams.parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'guest:write');
    if (!sensitive(actor)) throw new DomainError(403, 'FORBIDDEN', 'Merging guests requires access to sensitive guest data.');
    const input = merge.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${params.propertyId}/guests/${params.guestId}/merge`, key, input, 200, (client) => guests.merge(client, actor, actor, params.guestId, input.sourceGuestId, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.post('/v1/properties/:propertyId/guests/:guestId/anonymize', async (request, reply) => {
    const params = guestParams.parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'guest:export');
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${params.propertyId}/guests/${params.guestId}/anonymize`, key, null, 200, (client) => guests.anonymize(client, actor, actor, params.guestId, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.post('/v1/properties/:propertyId/guests/retention/run', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'property:manage');
    const input = retention.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${propertyId}/guests/retention/run`, key, input, 200, (client) => guests.runRetention(client, actor, actor, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });
}
