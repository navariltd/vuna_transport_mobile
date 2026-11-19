import {
  AudioGuidanceMode, CameraPerspective, MapColorScheme, NavigationNightMode,
  NavigationProvider, NavigationSessionStatus, NavigationView,
  TaskRemovedBehavior, TravelMode, useNavigation,
  type MapViewController, type NavigationViewController,
} from '@googlemaps/react-native-navigation-sdk';
import * as Location from 'expo-location';
import { useKeepAwake } from 'expo-keep-awake';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { getNavigationDestination } from './api';
import { assertNavigationRoute, attachGuidanceView, createNavigationRun, parseNavigationDestination, prepareNavigationAccess } from './navigation_model';
import { mappedStops, stopCoordinate, stopLabel } from './map_model';
import { formatAddress } from './components';
import type { DeliveryStop } from './types';
import type { MobileRoadRoute } from './road_route_model';
import { colors, radius, spacing } from '../../shared/theme';

type Props = { tripName: string; stopName: string; stop: DeliveryStop; previewStops: DeliveryStop[]; previewRoute?: MobileRoadRoute; onReturn: () => void };
const terms = { title: 'Google Navigation', companyName: 'Navari', showOnlyDisclaimer: false };
// Native navigation is process-wide. A replacement screen waits for the old
// session's cleanup, including an authorization request still in flight.
let activeRun: ReturnType<typeof createNavigationRun> | null = null;

export function NativeNavigation(props: Props) {
  return <NavigationProvider termsAndConditionsDialogOptions={terms} taskRemovedBehavior={TaskRemovedBehavior.QUIT_SERVICE}>
    <Guidance {...props} />
  </NavigationProvider>;
}

function AwakeGuidance() {
  useKeepAwake('transport-navigation');
  return null;
}

