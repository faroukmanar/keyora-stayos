import type { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthService } from '../auth/auth-service';
import { authorize, idempotencyKey, listQuery, scopeParams } from './http';
import { runIdempotent, withActor, withTenant, DomainError } from './pg';
import { InventoryService } from './inventory-service';

const roomStatus = z.enum(['available', 'occupied', 'cleaning', 'maintenance']);
const roomCreate = z.object({
  roomTypeId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  status: roomStatus.default('available'),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  amenityIds: z.array(z.uuid()).max(50).optional(),
}).strict();
const roomPatch = z.object({
  version: z.number().int().positive(),
  roomTypeId: z.uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  status: roomStatus.optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  amenityIds: z.array(z.uuid()).max(50).optional(),
}).strict();
const bulkPatch = z.object({
  roomIds: z.array(z.uuid()).min(1).max(200),
  patch: z.object({ status: roomStatus.optional(), sortOrder: z.number().int().min(0).max(1_000_000).optional() }).strict(),
}).strict();
const reorder = z.object({ roomIds: z.array(z.uuid()).min(1).max(500) }).strict();
const amenityCreate = z.object({ code: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/), name: z.string().trim().min(1).max(80) }).strict();
const policies = z.object({
  checkInTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  checkOutTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  cancellationPolicy: z.record(z.string(), z.unknown()),
  houseRules: z.array(z.string().trim().min(1).max(300)).max(50),
}).strict();
const media = z.object({
  kind: z.enum(['image', 'floorplan']),
  objectKey: z.string().regex(/^[a-zA-Z0-9/_.-]{8,255}$/),
  mimeType: z.string().trim().min(3).max(100),
  sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  altText: z.string().trim().min(1).max(300),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  metadataStripped: z.literal(true),
}).strict();
const maintenance = z.object({
  roomId: z.uuid(),
  reason: z.string().trim().min(3).max(300),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
}).strict().refine((value) => value.endsAt > value.startsAt, { message: 'endsAt must be after startsAt', path: ['endsAt'] });
const roomType = z.object({ name: z.string().trim().min(1).max(120), capacity: z.number().int().min(1).max(50) }).strict();
const roomTypePatch = z.object({ name: z.string().trim().min(1).max(120).optional(), capacity: z.number().int().min(1).max(50).optional() }).strict();
const mediaQuery = z.object({ organizationId: z.uuid(), propertyId: z.uuid(), exp: z.coerce.number().int().positive(), sig: z.string().min(16).max(200) });

