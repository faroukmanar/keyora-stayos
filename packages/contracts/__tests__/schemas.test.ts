import { createReservationCommandSchema, moneySchema, reservationSchema } from '../src';

const ids = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  propertyId: '10000000-0000-4000-8000-000000000002',
  roomId: '10000000-0000-4000-8000-000000000003',
  guestId: '10000000-0000-4000-8000-000000000004',
  reservationId: '10000000-0000-4000-8000-000000000005',
  quoteId: '10000000-0000-4000-8000-000000000006',
};

describe('shared API contracts', () => {
  it('keeps money in integer minor units', () => {
    expect(moneySchema.parse({ amountMinor: 285000, currency: 'MAD' })).toEqual({ amountMinor: 285000, currency: 'MAD' });
    expect(() => moneySchema.parse({ amountMinor: 1.25, currency: 'MAD' })).toThrow();
  });

  it('rejects invalid and unknown reservation command fields', () => {
    expect(() => createReservationCommandSchema.parse({ ...ids, checkIn: '2026-11-10', checkOut: '2026-11-09', adults: 2 })).toThrow();
    expect(() => createReservationCommandSchema.parse({ ...ids, checkIn: '2026-11-09', checkOut: '2026-11-10', adults: 2, injected: true })).toThrow();
  });

  it('accepts a tenant-scoped reservation response', () => {
    expect(reservationSchema.parse({
      id: ids.reservationId,
      organizationId: ids.organizationId,
      propertyId: ids.propertyId,
      roomId: ids.roomId,
      guest: { id: ids.guestId, displayName: 'Synthetic Guest', vip: false },
      checkIn: '2026-11-09', checkOut: '2026-11-10', adults: 2, children: 0,
      status: 'confirmed', total: { amountMinor: 285000, currency: 'MAD' }, version: 1,
      updatedAt: '2026-10-29T09:00:00+00:00',
    }).propertyId).toBe(ids.propertyId);
  });
});
