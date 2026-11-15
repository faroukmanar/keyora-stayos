import { useQuery } from '@tanstack/react-query';
import type { Reservation, Room } from '../../../../packages/contracts/src';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { repositories, scopeFor } from '@/services/repositories/live';
import { queryKeys } from '@/services/repositories/query-keys';

export function useLiveRooms() {
  const scope = scopeFor(useAuthStore((state) => state.user));
  return useQuery<Room[]>({
    queryKey: scope ? queryKeys.rooms(scope) : ['live-rooms', 'unauthenticated'],
    enabled: Boolean(scope),
    queryFn: async () => (await repositories.rooms.list(scope!)).data,
  });
}

export function useLiveReservations() {
  const scope = scopeFor(useAuthStore((state) => state.user));
  return useQuery<Reservation[]>({
    queryKey: scope ? queryKeys.reservations(scope) : ['live-reservations', 'unauthenticated'],
    enabled: Boolean(scope),
    queryFn: async () => (await repositories.reservations.list(scope!)).data,
  });
}
