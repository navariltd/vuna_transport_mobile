import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { subscribeToSessionInterruption } from '../auth/session';
import { ConnectivityProvider } from '../offline/connectivity';
import { OfflineSyncProvider } from '../offline/sync';
import { AppUpdateProvider } from '../features/appUpdates/AppUpdateProvider';
import { AppUpdatePrompt } from '../features/appUpdates/AppUpdateCard';

export default function RootLayout() {
  const router = useRouter();
  useEffect(() => subscribeToSessionInterruption((reason) => {
    if (router.canDismiss()) router.dismissAll();
    router.replace({ pathname: '/login', params: { reason } });
  }), [router]);
  return (
    <ConnectivityProvider>
      <OfflineSyncProvider>
        <AppUpdateProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="sync-center" />
            <Stack.Screen name="map/[mapId]" options={{ presentation: 'card', animation: 'none' }} />
            <Stack.Screen name="trips/[tripName]/navigation/[stopName]" options={{ presentation: 'card', animation: 'none' }} />
            <Stack.Screen name="trips/[tripName]/index" />
            <Stack.Screen name="trips/[tripName]/incidents" />
            <Stack.Screen name="trips/[tripName]/requests/index" />
            <Stack.Screen name="trips/[tripName]/requests/expense-claim" />
            <Stack.Screen name="trips/[tripName]/requests/material-request" />
            <Stack.Screen name="trips/[tripName]/stops/[stopName]/index" />
            <Stack.Screen name="trips/[tripName]/stops/[stopName]/pod" />
          </Stack>
          <AppUpdatePrompt />
        </AppUpdateProvider>
      </OfflineSyncProvider>
    </ConnectivityProvider>
  );
}
