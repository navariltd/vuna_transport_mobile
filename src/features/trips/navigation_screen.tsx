import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Component, lazy, Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { getSession, subscribeToSessionChange, type MobileSession } from '../../auth/session';
import { loadTripDetails } from '../../offline/trip_repository';
import { colors } from '../../shared/theme';
import { formatAddress } from './components';
import { fullscreenMap } from './fullscreen_map_store';
import { stopCoordinate, stopLabel } from './map_model';
import type { DeliveryStop } from './types';

const NativeNavigation = lazy(() => import('./native_navigation').then((module) => ({ default: module.NativeNavigation })));
const identity = (session: MobileSession | null) => session ? JSON.stringify([session.siteUrl, session.user, session.sid, session.mapConfig?.provider]) : '';

class NavigationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Text style={styles.notice}>In-app navigation could not load. Use external directions or return to the stop.</Text> : this.props.children; }
}

export default function NavigationScreen() {
  const router = useRouter();
  const { tripName, stopName, overview, mapId } = useLocalSearchParams<{ tripName: string; stopName: string; overview?: string; mapId?: string }>();
  const [session, setSession] = useState<MobileSession | null>(null);
  const [stop, setStop] = useState<DeliveryStop>();
  const [stops, setStops] = useState<DeliveryStop[]>([]);
  const [error, setError] = useState('');
  const handoff = useSyncExternalStore(fullscreenMap.subscribe, fullscreenMap.getSnapshot, () => null);
  const loadedRoute = handoff && handoff.id === mapId && handoff.payload.tripName === tripName ? handoff.payload.roadRoute : undefined;
  useEffect(() => () => { if (mapId) fullscreenMap.clearId(mapId); }, [mapId]);
  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    const update = (value: MobileSession | null) => {
      const current = ++generation;
      setSession(value); setStop(undefined); setStops([]); setError('');
      if (!value) return;
      void loadTripDetails(tripName).then((result) => {
        if (cancelled || current !== generation) return;
        const row = result.data.trip.stops.find((item) => item.name === stopName);
        if (!row) throw new Error('This stop is no longer on the trip.');
        setStop(row);
        setStops(overview === '1' ? result.data.trip.stops : [row]);
      }).catch((failure) => { if (!cancelled && current === generation) setError(failure instanceof Error ? failure.message : 'Stop unavailable.'); });
    };
    const unsubscribe = subscribeToSessionChange((value) => { if (!cancelled) update(value); });
    const initial = generation;
    void getSession().then((value) => { if (!cancelled && generation === initial) update(value); });
    return () => { cancelled = true; unsubscribe(); };
  }, [tripName, stopName, overview]);

  const back = () => { if (router.canGoBack()) router.back(); else router.replace(`/trips/${encodeURIComponent(tripName)}` as never); };
  const configured = Platform.OS === 'android' && Boolean(Constants.expoConfig?.extra?.mobileMaps?.googleAndroidConfigured);
  const canNavigate = configured && session?.mapConfig?.provider === 'google';
  const external = async () => {
    if (!stop) return;
    const coordinate = stopCoordinate(stop);
    const destination = coordinate ? `${coordinate[1]},${coordinate[0]}` : formatAddress(stop);
    if (!destination) return;
    try { await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`); }
    catch { setError('Could not open external directions.'); }
  };
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
    <StatusBar style="dark" />
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to stop or trip" onPress={back} style={styles.iconButton}><Ionicons name="chevron-back" size={24} color={colors.ink} /></Pressable>
      <Text numberOfLines={1} style={styles.title}>{stop ? stopLabel(stop) : 'Map'}</Text>
      {stop ? <Pressable accessibilityRole="button" accessibilityLabel="Open directions in external maps app" onPress={() => void external()} style={styles.iconButton}><Ionicons name="open-outline" size={20} color={colors.ink} /></Pressable> : null}
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.notice}>{error}</Text> : null}
    {!stop && !error ? <View style={styles.loading}><ActivityIndicator color={colors.ink} /><Text style={styles.notice}>Loading stop map…</Text></View> : null}
    {stop && session ? canNavigate ? <NavigationBoundary key={identity(session)}><Suspense fallback={<Text style={styles.notice}>Loading map…</Text>}>
      <NativeNavigation tripName={tripName} stopName={stopName} stop={stop} previewStops={stops} previewRoute={loadedRoute} onReturn={back} />
    </Suspense></NavigationBoundary> : <Text style={styles.notice}>In-app Google navigation is not available for this site or app build. You can use external directions and still record proof.</Text> : null}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { minHeight: 48, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.ink },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' }, notice: { padding: 16, color: colors.ink },
});
