import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { getSession, subscribeToSessionChange, type MobileSession } from '../../auth/session';
import { colors } from '../../shared/theme';
import { mappedStops, type TripMapProps } from './map_model';
import { OpenStreetTripMap } from './openstreet_trip_map';
import { getTripRoadRoute } from './api';
import { parseRoadRoute, type MobileRoadRoute } from './road_route_model';
import { CustomerGoogleMaps } from './google_maps_gate';

function MapUnavailable(props: TripMapProps) {
  const rows = mappedStops(props.stops);
  const point = (rows.find((row) => row.stop.name === props.activeStop) || rows[0])?.coordinate;
  return <View style={{ height: props.height || 250, padding: 24, justifyContent: 'center', gap: 12, backgroundColor: colors.surface }}>
    <Text style={{ color: colors.ink }}>Google Maps could not load. You can still complete this stop or use external directions.</Text>
    {point ? <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${point[1]},${point[0]}`).catch(() => {}); }}><Text style={{ color: colors.ink, textDecorationLine: 'underline' }}>Open directions</Text></Pressable> : null}
  </View>;
}

class MapBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

// Evaluate the native SDK only after configuring the customer's mobile key.
const NativeGoogleMap = lazy(() => import('./google_trip_map').then((module) => ({ default: module.GoogleTripMap })));

function RouteEnabledGoogleMap(props: TripMapProps) {
  const [roadRoute, setRoadRoute] = useState<MobileRoadRoute>();
  const [routeVisible, setRouteVisible] = useState(true);
  const [routeError, setRouteError] = useState('');
  const [routeLoading, setRouteLoading] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const manifest = JSON.stringify([props.tripName, props.stops.map((stop) => [stop.name, stop.idx, stop.address, stop.lat, stop.lng])]);
  useEffect(() => {
    generation.current += 1;
    busy.current = false;
    setRoadRoute(undefined);
    setRouteVisible(true);
    setRouteError('');
    setRouteLoading(false);
    return () => { generation.current += 1; };
  }, [manifest]);
  const showRoadRoute = async () => {
    if (!props.tripName || busy.current) return;
    if (roadRoute) { setRouteVisible(true); return; }
    busy.current = true;
    const request = generation.current;
    setRouteLoading(true);
    setRouteError('');
    try {
      const response = await getTripRoadRoute(props.tripName);
      if (request !== generation.current) return;
      setRoadRoute(parseRoadRoute(response, props.tripName, props.stops.map((stop) => stop.name)));
    } catch (error) {
      if (request === generation.current) setRouteError(error instanceof Error ? error.message : 'Road route unavailable. You can still complete your stops.');
    } finally {
      if (request === generation.current) { busy.current = false; setRouteLoading(false); }
    }
  };
  return <NativeGoogleMap {...props} roadRoute={routeVisible ? roadRoute : undefined} routeError={routeError} routeLoading={routeLoading}
    onShowRoute={props.tripName ? () => void showRoadRoute() : undefined} onHideRoute={() => setRouteVisible(false)} />;
}

export function TripMap(props: TripMapProps) {
  const [session, setSession] = useState<MobileSession | null | undefined>(undefined);
  useEffect(() => {
    let disposed = false;
    let changed = false;
    const unsubscribe = subscribeToSessionChange((next) => { changed = true; if (!disposed) setSession(next); });
    void getSession().then((next) => { if (!disposed && !changed) setSession(next); }).catch(() => { if (!disposed && !changed) setSession(null); });
    return () => { disposed = true; unsubscribe(); };
  }, []);
  // Never briefly show an old site's provider while SecureStore is loading.
  if (!session) return <View style={{ height: props.height || 250 }} />;
  const provider = session?.mapConfig?.provider || 'openstreetmap';
  if (provider !== 'google') return <OpenStreetTripMap key={`${session?.siteUrl}|${session?.user}|${provider}`} {...props} />;
  return <MapBoundary key={`${session?.siteUrl}|${session?.user}|${session?.sid}|${provider}`} fallback={<MapUnavailable {...props} />}><CustomerGoogleMaps><Suspense fallback={<View style={{ height: props.height || 250 }} />}><RouteEnabledGoogleMap {...props} /></Suspense></CustomerGoogleMaps></MapBoundary>;
}
