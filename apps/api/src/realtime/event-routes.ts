import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AuthService } from '../auth/auth-service';
import { withActor } from '../domain/pg';

const paramsSchema = z.object({ propertyId: z.uuid() });
const cursorSchema = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0);
export const SESSION_RECHECK_MS = 30_000;

/** Resumable SSE stream. Payloads contain domain-event metadata (including the staff actorId) only, never guest PII. */
export async function registerEventRoutes(app: FastifyInstance, dependencies: { pool: Pool; auth: AuthService; sessionRecheckMs?: number }) {
  app.get('/v1/properties/:propertyId/events', async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? request.headers.cookie?.match(/(?:^|;\s*)(?:__Host-)?keyora_access=([^;]+)/)?.[1];
    if (!token) return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication is required.', requestId: request.id } });
    const accessToken = decodeURIComponent(token);
    const actor = await dependencies.auth.authenticate(accessToken);
    if (actor.propertyId !== params.propertyId) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Property access is denied.', requestId: request.id } });
    let cursor = cursorSchema.parse(request.headers['last-event-id'] ?? (request.query as { cursor?: unknown }).cursor);
    reply.hijack();
    // hijack() bypasses Fastify's serializer, so carry over CORS/security headers set by earlier hooks.
    const inherited = Object.fromEntries(Object.entries(reply.getHeaders()).filter((entry): entry is [string, string | number | string[]] => entry[1] !== undefined));
    reply.raw.writeHead(200, { ...inherited, 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    let closed = false;
    let sending = false;
    const timers: NodeJS.Timeout[] = [];
    const close = () => {
      if (closed) return;
      closed = true;
      for (const timer of timers) clearInterval(timer);
      reply.raw.end();
    };
    const send = async () => {
      if (closed || sending) return;
      sending = true;
      try {
        // Same RLS path as every other tenant read: SET LOCAL ROLE keyora_app plus the actor's scope.
        const rows = await withActor(dependencies.pool, actor, async (client) => (await client.query(
          'SELECT sequence,type,entity_type,entity_id,version,payload,occurred_at FROM domain_events WHERE organization_id=$1 AND property_id=$2 AND sequence>$3 ORDER BY sequence ASC LIMIT 100',
          [actor.organizationId, actor.propertyId, cursor],
        )).rows);
        for (const row of rows) {
          if (closed) return;
          cursor = Number(row.sequence);
          const actorId = typeof row.payload?.actorId === 'string' ? row.payload.actorId : null;
          const data = JSON.stringify({ sequence: cursor, type: row.type, entityType: row.entity_type, entityId: row.entity_id, version: Number(row.version), actorId, occurredAt: new Date(row.occurred_at).toISOString() });
          reply.raw.write(`id: ${cursor}\nevent: domain\ndata: ${data}\n\n`);
        }
      } finally {
        sending = false;
      }
    };
    // Revoked or expired sessions must not keep receiving events on a long-lived stream.
    const recheck = async () => {
      try {
        await dependencies.auth.authenticate(accessToken);
      } catch {
        if (!closed) reply.raw.write('event: session-expired\ndata: {}\n\n');
        close();
      }
    };
    timers.push(setInterval(() => { if (!closed) reply.raw.write(': keepalive\n\n'); }, 15_000));
    timers.push(setInterval(() => { void send().catch(close); }, 1_000));
    timers.push(setInterval(() => { void recheck(); }, dependencies.sessionRecheckMs ?? SESSION_RECHECK_MS));
    request.raw.once('close', close);
    await send().catch(close);
  });
}
