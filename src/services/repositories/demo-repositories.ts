import type { CreateReservationCommand, Reservation, Room } from '../../../packages/contracts/src';
import type { ReservationsRepository, RoomsRepository } from './api-repositories';
import type { TenantScope } from './query-keys';

const updatedAt = '2026-10-28T09:00:00+00:00';
const roomIds = ['41000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002'];
const guestId = '42000000-0000-4000-8000-000000000001';

export class DemoRoomsRepository implements RoomsRepository {
  async list(scope: TenantScope) {
    const data: Room[] = [
      { id: roomIds[0], organizationId: scope.organizationId, propertyId: scope.propertyId, name: 'Synthetic Atlas Suite', roomType: 'King suite', capacity: 2, status: 'available', version: 1, updatedAt },
      { id: roomIds[1], organizationId: scope.organizationId, propertyId: scope.propertyId, name: 'Synthetic Palm Family', roomType: 'Family suite', capacity: 4, status: 'cleaning', version: 1, updatedAt },
    ];
    return { data, nextCursor: null };
  }
}

export class DemoReservationsRepository implements ReservationsRepository {
  private data: Reservation[] = [];
  async list(scope: TenantScope) { return { data: this.data.filter((item) => item.organizationId === scope.organizationId && item.propertyId === scope.propertyId), nextCursor: null }; }
  async create(scope: TenantScope, command: CreateReservationCommand) {
    const reservation: Reservation = { id: CryptoSafeDemoId.next(), organizationId: scope.organizationId, propertyId: scope.propertyId, roomId: command.roomId, guest: { id: command.guestId || guestId, displayName: 'Synthetic Guest', vip: false }, checkIn: command.checkIn, checkOut: command.checkOut, adults: command.adults, children: command.children, status: 'confirmed', total: { amountMinor: 285000, currency: 'MAD' }, version: 1, updatedAt };
    this.data.unshift(reservation); return reservation;
  }
}

const CryptoSafeDemoId = { value: 1, next() { const suffix = String(this.value++).padStart(12, '0'); return `43000000-0000-4000-8000-${suffix}`; } };
