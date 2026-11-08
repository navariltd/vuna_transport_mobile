import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { subscribeToSessionInterruption } from '../auth/session';
import { ConnectivityProvider } from '../offline/connectivity';
import { OfflineSyncProvider } from '../offline/sync';

export default function RootLayout() {
  useEffect(() => subscribeToSessionInterruption((reason) => {
    if (router.canDismiss()) router.dismissAll();
    router.replace({ pathname: '/login', params: { reason } });
  }), []);
  return (
    <ConnectivityProvider>
      <OfflineSyncProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="sync-center" />
          <Stack.Screen name="trips/[tripName]/index" />
          <Stack.Screen name="trips/[tripName]/incidents" />
          <Stack.Screen name="trips/[tripName]/requests/index" />
          <Stack.Screen name="trips/[tripName]/requests/expense-claim" />
          <Stack.Screen name="trips/[tripName]/requests/material-request" />
          <Stack.Screen name="trips/[tripName]/stops/[stopName]/index" />
          <Stack.Screen name="trips/[tripName]/stops/[stopName]/pod" />
        </Stack>
      </OfflineSyncProvider>
    </ConnectivityProvider>
  );
}
