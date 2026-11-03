import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AuthService } from '../auth/auth-service';

const paramsSchema = z.object({ propertyId: z.uuid() });
const cursorSchema = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0);

/** Resumable SSE stream. Payloads contain domain-event metadata only, never guest PII. */
export async function registerEventRoutes(app: FastifyInstance, dependencies: { pool: Pool; auth: AuthService }) {
  app.get('/v1/properties/:propertyId/events', async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? request.headers.cookie?.match(/(?:^|;\s*)(?:__Host-)?keyora_access=([^;]+)/)?.[1];
    if (!token) return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication is required.', requestId: request.id } });
    const actor = await dependencies.auth.authenticate(decodeURIComponent(token));
    if (actor.propertyId !== params.propertyId) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Property access is denied.', requestId: request.id } });
    let cursor = cursorSchema.parse(request.headers['last-event-id'] ?? (request.query as { cursor?: unknown }).cursor);
    reply.hijack();
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const send = async () => {
      const result = await dependencies.pool.query(
        'SELECT sequence,type,entity_type,entity_id,version,payload,occurred_at FROM domain_events WHERE organization_id=$1 AND property_id=$2 AND sequence>$3 ORDER BY sequence ASC LIMIT 100',
        [actor.organizationId, actor.propertyId, cursor],
      );
      for (const row of result.rows) {
        cursor = Number(row.sequence);
        const data = JSON.stringify({ sequence: cursor, type: row.type, entityType: row.entity_type, entityId: row.entity_id, version: Number(row.version), occurredAt: new Date(row.occurred_at).toISOString() });
        reply.raw.write(`id: ${cursor}\nevent: domain\ndata: ${data}\n\n`);
      }
    };
    const heartbeat = setInterval(() => reply.raw.write(': keepalive\n\n'), 15_000);
    const poll = setInterval(() => { void send().catch(() => reply.raw.end()); }, 1_000);
    request.raw.once('close', () => { clearInterval(heartbeat); clearInterval(poll); });
    await send();
  });
}
