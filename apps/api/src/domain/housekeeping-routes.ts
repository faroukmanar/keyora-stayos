import type { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthService } from '../auth/auth-service';
import { authorize, idempotencyKey, scopeParams, taskParams } from './http';
import { runIdempotent, withActor } from './pg';
import type { HousekeepingService, TaskPriority, TaskStatus } from './housekeeping-service';
import type { MetricsService } from '../observability/metrics';

const statuses = ['ready', 'in-progress', 'blocked', 'inspection', 'done'] as const;
const priorities = ['normal', 'rush'] as const;
const listQuery = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(statuses).optional(),
  priority: z.enum(priorities).optional(),
  roomId: z.uuid().optional(),
  assigneeUserId: z.uuid().optional(),
  overdue: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
}).strict();
const create = z.object({
  roomId: z.uuid(), priority: z.enum(priorities).default('normal'), dueAt: z.iso.datetime().nullable().optional(),
  assigneeUserId: z.uuid().nullable().optional(), inspectionRequired: z.boolean().optional(),
}).strict();
const assign = z.object({ version: z.number().int().positive(), assigneeUserId: z.uuid().nullable() }).strict();
const checklistItem = z.object({ label: z.string().trim().min(1).max(200), required: z.boolean().default(true) }).strict();
const checklistItemParams = taskParams.extend({ itemId: z.uuid() });
const checklistToggle = z.object({ completed: z.boolean() }).strict();
const transition = z.object({ version: z.number().int().positive(), target: z.enum(statuses), reason: z.string().trim().min(3).max(500).optional() }).strict();
const inspection = z.object({ version: z.number().int().positive(), result: z.enum(['passed', 'failed']), notes: z.string().trim().max(2000).nullable().optional() }).strict();
const escalate = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(3).max(300) }).strict();

export async function registerHousekeepingRoutes(app: FastifyInstance, dependencies: { pool: Pool; auth: AuthService; housekeeping: HousekeepingService; metrics?: MetricsService }) {
  const { pool, auth, housekeeping, metrics } = dependencies;

  app.get('/v1/properties/:propertyId/housekeeping/tasks', async (request) => {
    const { propertyId } = scopeParams.parse(request.params);
    const query = listQuery.parse(request.query);
    const actor = await authorize(request, auth, propertyId, 'housekeeping:read');
    return withActor(pool, actor, async (client) => {
      const result = await housekeeping.list(client, query);
      if (metrics) await housekeeping.recordSla(client, metrics);
      return result;
    });
  });

  app.get('/v1/properties/:propertyId/housekeeping/tasks/:taskId', async (request) => {
    const params = taskParams.parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'housekeeping:read');
    return withActor(pool, actor, (client) => housekeeping.get(client, actor, params.taskId));
  });

  app.post('/v1/properties/:propertyId/housekeeping/tasks', async (request, reply) => {
    const { propertyId } = scopeParams.parse(request.params);
    const actor = await authorize(request, auth, propertyId, 'housekeeping:write');
    const input = create.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${propertyId}/housekeeping/tasks`, key, input, 201, (client) => housekeeping.create(client, actor, actor, { ...input, priority: input.priority as TaskPriority }, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.patch('/v1/properties/:propertyId/housekeeping/tasks/:taskId/assign', async (request, reply) => {
    const params = taskParams.parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'housekeeping:write');
    const input = assign.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `PATCH /v1/properties/${params.propertyId}/housekeeping/tasks/${params.taskId}/assign`, key, input, 200, (client) => housekeeping.assign(client, actor, actor, params.taskId, input.version, input.assigneeUserId, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.post('/v1/properties/:propertyId/housekeeping/tasks/:taskId/checklist', async (request, reply) => {
    const params = taskParams.parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'housekeeping:write');
    const input = checklistItem.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${params.propertyId}/housekeeping/tasks/${params.taskId}/checklist`, key, input, 201, (client) => housekeeping.addChecklistItem(client, actor, actor, params.taskId, input, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.patch('/v1/properties/:propertyId/housekeeping/tasks/:taskId/checklist/:itemId', async (request, reply) => {
    const params = checklistItemParams.parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'housekeeping:write');
    const input = checklistToggle.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `PATCH /v1/properties/${params.propertyId}/housekeeping/tasks/${params.taskId}/checklist/${params.itemId}`, key, input, 200, (client) => housekeeping.toggleChecklistItem(client, actor, actor, params.taskId, params.itemId, input.completed, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.post('/v1/properties/:propertyId/housekeeping/tasks/:taskId/transitions', async (request, reply) => {
    const params = taskParams.parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'housekeeping:write');
    const input = transition.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${params.propertyId}/housekeeping/tasks/${params.taskId}/transitions`, key, input, 200, (client) => housekeeping.transition(client, actor, actor, params.taskId, input.version, input.target as TaskStatus, input.reason, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.post('/v1/properties/:propertyId/housekeeping/tasks/:taskId/inspections', async (request, reply) => {
    const params = taskParams.parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'housekeeping:inspect');
    const input = inspection.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${params.propertyId}/housekeeping/tasks/${params.taskId}/inspections`, key, input, 200, (client) => housekeeping.inspect(client, actor, actor, params.taskId, input.version, { result: input.result, notes: input.notes }, request.id));
    return reply.status(result.statusCode).send(result.body);
  });

  app.post('/v1/properties/:propertyId/housekeeping/tasks/:taskId/escalate', async (request, reply) => {
    const params = taskParams.parse(request.params);
    const actor = await authorize(request, auth, params.propertyId, 'housekeeping:write');
    const input = escalate.parse(request.body);
    const key = idempotencyKey(request);
    const result = await runIdempotent(pool, actor, `POST /v1/properties/${params.propertyId}/housekeeping/tasks/${params.taskId}/escalate`, key, input, 200, (client) => housekeeping.escalate(client, actor, actor, params.taskId, input.version, input.reason, request.id));
    return reply.status(result.statusCode).send(result.body);
  });
}
