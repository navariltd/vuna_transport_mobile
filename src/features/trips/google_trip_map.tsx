import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter, useIsFocused } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';
import { MapColorScheme, MapView, type MapViewController } from '@googlemaps/react-native-navigation-sdk';
import { colors } from '../../shared/theme';
import { mappedStops, navigationMapPath, stopLabel, type TripMapProps } from './map_model';
import { mapStyles as styles } from './openstreet_trip_map';
import type { MobileRoadRoute } from './road_route_model';
import { fullscreenMap } from './fullscreen_map_store';

export type GoogleTripMapProps = TripMapProps & {
  roadRoute?: MobileRoadRoute;
  routeLoading?: boolean;
  routeError?: string;
  onShowRoute?: () => void;
  onHideRoute?: () => void;
};

export function GoogleTripMap(props: GoogleTripMapProps) {
  const router = useRouter();
  const focused = useIsFocused();
  const owner = useId();
  // Keep the source route state alive while removing only the native map. It
  // must not remain attached to an Activity after its screen is detached.
  useEffect(() => { fullscreenMap.update(owner, props); }, [owner, props]);
  useEffect(() => () => fullscreenMap.clearOwner(owner), [owner]);
  const expand = () => {
    const id = fullscreenMap.open(owner, props);
    // The Android fullscreen map is also the navigation surface. Expanding a
    // map never initializes guidance or makes a destination/route request.
    const path = Platform.OS === 'android' ? navigationMapPath(props, id) : null;
    router.push((path || `/map/${id}`) as never);
  };
  if (!focused) return <View style={{ height: props.height || 250 }} />;
  return <GoogleMapCanvas {...props} onExpand={expand} />;
}

