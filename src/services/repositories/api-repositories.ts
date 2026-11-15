import { z } from 'zod';
import {
  createGuestCommandSchema,
  createMaintenanceBlockCommandSchema,
  createQuoteCommandSchema,
  createReservationCommandSchema,
  guestSchema,
  maintenanceBlockSchema,
  pageSchema,
  quoteSchema,
  reservationSchema,
  reservationTransitionCommandSchema,
  roomSchema,
  roomStatusCommandSchema,
  type CreateReservationCommand,
  type ReservationStatus,
  type RoomStatus,
} from '../../../packages/contracts/src';
import { HttpClient } from '@/services/http/http-client';
import type { TenantScope } from './query-keys';

const base = (scope: TenantScope) => `/v1/properties/${encodeURIComponent(scope.propertyId)}`;
const id = (value: string) => encodeURIComponent(value);

export class ApiRoomsRepository {
  constructor(private readonly http: HttpClient) {}
  list(scope: TenantScope) { return this.http.request({ path: `${base(scope)}/rooms?limit=100`, schema: pageSchema(roomSchema) }); }
  get(scope: TenantScope, roomId: string) { return this.http.request({ path: `${base(scope)}/rooms/${id(roomId)}`, schema: roomSchema }); }
  setStatus(scope: TenantScope, roomId: string, input: { version: number; status: RoomStatus }) {
    return this.http.request({ method: 'PATCH', path: `${base(scope)}/rooms/${id(roomId)}`, body: roomStatusCommandSchema.parse(input), schema: roomSchema });
  }
  bulkStatus(scope: TenantScope, roomIds: string[], status: RoomStatus) {
    return this.http.request({ method: 'PATCH', path: `${base(scope)}/rooms/bulk`, body: { roomIds, patch: { status } }, schema: z.unknown() });
  }
  reorder(scope: TenantScope, roomIds: string[]) {
    return this.http.request({ method: 'POST', path: `${base(scope)}/rooms/reorder`, body: { roomIds }, schema: z.unknown() });
  }
}

export class ApiReservationsRepository {
  constructor(private readonly http: HttpClient) {}
  list(scope: TenantScope, filter: { status?: ReservationStatus; from?: string; to?: string } = {}) {
    const params = new URLSearchParams({ limit: '100' });
    if (filter.status) params.set('status', filter.status);
    if (filter.from) params.set('from', filter.from);
    if (filter.to) params.set('to', filter.to);
    return this.http.request({ path: `${base(scope)}/reservations?${params.toString()}`, schema: pageSchema(reservationSchema) });
  }
  get(scope: TenantScope, reservationId: string) { return this.http.request({ path: `${base(scope)}/reservations/${id(reservationId)}`, schema: reservationSchema }); }
  create(scope: TenantScope, input: CreateReservationCommand, idempotencyKey?: string) {
    const { propertyId: _propertyId, ...command } = createReservationCommandSchema.parse({ ...input, propertyId: scope.propertyId });
    return this.http.request({ method: 'POST', path: `${base(scope)}/reservations`, body: command, schema: reservationSchema, idempotencyKey });
  }
  transition(scope: TenantScope, reservationId: string, input: { version: number; target: ReservationStatus }) {
    return this.http.request({ method: 'POST', path: `${base(scope)}/reservations/${id(reservationId)}/transitions`, body: reservationTransitionCommandSchema.parse(input), schema: reservationSchema });
  }
}

export class ApiGuestsRepository {
  constructor(private readonly http: HttpClient) {}
  list(scope: TenantScope, query?: string) {
    const params = new URLSearchParams({ limit: '100' });
    if (query?.trim()) params.set('q', query.trim());
    return this.http.request({ path: `${base(scope)}/guests?${params.toString()}`, schema: pageSchema(guestSchema) });
  }
  create(scope: TenantScope, input: z.input<typeof createGuestCommandSchema>, idempotencyKey?: string) {
    return this.http.request({ method: 'POST', path: `${base(scope)}/guests`, body: createGuestCommandSchema.parse(input), schema: guestSchema, idempotencyKey });
  }
}

export class ApiQuotesRepository {
  constructor(private readonly http: HttpClient) {}
  create(scope: TenantScope, input: z.input<typeof createQuoteCommandSchema>) {
    return this.http.request({ method: 'POST', path: `${base(scope)}/quotes`, body: createQuoteCommandSchema.parse(input), schema: quoteSchema });
  }
}

export class ApiMaintenanceRepository {
  constructor(private readonly http: HttpClient) {}
  list(scope: TenantScope) { return this.http.request({ path: `${base(scope)}/maintenance-blocks`, schema: z.array(maintenanceBlockSchema) }); }
  create(scope: TenantScope, input: z.input<typeof createMaintenanceBlockCommandSchema>) {
    return this.http.request({ method: 'POST', path: `${base(scope)}/maintenance-blocks`, body: createMaintenanceBlockCommandSchema.parse(input), schema: maintenanceBlockSchema });
  }
  release(scope: TenantScope, blockId: string) {
    return this.http.request({ method: 'POST', path: `${base(scope)}/maintenance-blocks/${id(blockId)}/release`, body: {}, schema: maintenanceBlockSchema });
  }
}
