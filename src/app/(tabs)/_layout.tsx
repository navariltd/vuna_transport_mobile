import { Tabs, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { MobileTabBar } from '../../shared/mobile_tab_bar';
import { registerPushNotifications } from '../../notifications/registration';
import { REMOTE_PUSH_NOTIFICATIONS_ENABLED } from '../../notifications/config';

export default function MobileTabsLayout() {
  useEffect(() => {
    if (!REMOTE_PUSH_NOTIFICATIONS_ENABLED) return undefined;
    void registerPushNotifications().catch(() => undefined);
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data?.route;
      if (typeof route === 'string' && route.startsWith('/')) router.push(route as never);
    });
    return () => responseSubscription.remove();
  }, []);

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{ headerShown: false, lazy: true }}
      tabBar={() => <MobileTabBar />}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Home' }} />
      <Tabs.Screen name="requests" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