function Guidance({ tripName, stopName, stop: destinationStop, previewStops, previewRoute, onReturn }: Props) {
  const focused = useIsFocused();
  const { navigationController: controller, setOnArrival, setOnLocationChanged } = useNavigation();
  const [message, setMessage] = useState('Checking navigation access…');
  const [available, setAvailable] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [locationAllowed, setLocationAllowed] = useState(false);
  const mapView = useRef<MapViewController | null>(null);
  const navigationView = useRef<NavigationViewController | null>(null);
  const initial = stopCoordinate(destinationStop);
  const [phase, setPhase] = useState<'ready' | 'starting' | 'guiding' | 'arrived'>('ready');
  const run = useRef<ReturnType<typeof createNavigationRun> | null>(null);
  const mounted = useRef(true);
  const visible = useRef(true);
  const screenFocused = useRef(focused);
  const systemPrompt = useRef(false);
  const cancelPrompt = useRef<(() => void) | null>(null);
  const busy = useRef(false);
  const cancelLocation = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    cancelPrompt.current?.();
    cancelLocation.current?.();
    return run.current?.dispose().catch(() => {});
  }, []);
  useEffect(() => {
    screenFocused.current = focused;
    visible.current = focused && AppState.currentState === 'active';
    if (!focused) {
      void stop();
      mapView.current = null; navigationView.current = null; setMapReady(false); setPhase('ready');
    }
  }, [focused, stop]);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void Location.getForegroundPermissionsAsync().then(({ granted }) => {
      if (!cancelled) setLocationAllowed(granted);
    }).catch(() => {});
    void getNavigationDestination(tripName, stopName).then((value) => {
      const destination = parseNavigationDestination(value, tripName, stopName);
      if (!cancelled) { setAvailable(true); setMessage(`Navigate to ${destination.title}`); }
    }).catch((error) => { if (!cancelled) setMessage(error instanceof Error ? error.message : 'Navigation unavailable.'); });
    const subscription = AppState.addEventListener('change', (state) => {
      // Foreground-only in this release; no background navigation service.
      // Android permission and Google terms activities are not a user leaving
      // the app. The prompt wrapper waits for a real foreground return.
      if (systemPrompt.current) return;
      if (state !== 'active') {
        visible.current = false;
        void stop();
        if (mounted.current) { setPhase('ready'); setMessage('Navigation stopped when the app left the foreground.'); }
      } else visible.current = screenFocused.current;
    });
    return () => { cancelled = true; mounted.current = false; visible.current = false; subscription.remove(); stop(); };
  }, [tripName, stopName, stop]);

  useEffect(() => {
    setOnArrival((event) => {
      if (!event.isFinalDestination || !mounted.current || !visible.current) return;
      stop();
      setPhase('arrived');
      setMessage('You have arrived. Return to the stop to record proof.');
    });
    return () => { setOnArrival(null); setOnLocationChanged(null); };
  }, [setOnArrival, setOnLocationChanged, stop]);

  // Keep one map mounted from preview through guidance. The previous view was
  // mounted after startGuidance, missing the SDK's navigation-ready callback.
  useEffect(() => {
    const map = mapView.current;
    if (!mapReady || !map || phase !== 'ready') return;
    let cancelled = false;
    void (async () => {
      map.clearMapView();
      const rows = mappedStops(previewStops);
      for (const { stop: row, coordinate: [lng, lat], number } of rows) {
        if (cancelled) return;
        await map.addMarker({ id: row.name, position: { lat, lng }, title: `${number} · ${stopLabel(row)}` });
      }
      for (const [index, segment] of (previewRoute?.segments || []).entries()) {
        if (cancelled) return;
        await map.addPolyline({ id: `route-${index}`, points: segment.map((point) => ({ lat: point.latitude, lng: point.longitude })), color: '#2563EB', width: 4 });
      }
      if (cancelled || !rows.length) return;
      const lats = rows.map((row) => row.coordinate[1]);
      const lngs = rows.map((row) => row.coordinate[0]);
      const south = Math.min(...lats), north = Math.max(...lats);
      const west = Math.min(...lngs), east = Math.max(...lngs);
      const span = Math.max(north - south, east - west, 0.005);
      map.moveCamera({ target: { lat: (south + north) / 2, lng: (west + east) / 2 }, zoom: Math.max(1, Math.min(15, Math.log2(180 / span))) });
    })().catch(() => { if (!cancelled) setMessage('Map preview unavailable. You can try navigation or return to the stop.'); });
    return () => { cancelled = true; };
  }, [mapReady, phase, previewStops, previewRoute]);

  const start = async () => {
    if (busy.current || !visible.current || !available || !mapReady || !navigationView.current) return;
    busy.current = true;
    setPhase('starting'); setMessage('Preparing navigation…');
    const current = createNavigationRun({
      prepare: async () => {
        await prepareNavigationAccess({
          getPermission: Location.getForegroundPermissionsAsync,
          requestPermission: Location.requestForegroundPermissionsAsync,
          termsAccepted: () => controller.areTermsAccepted(),
          showTerms: () => controller.showTermsAndConditionsDialog(),
          assertActive: () => {
            if (current.disposed || !mounted.current || !visible.current || AppState.currentState !== 'active') throw new Error('Navigation cancelled. Return to the map and try again.');
          },
          prompt: async (action) => {
            systemPrompt.current = true;
            try {
              const result = await action();
              if (current.disposed || !mounted.current || !screenFocused.current) throw new Error('Navigation cancelled.');
              // Permission promises may resolve just before Android resumes our
              // Activity. Wait for that resume; never start while truly away.
              if (AppState.currentState !== 'active') await new Promise<void>((resolve, reject) => {
                const release = () => { clearTimeout(timer); subscription.remove(); cancelPrompt.current = null; };
                const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') { release(); resolve(); } });
                const timer = setTimeout(() => { release(); reject(new Error('Return to the map to start navigation.')); }, 5000);
                cancelPrompt.current = () => { release(); reject(new Error('Navigation cancelled.')); };
                if (AppState.currentState === 'active') { release(); resolve(); }
              });
              return result;
            } finally {
              systemPrompt.current = false;
              visible.current = screenFocused.current && AppState.currentState === 'active';
            }
          },
        });
        setLocationAllowed(true);
        // Register before init: wait for the SDK's own current-position fix.
        let release: () => void = () => {};
        const fix = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { release(); reject(new Error('Current location unavailable. Check GPS and try again.')); }, 20000);
          release = () => { clearTimeout(timer); setOnLocationChanged(null); cancelLocation.current = null; };
          cancelLocation.current = () => { release(); reject(new Error('Navigation cancelled.')); };
          setOnLocationChanged((position) => {
            if (Number.isFinite(position.lat) && Number.isFinite(position.lng) && !(position.lat === 0 && position.lng === 0)) { release(); resolve(); }
          });
        });
        // Attach immediately so cancellation during init cannot reject unhandled.
        void fix.catch(() => {});
        const status = await controller.init();
        if (status !== NavigationSessionStatus.OK) {
          cancelLocation.current?.();
          throw new Error(status === NavigationSessionStatus.NOT_AUTHORIZED
            ? 'Ask your administrator to enable Navigation SDK for this app’s Google key.'
            : 'Google navigation could not initialize. Check internet, location permission and Google Play services.');
        }
        controller.startUpdatingLocation();
        if (mounted.current) setMessage('Waiting for your current location…');
        await fix;
      },
      authorize: async () => parseNavigationDestination(await getNavigationDestination(tripName, stopName, true), tripName, stopName),
      setDestination: async (destination) => {
        mapView.current?.clearMapView();
        const status = await controller.setDestinations([{ title: destination.title, position: { lat: destination.latitude, lng: destination.longitude } }],
          { routingOptions: { travelMode: TravelMode.DRIVING }, displayOptions: { showDestinationMarkers: true } });
        assertNavigationRoute(status);
      },
      guide: async () => {
        // Attach the UI and following camera before starting guidance. Merely
        // displaying a NavigationView is not enough to enable either one.
        await attachGuidanceView(navigationView.current, CameraPerspective.TILTED);
        if (current.disposed || !mounted.current || !visible.current) throw new Error('Navigation cancelled.');
        await controller.setAudioGuidanceSettings({ guidanceMode: AudioGuidanceMode.VOICE_ALERTS_AND_GUIDANCE, vibrationEnabled: true, bluetoothAudioEnabled: true });
        if (current.disposed || !mounted.current || !visible.current) throw new Error('Navigation cancelled.');
        await controller.startGuidance();
      },
      cleanup: async () => {
        cancelLocation.current?.();
        try { await controller.stopGuidance(); } catch { /* Initialization may have failed. */ }
        controller.stopUpdatingLocation();
        try { await controller.cleanup(); } catch { /* The provider may already be released. */ }
        try { await navigationView.current?.setNavigationUIEnabled(false); } catch { /* View may have been released. */ }
      },
    });
    run.current = current;
    try {
      const previous = activeRun;
      activeRun = current;
      await previous?.dispose();
      await current.start();
      if (!current.disposed && mounted.current && visible.current) { setPhase('guiding'); setMessage(''); }
    } catch (error) {
      if (mounted.current) { setPhase('ready'); setMessage(error instanceof Error ? error.message : 'Navigation unavailable.'); }
    } finally { busy.current = false; }
  };
  const end = async () => {
    stop();
    await run.current?.dispose().catch(() => {});
    if (mounted.current) { setPhase('ready'); setMessage('Navigation ended. Delivery has not been completed.'); }
  };
  return <View style={styles.container}>
    {phase === 'guiding' ? <AwakeGuidance /> : null}
    <View style={styles.map}>
      {focused ? <NavigationView
        mapType={1} mapColorScheme={MapColorScheme.LIGHT} navigationNightMode={NavigationNightMode.AUTO}
        initialCameraPosition={{ target: { lat: initial?.[1] ?? -0.0236, lng: initial?.[0] ?? 37.9062 }, zoom: initial ? 14 : 6 }}
        onMapViewControllerCreated={(view) => { mapView.current = view; }}
        onNavigationViewControllerCreated={(view) => { navigationView.current = view; }}
        onMapReady={() => setMapReady(true)}
        headerEnabled={phase === 'guiding'} footerEnabled={phase === 'guiding'}
        recenterButtonEnabled myLocationEnabled={locationAllowed} myLocationButtonEnabled
        mapToolbarEnabled={false} style={styles.container}
      /> : null}
      {!mapReady ? <View pointerEvents="none" style={styles.loading}><ActivityIndicator color={colors.ink} /><Text style={styles.hint}>Loading map…</Text></View> : null}
    </View>
    <View style={styles.panel}>
      {phase !== 'guiding' ? <View style={styles.destination}>
        <Text numberOfLines={1} style={styles.heading}>{stopLabel(destinationStop)}</Text>
        <Text numberOfLines={2} style={styles.hint}>{formatAddress(destinationStop)}</Text>
      </View> : null}
      {message && !(phase === 'ready' && message.startsWith('Navigate to ')) ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
      {phase === 'ready' ? <>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !available || !mapReady }} disabled={!available || !mapReady} style={[styles.button, (!available || !mapReady) && styles.disabled]} onPress={() => void start()}><Text style={styles.buttonText}>Start navigation</Text></Pressable>
        <Text style={styles.hint}>Keep this screen open. Directions do not confirm delivery or check truck restrictions.</Text>
      </> : null}
      {phase === 'starting' ? <View style={styles.actionRow}><ActivityIndicator color={colors.ink} /><Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => void end()}><Text style={styles.secondaryText}>Cancel</Text></Pressable></View> : null}
      {phase === 'guiding' ? <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => void end()}><Text style={styles.secondaryText}>End navigation</Text></Pressable> : null}
      {phase === 'arrived' ? <Pressable accessibilityRole="button" style={styles.button} onPress={onReturn}><Text style={styles.buttonText}>Return to stop</Text></Pressable> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 }, map: { flex: 1, minHeight: 150 },
  loading: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.background },
  destination: { gap: spacing.xs }, heading: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  panel: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm, backgroundColor: colors.surface },
  message: { color: colors.ink, fontSize: 13 }, hint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  button: { backgroundColor: colors.ink, minHeight: 48, padding: spacing.sm, borderRadius: radius.sm, justifyContent: 'center', alignItems: 'center' },
  disabled: { opacity: 0.4 }, buttonText: { color: colors.surface, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  secondaryButton: { minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center', alignItems: 'center' },
  secondaryText: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
