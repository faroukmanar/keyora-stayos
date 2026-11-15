import type { Money, Reservation, ReservationStatus, Room } from '../../packages/contracts/src';

const DAY = 86_400_000;
export const nightsBetween = (checkIn: string, checkOut: string) => {
  const nights = Math.ceil((Date.parse(checkOut) - Date.parse(checkIn)) / DAY);
  if (!Number.isFinite(nights) || nights < 1) throw new Error('Check-out must be after check-in');
  return nights;
};

export const rangesOverlap = (startA: string, endA: string, startB: string, endB: string) =>
  Date.parse(startA) < Date.parse(endB) && Date.parse(startB) < Date.parse(endA);

const holdsInventory = (status: ReservationStatus) => status === 'confirmed' || status === 'checked-in';

/** Client-side hint only; the API's exclusion constraint is authoritative. */
export const isRoomAvailable = (roomId: string, checkIn: string, checkOut: string, reservations: Pick<Reservation, 'roomId' | 'status' | 'checkIn' | 'checkOut'>[]) =>
  !reservations.some((item) => item.roomId === roomId && holdsInventory(item.status) && rangesOverlap(checkIn, checkOut, item.checkIn, item.checkOut));

export const occupancyRate = (rooms: Pick<Room, 'status'>[]) => rooms.length ? Math.round((rooms.filter((room) => room.status === 'occupied').length / rooms.length) * 100) : 0;

// Mirrors the server lifecycle (apps/api/src/domain/reservation-service.ts).
const reservationTransitions: Record<ReservationStatus, ReservationStatus[]> = {
  confirmed: ['checked-in', 'cancelled', 'no-show'],
  'checked-in': ['checked-out'],
  'checked-out': [],
  cancelled: [],
  'no-show': [],
};

export const canTransitionReservation = (from: ReservationStatus, to: ReservationStatus) => reservationTransitions[from].includes(to);

export const formatMoney = (money: Money, locale = 'en') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency, maximumFractionDigits: 0 }).format(money.amountMinor / 100);

/** ISO date (YYYY-MM-DD) in the property's operating time zone. */
export const propertyToday = (now = new Date(), timeZone = 'Africa/Casablanca') =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export const addDays = (isoDate: string, days: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
