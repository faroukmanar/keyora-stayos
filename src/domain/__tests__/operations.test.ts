import { canTransitionReservation, isRoomAvailable, nightsBetween, occupancyRate, rangesOverlap, reservationTotal } from '@/domain/operations';
import type { Reservation, Room } from '@/domain/models';

const reservation = { id: 'r1', guestId: 'g1', roomId: 'room-1', checkIn: '2026-10-28', checkOut: '2026-10-31', adults: 2, status: 'confirmed', channel: 'Direct' } satisfies Reservation;

describe('hospitality operations', () => {
  it('uses exclusive checkout boundaries', () => expect(rangesOverlap('2026-10-25', '2026-10-28', reservation.checkIn, reservation.checkOut)).toBe(false));
  it('prevents overlapping inventory', () => expect(isRoomAvailable('room-1', '2026-10-30', '2026-11-02', [reservation])).toBe(false));
  it('calculates nights and totals', () => {
    expect(nightsBetween('2026-10-28', '2026-10-31')).toBe(3);
    expect(reservationTotal({ nightlyRate: 1000 }, '2026-10-28', '2026-10-31')).toEqual({ subtotal: 3000, tax: 300, total: 3300 });
  });
  it('calculates occupancy defensively', () => expect(occupancyRate([{ status: 'occupied' }, { status: 'available' }] as Room[])).toBe(50));
  it('allows only valid reservation lifecycle transitions', () => {
    expect(canTransitionReservation('confirmed', 'checked-in')).toBe(true);
    expect(canTransitionReservation('confirmed', 'cancelled')).toBe(true);
    expect(canTransitionReservation('checked-in', 'checked-out')).toBe(true);
    expect(canTransitionReservation('checked-out', 'checked-in')).toBe(false);
    expect(canTransitionReservation('cancelled', 'confirmed')).toBe(false);
  });
});