function GoogleMapCanvas({ stops, activeStop, height = 250, fullscreen = false, onClose, roadRoute, routeLoading, routeError, onShowRoute, onHideRoute, onExpand }: GoogleTripMapProps & { onExpand: () => void }) {
  const map = useRef<MapViewController | null>(null);
  const rows = useMemo(() => mappedStops(stops), [stops]);
  const coordinates = useMemo(() => rows.map(({ coordinate: [longitude, latitude] }) => ({ longitude, latitude })), [rows]);
  const routeCoordinates = useMemo(() => roadRoute ? [roadRoute.origin, ...roadRoute.segments.flat(), ...coordinates] : coordinates, [coordinates, roadRoute]);
  const [ready, setReady] = useState(false);
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [locationAllowed, setLocationAllowed] = useState(false);
  const [slow, setSlow] = useState(false);
  const controllerCreated = useCallback((controller: MapViewController) => { map.current = controller; }, []);

  useEffect(() => {
    let cancelled = false;
    let subscription: Location.LocationSubscription | undefined;
    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (cancelled || !permission.granted) return;
      setLocationAllowed(true);
      const previous = await Location.getLastKnownPositionAsync();
      if (!cancelled && previous) setLocation(previous.coords);
      if (cancelled) return;
      subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 10000 }, (position) => {
        if (!cancelled) setLocation(position.coords);
      });
      if (cancelled) subscription.remove();
    })().catch(() => { /* Location services are optional; proof capture remains available. */ });
    return () => { cancelled = true; subscription?.remove(); };
  }, []);

  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(timer);
  }, [ready]);

  const fitStops = useCallback(() => {
    if (!ready || !map.current || !routeCoordinates.length) return;
    const latitudes = routeCoordinates.map((point) => point.latitude);
    const longitudes = routeCoordinates.map((point) => point.longitude);
    const south = Math.min(...latitudes), north = Math.max(...latitudes);
    const west = Math.min(...longitudes), east = Math.max(...longitudes);
    const span = Math.max(north - south, east - west, 0.005);
    map.current.moveCamera({ target: { lat: (south + north) / 2, lng: (west + east) / 2 }, zoom: Math.max(1, Math.min(15, Math.log2(180 / span))) });
  }, [routeCoordinates, ready]);
  useEffect(() => { fitStops(); }, [fitStops]);

  useEffect(() => {
    const controller = map.current;
    if (!ready || !controller) return;
    let cancelled = false;
    void (async () => {
      controller.clearMapView();
      for (const { stop, number, coordinate: [lng, lat] } of rows) {
        if (cancelled) return;
        await controller.addMarker({ id: stop.name, position: { lat, lng }, title: `${number} · ${stopLabel(stop)}`, snippet: stop.name === activeStop ? 'Selected stop' : `Stop ${number}` });
      }
      for (const [index, segment] of (roadRoute?.segments || []).entries()) {
        if (cancelled) return;
        await controller.addPolyline({ id: `route-${index}`, points: segment.map((point) => ({ lat: point.latitude, lng: point.longitude })), color: '#2563EB', width: 4 });
      }
    })().catch(() => { /* Map disposal must not interrupt proof capture. */ });
    return () => { cancelled = true; };
  }, [ready, rows, activeStop, roadRoute]);

  const changeZoom = async (amount: number) => {
    try {
      const camera = await map.current?.getCameraPosition();
      if (camera) map.current?.moveCamera({ ...camera, zoom: Math.max(1, Math.min(20, (camera.zoom ?? 5) + amount)) });
    } catch { /* A map that has not finished mounting cannot be zoomed yet. */ }
  };
  const initial = coordinates[0] || { longitude: 37.9062, latitude: -0.0236 };
  const notice = !rows.length ? 'Delivery coordinates unavailable' : slow && !ready ? 'Map is taking longer to load. You can still complete this stop.' : null;
  return (
    <>
      <View style={fullscreen ? styles.fullscreenContainer : [styles.container, { height }]}>
        <MapView
          mapType={1}
          mapColorScheme={MapColorScheme.LIGHT}
          initialCameraPosition={{ target: { lat: initial.latitude, lng: initial.longitude }, zoom: 12 }}
          onMapReady={() => setReady(true)}
          myLocationEnabled={locationAllowed}
          myLocationButtonEnabled={false}
          mapToolbarEnabled={false}
          rotateGesturesEnabled={false}
          tiltGesturesEnabled={false}
          style={styles.map}
          onMapViewControllerCreated={controllerCreated}
        />
        {onShowRoute ? <View style={{ position: 'absolute', left: 10, top: fullscreen ? 44 : 10, maxWidth: '72%' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={roadRoute ? 'Hide road route' : 'Show road route'} disabled={routeLoading} onPress={roadRoute ? onHideRoute : onShowRoute}
            style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: colors.ink }}>{routeLoading ? 'Loading road route…' : roadRoute ? 'Hide road route' : 'Show road route'}</Text>
          </Pressable>
          {roadRoute ? <Text style={{ color: colors.ink, backgroundColor: colors.surface, padding: 4, fontSize: 11 }}>Planned stops · Not turn-by-turn navigation</Text> : null}
          {routeError ? <Text accessibilityRole="alert" numberOfLines={4} style={{ color: colors.ink, backgroundColor: colors.surface, padding: 8 }}>{routeError}</Text> : null}
        </View> : null}
        {notice ? <View pointerEvents="none" style={[styles.notice, { bottom: 36, maxWidth: '80%' }]}><Text style={styles.noticeText}>{notice}</Text></View> : null}
        <View style={[styles.controls, fullscreen && styles.fullscreenControls]}>
          <Pressable accessibilityLabel={fullscreen ? 'Close full screen map' : 'Open full screen map'} style={styles.controlButton} onPress={fullscreen ? onClose : onExpand}><Ionicons color={colors.ink} size={20} name={fullscreen ? 'contract-outline' : 'expand-outline'} /></Pressable>
          <Pressable accessibilityLabel="Zoom in" style={styles.controlButton} onPress={() => void changeZoom(1)}><Ionicons color={colors.ink} size={22} name="add" /></Pressable>
          <Pressable accessibilityLabel="Zoom out" style={styles.controlButton} onPress={() => void changeZoom(-1)}><Ionicons color={colors.ink} size={22} name="remove" /></Pressable>
          {location ? <Pressable accessibilityLabel="Show my location" style={styles.controlButton} onPress={() => map.current?.moveCamera({ target: { lat: location.latitude, lng: location.longitude }, zoom: 15 })}><Ionicons color={colors.ink} size={20} name="locate" /></Pressable> : null}
          {rows.length ? <Pressable accessibilityLabel="Show delivery stops" style={styles.controlButton} onPress={fitStops}><Ionicons color={colors.ink} size={20} name="map-outline" /></Pressable> : null}
        </View>
      </View>
    </>
  );
}
