import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { queryKeys } from '@/services/repositories/query-keys';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100';
const maxBackoffMs = 30_000;

/** Invalidates only the active tenant's query namespace when a versioned event arrives. */
export function EventSync() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  useEffect(() => {
    if (Platform.OS !== 'web' || !user?.organizationId || !user.propertyId || typeof EventSource === 'undefined') return;
    const scope = { organizationId: user.organizationId, propertyId: user.propertyId };
    let stream: EventSource | null = null;
    let lastEventId: string | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let disposed = false;
    const invalidate = (event: MessageEvent) => {
      attempts = 0;
      if (event.lastEventId) lastEventId = event.lastEventId;
      void queryClient.invalidateQueries({ queryKey: queryKeys.property(scope) });
    };
    // The access cookie is short-lived; the server ends the stream when it expires or is revoked.
    const reconnect = async () => {
      stream?.close();
      stream = null;
      if (disposed) return;
      const refreshed = await fetch(`${apiUrl}/v1/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ clientType: 'web' }) }).then((response) => response.ok, () => null);
      if (disposed) return;
      if (refreshed === false) { signOut(); return; }
      // Always back off: a stream can fail for reasons a refresh does not fix (network, CORS, proxy).
      retry = setTimeout(connect, Math.min(maxBackoffMs, 1_000 * 2 ** attempts++));
    };
    const connect = () => {
      if (disposed) return;
      const cursor = lastEventId ? `?cursor=${encodeURIComponent(lastEventId)}` : '';
      stream = new EventSource(`${apiUrl}/v1/properties/${encodeURIComponent(scope.propertyId)}/events${cursor}`, { withCredentials: true });
      stream.addEventListener('domain', invalidate);
      stream.addEventListener('session-expired', () => { void reconnect(); });
      // Transient drops reconnect natively with Last-Event-ID; a CLOSED stream (e.g. 401) needs a session refresh.
      stream.onerror = () => { if (stream?.readyState === EventSource.CLOSED) void reconnect(); };
    };
    connect();
    return () => { disposed = true; if (retry) clearTimeout(retry); stream?.close(); };
  }, [queryClient, signOut, user?.organizationId, user?.propertyId]);
  return null;
}
