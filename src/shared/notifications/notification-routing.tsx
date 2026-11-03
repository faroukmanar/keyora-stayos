import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { routeInboundUrl } from '@/shared/navigation/deep-link-router';

function routeResponse(response: Notifications.NotificationResponse) {
  const deepLink = response.notification.request.content.data?.deepLink;
  if (typeof deepLink === 'string' && deepLink.startsWith('keyora://')) routeInboundUrl(deepLink);
}

/** Permission is requested only from an explicit settings action, never at launch. */
export function NotificationRouting() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void Notifications.getLastNotificationResponseAsync().then((response) => { if (response) routeResponse(response); }).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(routeResponse);
    return () => subscription.remove();
  }, []);
  return null;
}
