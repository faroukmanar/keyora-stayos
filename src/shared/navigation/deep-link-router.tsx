import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

export function routeInboundUrl(url: string) {
  const parsed = Linking.parse(url);
  const segments = (parsed.path ?? '').split('/').filter(Boolean);
  if (segments.length === 2 && ['reservation', 'room'].includes(segments[0]) && /^[0-9a-f-]{36}$/i.test(segments[1])) {
    router.push({ pathname: `/${segments[0]}/[id]` as never, params: { id: segments[1] } });
    return;
  }
  if (segments.length === 1 && ['dashboard', 'calendar', 'rooms', 'guests', 'housekeeping'].includes(segments[0])) router.push(`/${segments[0]}` as never);
}

export function DeepLinkRouter() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void Linking.getInitialURL().then((url) => { if (url) routeInboundUrl(url); });
    const subscription = Linking.addEventListener('url', ({ url }) => routeInboundUrl(url));
    return () => subscription.remove();
  }, []);
  return null;
}
