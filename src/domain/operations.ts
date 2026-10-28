import type { Reservation, Room } from '@/domain/models';

const DAY = 86_400_000;
export const nightsBetween = (checkIn: string, checkOut: string) => {
  const nights = Math.ceil((Date.parse(checkOut) - Date.parse(checkIn)) / DAY);
  if (!Number.isFinite(nights) || nights < 1) throw new Error('Check-out must be after check-in');
  return nights;
};

export const rangesOverlap = (startA: string, endA: string, startB: string, endB: string) =>
  Date.parse(startA) < Date.parse(endB) && Date.parse(startB) < Date.parse(endA);

export const isRoomAvailable = (roomId: string, checkIn: string, checkOut: string, reservations: Reservation[]) =>
  !reservations.some((item) => item.roomId === roomId && item.status !== 'cancelled' && rangesOverlap(checkIn, checkOut, item.checkIn, item.checkOut));

export const reservationTotal = (room: Pick<Room, 'nightlyRate'>, checkIn: string, checkOut: string, taxRate = 0.1) => {
  const subtotal = room.nightlyRate * nightsBetween(checkIn, checkOut);
  return { subtotal, tax: Math.round(subtotal * taxRate), total: Math.round(subtotal * (1 + taxRate)) };
};

export const occupancyRate = (rooms: Room[]) => rooms.length ? Math.round((rooms.filter((room) => room.status === 'occupied').length / rooms.length) * 100) : 0;
