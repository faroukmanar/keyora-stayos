import { useQuery } from '@tanstack/react-query';
import type { Reservation, Room } from '../../../../packages/contracts/src';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { createRepositories } from '@/services/repositories/factory';
import { queryKeys, type TenantScope } from '@/services/repositories/query-keys';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100';
const repositories = createRepositories({ apiUrl });

function scopeFor(user: ReturnType<typeof useAuthStore.getState>['user']): TenantScope | null {
  if (!user?.organizationId || !user.propertyId) return null;
  return { organizationId: user.organizationId, propertyId: user.propertyId };
}

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
