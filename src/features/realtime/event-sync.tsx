import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { queryKeys } from '@/services/repositories/query-keys';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100';

/** Invalidates only the active tenant's query namespace when a versioned event arrives. */
export function EventSync() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  useEffect(() => {
    if (Platform.OS !== 'web' || !user?.organizationId || !user.propertyId || typeof EventSource === 'undefined') return;
    const scope = { organizationId: user.organizationId, propertyId: user.propertyId };
    const stream = new EventSource(`${apiUrl}/v1/properties/${encodeURIComponent(scope.propertyId)}/events`, { withCredentials: true });
    const invalidate = () => { void queryClient.invalidateQueries({ queryKey: queryKeys.property(scope) }); };
    stream.addEventListener('domain', invalidate);
    stream.onerror = () => { /* EventSource reconnects with Last-Event-ID automatically. */ };
    return () => { stream.removeEventListener('domain', invalidate); stream.close(); };
  }, [queryClient, user?.organizationId, user?.propertyId]);
  return null;
}
