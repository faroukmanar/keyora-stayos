import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { z } from 'zod';
import { appRoleSchema } from '../../../packages/contracts/src';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { restoreNativeSession } from '@/features/auth/native-session';
import { DeepLinkRouter } from '@/shared/navigation/deep-link-router';
import { NotificationRouting } from '@/shared/notifications/notification-routing';
import { EventSync } from '@/features/realtime/event-sync';

const webSessionSchema = z.object({ user: z.object({ id: z.string().uuid(), organizationId: z.string().uuid(), propertyId: z.string().uuid(), displayName: z.string().min(1), role: appRoleSchema, sessionId: z.string().uuid() }).passthrough() }).passthrough();

function SessionBootstrap() {
  const hydrate = useAuthStore((state) => state.hydrate);
  const finish = useAuthStore((state) => state.finishSessionCheck);
  useEffect(() => {
    if (Platform.OS !== 'web') {
      void restoreNativeSession().then((user) => { if (user) hydrate(user); }).catch(() => {}).finally(finish);
      return;
    }
    const controller = new AbortController();
    const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100';
    void fetch(`${apiUrl}/v1/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ clientType: 'web' }), signal: controller.signal })
      .then(async (response) => { if (!response.ok) return; const parsed = webSessionSchema.parse(await response.json()); hydrate({ id: parsed.user.id, name: parsed.user.displayName, role: parsed.user.role, organizationId: parsed.user.organizationId, propertyId: parsed.user.propertyId, sessionId: parsed.user.sessionId }); })
      .catch(() => {})
      .finally(finish);
    return () => controller.abort();
  }, [finish, hydrate]);
  return null;
}

function NativeSessionMonitor() {
  const hydrate = useAuthStore((state) => state.hydrate);
  const signOut = useAuthStore((state) => state.signOut);
  const user = useAuthStore((state) => state.user);
  useEffect(() => {
    if (Platform.OS === 'web' || !user) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void restoreNativeSession().then((nextUser) => { if (nextUser) hydrate(nextUser); else signOut(); }).catch(() => {});
    });
    return () => subscription.remove();
  }, [hydrate, signOut, user]);
  return null;
}

export function AppProviders({ children }: PropsWithChildren) { const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })); return <QueryClientProvider client={client}><SessionBootstrap /><NativeSessionMonitor /><DeepLinkRouter /><NotificationRouting /><EventSync />{children}</QueryClientProvider>; }
