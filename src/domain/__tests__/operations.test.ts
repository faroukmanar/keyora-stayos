import { addDays, canTransitionReservation, formatMoney, isRoomAvailable, nightsBetween, occupancyRate, propertyToday, rangesOverlap } from '@/domain/operations';

const reservation = { roomId: 'room-1', checkIn: '2026-10-28', checkOut: '2026-10-31', status: 'confirmed' as const };

describe('hospitality operations', () => {
  it('uses exclusive checkout boundaries', () => expect(rangesOverlap('2026-10-25', '2026-10-28', reservation.checkIn, reservation.checkOut)).toBe(false));
  it('prevents overlapping inventory', () => expect(isRoomAvailable('room-1', '2026-10-30', '2026-11-02', [reservation])).toBe(false));
  it('ignores reservations that no longer hold inventory', () => {
    for (const status of ['cancelled', 'no-show', 'checked-out'] as const) expect(isRoomAvailable('room-1', '2026-10-30', '2026-11-02', [{ ...reservation, status }])).toBe(true);
  });
  it('calculates nights', () => {
    expect(nightsBetween('2026-10-28', '2026-10-31')).toBe(3);
    expect(() => nightsBetween('2026-10-28', '2026-10-28')).toThrow();
  });
  it('calculates occupancy defensively', () => {
    expect(occupancyRate([{ status: 'occupied' }, { status: 'available' }])).toBe(50);
    expect(occupancyRate([])).toBe(0);
  });
  it('allows only valid reservation lifecycle transitions', () => {
    expect(canTransitionReservation('confirmed', 'checked-in')).toBe(true);
    expect(canTransitionReservation('confirmed', 'cancelled')).toBe(true);
    expect(canTransitionReservation('confirmed', 'no-show')).toBe(true);
    expect(canTransitionReservation('checked-in', 'checked-out')).toBe(true);
    expect(canTransitionReservation('checked-out', 'checked-in')).toBe(false);
    expect(canTransitionReservation('cancelled', 'confirmed')).toBe(false);
  });
  it('formats minor-unit money in the reservation currency', () => expect(formatMoney({ amountMinor: 285000, currency: 'MAD' })).toMatch(/2,850/));
  it('derives dates in the property time zone', () => {
    expect(propertyToday(new Date('2026-10-28T23:30:00Z'))).toBe('2026-10-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
