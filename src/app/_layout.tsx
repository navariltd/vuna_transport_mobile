import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="trips/[tripName]/index" />
      <Stack.Screen name="trips/[tripName]/incidents" />
      <Stack.Screen name="trips/[tripName]/requests/expense-claim" />
      <Stack.Screen name="trips/[tripName]/requests/material-request" />
      <Stack.Screen name="trips/[tripName]/stops/[stopName]/index" />
      <Stack.Screen name="trips/[tripName]/stops/[stopName]/pod" />
    </Stack>
  );
}
