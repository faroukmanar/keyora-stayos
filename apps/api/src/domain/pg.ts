import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Actor } from '../auth/types';

export type TenantScope = { organizationId: string; propertyId: string };

export class DomainError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const forbidden = () => new DomainError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
export const conflict = (code: string, message: string) => new DomainError(409, code, message);
export const notFound = (entity: string) => new DomainError(404, 'NOT_FOUND', `${entity} was not found.`);
export const staleVersion = () => new DomainError(409, 'STALE_VERSION', 'The record changed since it was loaded. Refresh and retry.');

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function hashRequest(value: unknown) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export async function withTenant<T>(pool: Pool, scope: TenantScope, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE keyora_app');
    await client.query("SELECT set_config('app.organization_id', $1, true), set_config('app.property_id', $2, true)", [scope.organizationId, scope.propertyId]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw normalizeDatabaseError(error);
  } finally {
    client.release();
  }
}

export async function withActor<T>(pool: Pool, actor: Actor, work: (client: PoolClient) => Promise<T>) {
  return withTenant(pool, actor, work);
}

export type DomainEventInput = {
  type: string;
  entityType: string;
  entityId?: string | null;
  version?: number;
  payload?: Record<string, unknown>;
};

export async function emitEvent(client: PoolClient, scope: TenantScope, event: DomainEventInput) {
  await client.query(
    'INSERT INTO domain_events(organization_id, property_id, type, entity_type, entity_id, version, payload) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [scope.organizationId, scope.propertyId, event.type, event.entityType, event.entityId ?? null, event.version ?? 1, JSON.stringify(event.payload ?? {})],
  );
}

export type IdempotentResult<T> = { body: T; statusCode: number; replayed: boolean };

export async function runIdempotent<T>(
  pool: Pool,
  actor: Actor,
  route: string,
  idempotencyKey: string,
  requestBody: unknown,
  statusCode: number,
  work: (client: PoolClient) => Promise<T>,
): Promise<IdempotentResult<T>> {
  const requestHash = hashRequest(requestBody);
  return withActor(pool, actor, async (client) => {
    const existing = await client.query(
      'SELECT request_hash, status_code, response FROM idempotency_keys WHERE actor_user_id=$1 AND route=$2 AND idempotency_key=$3',
      [actor.id, route, idempotencyKey],
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (row.request_hash !== requestHash) throw conflict('IDEMPOTENCY_MISMATCH', 'This idempotency key was already used for a different request.');
      return { body: row.response as T, statusCode: Number(row.status_code), replayed: true };
    }
    const result = await work(client);
    await client.query(
      'INSERT INTO idempotency_keys(organization_id, property_id, actor_user_id, route, idempotency_key, request_hash, status_code, response) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [actor.organizationId, actor.propertyId, actor.id, route, idempotencyKey, requestHash, statusCode, JSON.stringify(result)],
    );
    return { body: result, statusCode, replayed: false };
  });
}

export function normalizeDatabaseError(error: unknown): unknown {
  if (error instanceof DomainError) return error;
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === '23P01') return conflict('BOOKING_CONFLICT', 'The requested room is no longer available for those dates.');
  if (code === '23505') return conflict('CONFLICT', 'The record already exists or conflicts with an existing record.');
  if (code === '23503') return new DomainError(422, 'REFERENCE_INVALID', 'A referenced record does not exist in this property.');
  if (code === '23514' || code === '22P02' || code === '22001') return new DomainError(422, 'VALIDATION_ERROR', 'The request violates a data constraint.');
  if (code === '40001' || code === '40P01') return conflict('RETRY_REQUIRED', 'The operation conflicted with concurrent work. Retry safely.');
  return error;
}

export async function recordAudit(
  client: PoolClient,
  input: {
    scope: TenantScope;
    actor?: Actor;
    category: 'authentication' | 'permission' | 'reservation' | 'room' | 'payment' | 'export' | 'operations';
    action: string;
    outcome?: 'succeeded' | 'denied' | 'failed';
    entityType: string;
    entityId?: string;
    requestId: string;
    metadata?: Record<string, string | number | boolean | null>;
  },
) {
  await client.query(
    'INSERT INTO audit_events(organization_id, property_id, actor_user_id, action, entity_type, entity_id, request_id, metadata, category, outcome) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [input.scope.organizationId, input.scope.propertyId, input.actor?.id ?? null, input.action, input.entityType, input.entityId ?? null, input.requestId, JSON.stringify(input.metadata ?? {}), input.category, input.outcome ?? 'succeeded'],
  );
}
