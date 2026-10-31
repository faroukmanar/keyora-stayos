import type { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthService } from '../auth/auth-service';
import { authorize, idempotencyKey, scopeParams } from './http';
import { DomainError, runIdempotent, withActor } from './pg';
import type { ReservationService, ReservationStatus } from './reservation-service';
import type { MetricsService } from '../observability/metrics';

const statuses = ['confirmed', 'checked-in', 'checked-out', 'cancelled', 'no-show'] as const;
const create = z.object({
  roomId: z.uuid(), guestId: z.uuid(), checkIn: z.iso.date(), checkOut: z.iso.date(),
  adults: z.number().int().min(1).max(50), children: z.number().int().min(0).max(50).default(0), quoteId: z.uuid(),
}).strict().refine((value) => value.checkOut > value.checkIn, { message: 'checkOut must be after checkIn', path: ['checkOut'] });
const changeStay = z.object({ version: z.number().int().positive(), checkIn: z.iso.date(), checkOut: z.iso.date(), adults: z.number().int().min(1).max(50), children: z.number().int().min(0).max(50), quoteId: z.uuid() }).strict().refine((value) => value.checkOut > value.checkIn, { message: 'checkOut must be after checkIn', path: ['checkOut'] });
const reassign = z.object({ version: z.number().int().positive(), roomId: z.uuid() }).strict();
const reprice = z.object({ version: z.number().int().positive(), quoteId: z.uuid() }).strict();
const transition = z.object({ version: z.number().int().positive(), target: z.enum(statuses) }).strict();
const listQuery = z.object({ cursor: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(100).default(50), status: z.enum(statuses).optional(), from: z.iso.date().optional(), to: z.iso.date().optional() }).strict();

export async function registerReservationRoutes(app: FastifyInstance, dependencies: { pool: Pool; auth: AuthService; reservations: ReservationService; metrics?: MetricsService }) {
  const { pool, auth, reservations, metrics } = dependencies;
  const conflictAware = async <T>(work: () => Promise<T>) => {
    try { return await work(); } catch (error) {
      if (error instanceof DomainError && error.code === 'BOOKING_CONFLICT') metrics?.bookingConflicts.inc();
      throw error;
    }
  };

  app.get('/v1/properties/:propertyId/reservations', async (request) => {
    const { propertyId } = scopeParams.parse(request.params);
    const query = listQuery.parse(request.query);
    const actor = await authorize(request, auth, propertyId, 'reservation:read');
    return withActor(pool, actor, (client) => reservations.list(client, query));
  });

  app.get('/v1/properties/:propertyId/reservations/:reservationId', async (request) => {
    const params = scopeParams.extend({ reservationId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'reservation:read');
    return withActor(pool, actor, (client) => reservations.get(client, actor, params.reservationId));
  });

  app.post('/v1/properties/:propertyId/reservations', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'reservation:write');
    const input = create.parse(request.body);
    const key = idempotencyKey(request);
    const result = await conflictAware(() => runIdempotent(pool, actor, `POST /v1/properties/${propertyId}/reservations`, key, input, 201, (client) => reservations.create(client, actor, actor, input, request.id)));
    return reply.status(result.statusCode).send(result.body);
  });

  app.post('/v1/properties/:propertyId/reservations/:reservationId/change-stay', async (request, reply) => {
    const params = scopeParams.extend({ reservationId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'reservation:write');
    const input = changeStay.parse(request.body);
    const key = idempotencyKey(request);
    const result = await conflictAware(() => runIdempotent(pool, actor, `POST /v1/properties/${params.propertyId}/reservations/${params.reservationId}/change-stay`, key, input, 200, (client) => reservations.changeStay(client, actor, actor, params.reservationId, input.version, input, request.id)));
    return reply.status(result.statusCode).send(result.body);
  });

  app.post('/v1/properties/:propertyId/reservations/:reservationId/reassign', async (request, reply) => {
    const params = scopeParams.extend({ reservationId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'reservation:write');
    const input = reassign.parse(request.body);
    const key = idempotencyKey(request);
    const result = await conflictAware(() => runIdempotent(pool, actor, `POST /v1/properties/${params.propertyId}/reservations/${params.reservationId}/reassign`, key, input, 200, (client) => reservations.reassign(client, actor, actor, params.reservationId, input.version, input.roomId, request.id)));
    return reply.status(result.statusCode).send(result.body);
  });

  app.post('/v1/properties/:propertyId/reservations/:reservationId/reprice', async (request, reply) => {
    const params = scopeParams.extend({ reservationId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'reservation:write');
    const input = reprice.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${params.propertyId}/reservations/${params.reservationId}/reprice`, key, input, 200, (client) => reservations.reprice(client, actor, actor, params.reservationId, input.version, input.quoteId, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.post('/v1/properties/:propertyId/reservations/:reservationId/transitions', async (request, reply) => {
    const params = scopeParams.extend({ reservationId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'reservation:check-in');
    const input = transition.parse(request.body);
    if (input.target === 'cancelled' && actor.role === 'housekeeping') throw new DomainError(403, 'FORBIDDEN', 'Housekeeping cannot cancel reservations.');
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${params.propertyId}/reservations/${params.reservationId}/transitions`, key, input, 200, (client) => reservations.transition(client, actor, actor, params.reservationId, input.target as ReservationStatus, input.version, request.id));
    return reply.status(result.statusCode).send(result.body);
  });
}
