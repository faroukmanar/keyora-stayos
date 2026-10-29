import { createReservationCommandSchema, pageSchema, reservationSchema, roomSchema, type CreateReservationCommand, type Reservation, type Room } from '../../../packages/contracts/src';
import { HttpClient } from '@/services/http/http-client';
import type { TenantScope } from './query-keys';

export interface RoomsRepository { list(scope: TenantScope): Promise<{ data: Room[]; nextCursor: string | null }> }
export interface ReservationsRepository {
  list(scope: TenantScope): Promise<{ data: Reservation[]; nextCursor: string | null }>;
  create(scope: TenantScope, command: CreateReservationCommand, idempotencyKey?: string): Promise<Reservation>;
}

export class ApiRoomsRepository implements RoomsRepository {
  constructor(private readonly http: HttpClient) {}
  list(scope: TenantScope) { return this.http.request({ path: `/v1/properties/${encodeURIComponent(scope.propertyId)}/rooms`, schema: pageSchema(roomSchema) }); }
}

export class ApiReservationsRepository implements ReservationsRepository {
  constructor(private readonly http: HttpClient) {}
  list(scope: TenantScope) { return this.http.request({ path: `/v1/properties/${encodeURIComponent(scope.propertyId)}/reservations`, schema: pageSchema(reservationSchema) }); }
  create(scope: TenantScope, input: CreateReservationCommand, idempotencyKey?: string) {
    const command = createReservationCommandSchema.parse({ ...input, propertyId: scope.propertyId });
    return this.http.request({ method: 'POST', path: `/v1/properties/${encodeURIComponent(scope.propertyId)}/reservations`, body: command, schema: reservationSchema, idempotencyKey });
  }
}
