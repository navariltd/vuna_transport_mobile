import { Tabs } from 'expo-router';
import { MobileTabBar } from '../../shared/mobile_tab_bar';

export default function MobileTabsLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{ headerShown: false, lazy: true }}
      tabBar={() => <MobileTabBar />}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Home' }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
