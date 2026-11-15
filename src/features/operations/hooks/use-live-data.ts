import * as Crypto from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import type { Guest, MaintenanceBlock, Reservation, ReservationStatus, Room, RoomStatus } from '../../../../packages/contracts/src';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { repositories, scopeFor } from '@/services/repositories/live';
import { queryKeys, type TenantScope } from '@/services/repositories/query-keys';

// Web receives SSE invalidations; native polls while a screen is mounted.
const refetchInterval = Platform.OS === 'web' ? false as const : 15_000;

export function useScope(): TenantScope | null {
  return scopeFor(useAuthStore((state) => state.user));
}

const disabledKey = (name: string) => ['unauthenticated', name] as const;

export function useRooms() {
  const scope = useScope();
  return useQuery<Room[]>({ queryKey: scope ? queryKeys.rooms(scope) : disabledKey('rooms'), enabled: Boolean(scope), refetchInterval, queryFn: async () => (await repositories.rooms.list(scope!)).data });
}

export function useRoom(roomId: string | undefined) {
  const scope = useScope();
  return useQuery<Room>({ queryKey: scope && roomId ? [...queryKeys.rooms(scope), roomId] : disabledKey('room'), enabled: Boolean(scope && roomId), refetchInterval, queryFn: () => repositories.rooms.get(scope!, roomId!) });
}

export function useReservations() {
  const scope = useScope();
  return useQuery<Reservation[]>({ queryKey: scope ? queryKeys.reservations(scope) : disabledKey('reservations'), enabled: Boolean(scope), refetchInterval, queryFn: async () => (await repositories.reservations.list(scope!)).data });
}

export function useReservation(reservationId: string | undefined) {
  const scope = useScope();
  return useQuery<Reservation>({ queryKey: scope && reservationId ? [...queryKeys.reservations(scope), reservationId] : disabledKey('reservation'), enabled: Boolean(scope && reservationId), refetchInterval, queryFn: () => repositories.reservations.get(scope!, reservationId!) });
}

export function useGuests(search = '') {
  const scope = useScope();
  const query = search.trim();
  return useQuery<Guest[]>({ queryKey: scope ? [...queryKeys.guests(scope), query] : disabledKey('guests'), enabled: Boolean(scope), queryFn: async () => (await repositories.guests.list(scope!, query)).data });
}

export function useMaintenanceBlocks() {
  const scope = useScope();
  return useQuery<MaintenanceBlock[]>({ queryKey: scope ? queryKeys.maintenance(scope) : disabledKey('maintenance'), enabled: Boolean(scope), refetchInterval, queryFn: () => repositories.maintenance.list(scope!) });
}

/** Shared mutation wiring: requires a live scope and refreshes the whole tenant namespace afterwards. */
function useScopedMutation<TInput, TResult>(work: (scope: TenantScope, input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  const scope = useScope();
  return useMutation({
    mutationFn: (input: TInput) => {
      if (!scope) throw new Error('Sign in to a property to make changes.');
      return work(scope, input);
    },
    onSettled: () => scope ? queryClient.invalidateQueries({ queryKey: queryKeys.property(scope) }) : undefined,
  });
}

export function useReservationTransition() {
  return useScopedMutation((scope, input: { reservation: Pick<Reservation, 'id' | 'version'>; target: ReservationStatus }) =>
    repositories.reservations.transition(scope, input.reservation.id, { version: input.reservation.version, target: input.target }));
}

export function useRoomStatus() {
  return useScopedMutation((scope, input: { room: Pick<Room, 'id' | 'version'>; status: RoomStatus }) =>
    repositories.rooms.setStatus(scope, input.room.id, { version: input.room.version, status: input.status }));
}

export function useBulkRoomStatus() {
  return useScopedMutation((scope, input: { roomIds: string[]; status: RoomStatus }) => repositories.rooms.bulkStatus(scope, input.roomIds, input.status));
}

export function useReorderRooms() {
  return useScopedMutation((scope, roomIds: string[]) => repositories.rooms.reorder(scope, roomIds));
}

export type StayInput = { roomId: string; checkIn: string; checkOut: string; adults: number; children: number };

/** Server-signed price for a stay; the reservation is later created against this exact quote. */
export function useQuote() {
  return useScopedMutation((scope, stay: StayInput) => repositories.quotes.create(scope, stay));
}

export type BookingKeys = { guest: string; reservation: string };
export type BookingInput = StayInput & {
  quoteId: string;
  guest: { id: string } | { displayName: string; email?: string | null; phone?: string | null };
  keys: BookingKeys;
};

/**
 * (optional) guest → reservation against a previewed quote. Idempotency keys are fixed per booking
 * attempt so a retried submit after a network drop cannot create a second guest or double-book.
 */
export function useCreateBooking() {
  return useScopedMutation(async (scope, input: BookingInput) => {
    const guestId = 'id' in input.guest ? input.guest.id : (await repositories.guests.create(scope, input.guest, input.keys.guest)).id;
    const { roomId, checkIn, checkOut, adults, children, quoteId } = input;
    return repositories.reservations.create(scope, { propertyId: scope.propertyId, roomId, checkIn, checkOut, adults, children, guestId, quoteId }, input.keys.reservation);
  });
}

export const newBookingKeys = (): BookingKeys => ({ guest: Crypto.randomUUID(), reservation: Crypto.randomUUID() });

export function useCreateMaintenance() {
  return useScopedMutation((scope, input: { roomId: string; reason: string; startsAt: string; endsAt: string }) => repositories.maintenance.create(scope, input));
}

export function useReleaseMaintenance() {
  return useScopedMutation((scope, blockId: string) => repositories.maintenance.release(scope, blockId));
}
