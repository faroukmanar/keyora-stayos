import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthService } from '../auth/auth-service';
import { assertPermission, type Permission } from '../auth/permissions';
import type { Actor } from '../auth/types';
import { DomainError, forbidden } from './pg';

export function cookieValue(request: FastifyRequest, name: string) {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function accessToken(request: FastifyRequest) {
  return request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1]
    ?? cookieValue(request, '__Host-keyora_access')
    ?? cookieValue(request, 'keyora_access');
}

export async function authenticate(request: FastifyRequest, auth: AuthService): Promise<Actor> {
  const token = accessToken(request);
  if (!token) throw new DomainError(401, 'UNAUTHORIZED', 'Authentication is required.');
  return auth.authenticate(token);
}

export async function authorize(
  request: FastifyRequest,
  auth: AuthService,
  propertyId: string,
  permission: Permission,
): Promise<Actor> {
  const actor = await authenticate(request, auth);
  if (actor.propertyId !== propertyId) throw forbidden();
  assertPermission(actor.role, permission);
  return actor;
}

export function idempotencyKey(request: FastifyRequest) {
  const parsed = z.uuid().safeParse(request.headers['idempotency-key']);
  if (!parsed.success) throw new DomainError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.');
  return parsed.data;
}

export function requestId(request: FastifyRequest) {
  return request.id;
}

export const scopeParams = z.object({ propertyId: z.uuid() });
export const propertyParams = scopeParams.extend({ roomId: z.uuid() });
export const guestParams = scopeParams.extend({ guestId: z.uuid() });
export const reservationParams = scopeParams.extend({ reservationId: z.uuid() });
export const taskParams = scopeParams.extend({ taskId: z.uuid() });

export function listQuery(max = 100) {
  return z.object({
    cursor: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(max).default(50),
  }).strict();
}

export function page<T>(items: T[], limit: number, cursorOf: (item: T) => number) {
  const nextCursor = items.length > limit ? String(cursorOf(items[limit])) : null;
  return { data: items.slice(0, limit), nextCursor };
}
