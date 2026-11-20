import { useRouter, useLocalSearchParams } from 'expo-router';
import { Suspense, lazy, useEffect, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fullscreenMap } from './fullscreen_map_store';
import { colors } from '../../shared/theme';
import { CustomerGoogleMaps } from './google_maps_gate';

const GoogleTripMap = lazy(() => import('./google_trip_map').then((module) => ({ default: module.GoogleTripMap })));

export default function FullscreenMapScreen() {
  const router = useRouter();
  const { mapId } = useLocalSearchParams<{ mapId: string }>();
  const current = useSyncExternalStore(fullscreenMap.subscribe, fullscreenMap.getSnapshot, () => null);
  useEffect(() => () => fullscreenMap.clearId(mapId), [mapId]);
  const close = () => { if (router.canGoBack()) router.back(); else router.replace('/dashboard' as never); };
  if (!current || current.id !== mapId) return <SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: colors.surface }}>
    <Text style={{ color: colors.ink }}>Reopen the map from your trip or stop. Your saved work is unchanged.</Text>
    <Pressable accessibilityRole="button" onPress={close}><Text style={{ color: colors.ink }}>Back</Text></Pressable>
  </SafeAreaView>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
    <CustomerGoogleMaps><Suspense fallback={<View style={{ flex: 1 }} />}>
      <GoogleTripMap {...current.payload} fullscreen onClose={close} />
    </Suspense></CustomerGoogleMaps>
  </SafeAreaView>;
}
