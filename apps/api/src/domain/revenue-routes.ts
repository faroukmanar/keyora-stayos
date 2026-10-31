import type { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthService } from '../auth/auth-service';
import { authorize, idempotencyKey, scopeParams } from './http';
import { runIdempotent, withActor } from './pg';
import type { RevenueService } from './revenue-service';

const quoteInput = z.object({
  roomId: z.uuid(),
  checkIn: z.iso.date(),
  checkOut: z.iso.date(),
  adults: z.number().int().min(1).max(50),
  children: z.number().int().min(0).max(50).default(0),
  discountCode: z.string().regex(/^[A-Z0-9-]{3,32}$/).optional(),
}).strict().refine((value) => value.checkOut > value.checkIn, { message: 'checkOut must be after checkIn', path: ['checkOut'] });
const calendarEntry = z.object({
  stayDate: z.iso.date(),
  amountMinor: z.number().int().min(0).max(100_000_000),
  minStay: z.number().int().min(1).max(365).nullable().optional(),
  maxStay: z.number().int().min(1).max(365).nullable().optional(),
  stopSell: z.boolean().optional(),
  closedToArrival: z.boolean().optional(),
  closedToDeparture: z.boolean().optional(),
}).strict();
const calendar = z.object({ entries: z.array(calendarEntry).min(1).max(366) }).strict();
const ratePlan = z.object({
  roomTypeId: z.uuid(), name: z.string().trim().min(1).max(120), amountMinor: z.number().int().min(0).max(100_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/), minStay: z.number().int().min(1).max(365), maxStay: z.number().int().min(1).max(365).nullable().optional(),
  stopSell: z.boolean().optional(), closedToArrival: z.boolean().optional(), closedToDeparture: z.boolean().optional(), cancellationPolicyId: z.uuid().nullable().optional(),
}).strict().refine((value) => value.maxStay == null || value.maxStay >= value.minStay, { message: 'maxStay must be at least minStay', path: ['maxStay'] });
const ratePlanPatch = z.object({
  name: z.string().trim().min(1).max(120).optional(), amountMinor: z.number().int().min(0).max(100_000_000).optional(), active: z.boolean().optional(),
  minStay: z.number().int().min(1).max(365).optional(), maxStay: z.number().int().min(1).max(365).nullable().optional(), stopSell: z.boolean().optional(),
}).strict().refine((value) => value.maxStay == null || value.minStay == null || value.maxStay >= value.minStay, { message: 'maxStay must be at least minStay', path: ['maxStay'] });
const tax = z.object({
  name: z.string().trim().min(1).max(120), kind: z.enum(['tax', 'fee']), calculation: z.enum(['percent', 'fixed']),
  basisPoints: z.number().int().min(0).max(10_000).nullable().optional(), amountMinor: z.number().int().min(0).max(100_000_000).nullable().optional(),
  appliesPer: z.enum(['stay', 'night']).default('stay'),
}).strict().refine((value) => (value.calculation === 'percent' ? value.basisPoints != null && value.amountMinor == null : value.amountMinor != null && value.basisPoints == null), { message: 'Provide either basisPoints or amountMinor for the selected calculation.' });
const discount = z.object({
  code: z.string().regex(/^[A-Z0-9-]{3,32}$/), percentBasisPoints: z.number().int().min(1).max(10_000),
  startsOn: z.iso.date(), endsOn: z.iso.date(), minNights: z.number().int().min(1).max(365), maxRedemptions: z.number().int().min(1).nullable().optional(),
}).strict().refine((value) => value.endsOn >= value.startsOn, { message: 'endsOn must not be before startsOn', path: ['endsOn'] });
const cancellation = z.object({ name: z.string().trim().min(1).max(120), freeUntilHours: z.number().int().min(0).max(8760), penaltyBasisPoints: z.number().int().min(0).max(10_000), noShowBasisPoints: z.number().int().min(0).max(10_000) }).strict();

export async function registerRevenueRoutes(app: FastifyInstance, dependencies: { pool: Pool; auth: AuthService; revenue: RevenueService }) {
  const { pool, auth, revenue } = dependencies;

  app.post('/v1/properties/:propertyId/quotes', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'reservation:write');
    const input = quoteInput.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${propertyId}/quotes`, key, input, 201, (client) => revenue.createQuote(client, actor, actor, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.get('/v1/properties/:propertyId/quotes/:quoteId', async (request) => {
    const params = scopeParams.extend({ quoteId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'reservation:read');
    return withActor(pool, actor, (client) => revenue.getQuote(client, actor, params.quoteId));
  });

  app.get('/v1/properties/:propertyId/rate-plans', async (request) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'reservation:read');
    return withActor(pool, actor, (client) => revenue.listRatePlans(client, actor));
  });

  app.post('/v1/properties/:propertyId/rate-plans', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'property:manage');
    const input = ratePlan.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${propertyId}/rate-plans`, key, input, 201, (client) => revenue.createRatePlan(client, actor, actor, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.patch('/v1/properties/:propertyId/rate-plans/:planId', async (request, reply) => {
    const params = scopeParams.extend({ planId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'property:manage');
    const input = ratePlanPatch.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `PATCH /v1/properties/${params.propertyId}/rate-plans/${params.planId}`, key, input, 200, (client) => revenue.updateRatePlan(client, actor, actor, params.planId, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.put('/v1/properties/:propertyId/rate-plans/:planId/calendar', async (request, reply) => {
    const params = scopeParams.extend({ planId: z.uuid() }).parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'property:manage');
    const input = calendar.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `PUT /v1/properties/${params.propertyId}/rate-plans/${params.planId}/calendar`, key, input, 204, async (client) => {
      await revenue.setRateCalendar(client, actor, actor, params.planId, input.entries, request.id);
      return null;
    });
    return reply.status(result.statusCode).send(result.body ?? undefined);
  });

  app.get('/v1/properties/:propertyId/taxes-fees', async (request) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'reservation:read');
    return withActor(pool, actor, (client) => revenue.listTaxes(client, actor));
  });

  app.post('/v1/properties/:propertyId/taxes-fees', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'property:manage');
    const input = tax.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${propertyId}/taxes-fees`, key, input, 201, (client) => revenue.createTax(client, actor, actor, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.get('/v1/properties/:propertyId/discounts', async (request) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'reservation:read');
    return withActor(pool, actor, (client) => revenue.listDiscounts(client, actor));
  });

  app.post('/v1/properties/:propertyId/discounts', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'property:manage');
    const input = discount.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${propertyId}/discounts`, key, input, 201, (client) => revenue.createDiscount(client, actor, actor, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.get('/v1/properties/:propertyId/cancellation-policies', async (request) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'reservation:read');
    return withActor(pool, actor, (client) => revenue.listCancellationPolicies(client, actor));
  });

  app.post('/v1/properties/:propertyId/cancellation-policies', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'property:manage');
    const input = cancellation.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${propertyId}/cancellation-policies`, key, input, 201, (client) => revenue.createCancellationPolicy(client, actor, actor, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });
}