export async function registerInventoryRoutes(app: FastifyInstance, dependencies: { pool: Pool; auth: AuthService; service: InventoryService }) {
  const { pool, auth, service } = dependencies;
  const scopeOf = (actor: { organizationId: string; propertyId: string }) => ({ organizationId: actor.organizationId, propertyId: actor.propertyId });

  app.get('/v1/properties/:propertyId/rooms', async (request) => {
    const { propertyId } = scopeParams.parse(request.params);
    const query = listQuery().extend({ includeArchived: z.coerce.boolean().default(false), status: roomStatus.optional(), search: z.string().trim().max(120).optional() }).parse(request.query);
    const actor = await authorize(request, auth, propertyId, 'room:read');
    return withActor(pool, actor, (client) => service.listRooms(client, query));
  });

  app.post('/v1/properties/:propertyId/rooms', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'room:write');
    const input = roomCreate.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${propertyId}/rooms`, key, input, 201, (client) => service.createRoom(client, scopeOf(actor), actor, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.get('/v1/properties/:propertyId/rooms/:roomId', async (request) => {
    const params = scopeParams.extend({ roomId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'room:read');
    return withActor(pool, actor, (client) => service.getRoom(client, scopeOf(actor), params.roomId));
  });

  app.patch('/v1/properties/:propertyId/rooms/:roomId', async (request, reply) => {
    const params = scopeParams.extend({ roomId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'room:write');
    const input = roomPatch.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `PATCH /v1/properties/${params.propertyId}/rooms/${params.roomId}`, key, input, 200, (client) => service.updateRoom(client, scopeOf(actor), actor, params.roomId, input.version, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.delete('/v1/properties/:propertyId/rooms/:roomId', async (request, reply) => {
    const params = scopeParams.extend({ roomId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'room:write');
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `DELETE /v1/properties/${params.propertyId}/rooms/${params.roomId}`, key, {}, 204, async (client) => {
      await service.archiveRoom(client, scopeOf(actor), actor, params.roomId, request.id);
      return null;
    });
    return reply.status(result.statusCode).send(result.body ?? undefined);
  });

  app.post('/v1/properties/:propertyId/rooms/reorder', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'room:write');
    const input = reorder.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${propertyId}/rooms/reorder`, key, input, 204, async (client) => {
      await service.reorderRooms(client, scopeOf(actor), actor, input.roomIds, request.id);
      return null;
    });
    return reply.status(result.statusCode).send(result.body ?? undefined);
  });

  app.patch('/v1/properties/:propertyId/rooms/bulk', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'room:write');
    const input = bulkPatch.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `PATCH /v1/properties/${propertyId}/rooms/bulk`, key, input, 204, async (client) => {
      await service.bulkUpdate(client, scopeOf(actor), actor, input.roomIds, input.patch, request.id);
      return null;
    });
    return reply.status(result.statusCode).send(result.body ?? undefined);
  });

  app.get('/v1/properties/:propertyId/amenities', async (request) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'room:read');
    return withActor(pool, actor, (client) => service.listAmenities(client, scopeOf(actor)));
  });

  app.post('/v1/properties/:propertyId/amenities', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'room:write');
    const input = amenityCreate.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${propertyId}/amenities`, key, input, 201, (client) => service.createAmenity(client, scopeOf(actor), actor, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.get('/v1/properties/:propertyId/policies', async (request) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'room:read');
    return withActor(pool, actor, (client) => service.getPolicies(client, scopeOf(actor)));
  });

  app.put('/v1/properties/:propertyId/policies', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'property:manage');
    const input = policies.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `PUT /v1/properties/${propertyId}/policies`, key, input, 200, (client) => service.savePolicies(client, scopeOf(actor), actor, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.get('/v1/properties/:propertyId/rooms/:roomId/media', async (request) => {
    const params = scopeParams.extend({ roomId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'room:read');
    return withActor(pool, actor, (client) => service.listMedia(client, scopeOf(actor), params.roomId));
  });

  app.post('/v1/properties/:propertyId/rooms/:roomId/media', async (request, reply) => {
    const params = scopeParams.extend({ roomId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'room:write');
    const input = media.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${params.propertyId}/rooms/${params.roomId}/media`, key, input, 201, (client) => service.registerMedia(client, scopeOf(actor), actor, params.roomId, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.get('/v1/media/:mediaId', async (request, reply) => {
    const params = z.object({ mediaId: z.uuid() }).parse(request.params);
    const query = mediaQuery.parse(request.query);
    service.verifyMediaSignature(params.mediaId, query.organizationId, query.propertyId, query.exp, query.sig);
    const media = await withTenant(pool, { organizationId: query.organizationId, propertyId: query.propertyId }, (client) => service.resolveMedia(client, params.mediaId));
    if (media.organizationId !== query.organizationId || media.propertyId !== query.propertyId) throw new DomainError(403, 'MEDIA_SIGNATURE_INVALID', 'The media URL signature is invalid.');
    reply.header('cache-control', 'private, max-age=300');
    return { id: media.id, mimeType: media.mimeType, sizeBytes: media.sizeBytes, objectKey: media.objectKey, signed: true };
  });

  app.get('/v1/properties/:propertyId/maintenance-blocks', async (request) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'room:read');
    return withActor(pool, actor, (client) => service.listMaintenanceBlocks(client, scopeOf(actor)));
  });

  app.post('/v1/properties/:propertyId/maintenance-blocks', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'room:write');
    const input = maintenance.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${propertyId}/maintenance-blocks`, key, input, 201, (client) => service.createMaintenanceBlock(client, scopeOf(actor), actor, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.post('/v1/properties/:propertyId/maintenance-blocks/:blockId/release', async (request, reply) => {
    const params = scopeParams.extend({ blockId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'room:write');
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${params.propertyId}/maintenance-blocks/${params.blockId}/release`, key, {}, 200, (client) => service.releaseMaintenanceBlock(client, scopeOf(actor), actor, params.blockId, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.get('/v1/properties/:propertyId/room-types', async (request) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'room:read');
    return withActor(pool, actor, (client) => service.listRoomTypes(client, scopeOf(actor)));
  });

  app.post('/v1/properties/:propertyId/room-types', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'room:write');
    const input = roomType.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${propertyId}/room-types`, key, input, 201, (client) => service.createRoomType(client, scopeOf(actor), actor, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.patch('/v1/properties/:propertyId/room-types/:roomTypeId', async (request, reply) => {
    const params = scopeParams.extend({ roomTypeId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'room:write');
    const input = roomTypePatch.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `PATCH /v1/properties/${params.propertyId}/room-types/${params.roomTypeId}`, key, input, 200, (client) => service.updateRoomType(client, scopeOf(actor), actor, params.roomTypeId, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.delete('/v1/properties/:propertyId/room-types/:roomTypeId', async (request, reply) => {
    const params = scopeParams.extend({ roomTypeId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'room:write');
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `DELETE /v1/properties/${params.propertyId}/room-types/${params.roomTypeId}`, key, {}, 204, async (client) => {
      await service.archiveRoomType(client, scopeOf(actor), actor, params.roomTypeId, request.id);
      return null;
    });
    return reply.status(result.statusCode).send(result.body ?? undefined);
  });
}
