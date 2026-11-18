import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { colors } from '../../shared/theme';
import { mappedStops, stopLabel, type TripMapProps } from './map_model';
import { mapStyles as styles } from './openstreet_trip_map';
import type { MobileRoadRoute } from './road_route_model';

type GoogleTripMapProps = TripMapProps & {
  roadRoute?: MobileRoadRoute;
  routeLoading?: boolean;
  routeError?: string;
  onShowRoute?: () => void;
  onHideRoute?: () => void;
};

export function GoogleTripMap({ stops, activeStop, height = 250, fullscreen = false, onClose, roadRoute, routeLoading, routeError, onShowRoute, onHideRoute }: GoogleTripMapProps) {
  const map = useRef<MapView>(null);
  const rows = useMemo(() => mappedStops(stops), [stops]);
  const coordinates = useMemo(() => rows.map(({ coordinate: [longitude, latitude] }) => ({ longitude, latitude })), [rows]);
  const routeCoordinates = useMemo(() => roadRoute ? [roadRoute.origin, ...roadRoute.segments.flat(), ...coordinates] : coordinates, [coordinates, roadRoute]);
  const [ready, setReady] = useState(false);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [location, setLocation] = useState<Location.LocationObjectCoords | null>(null);
  const [locationAllowed, setLocationAllowed] = useState(false);
  const [slow, setSlow] = useState(false);

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
    if (routeCoordinates.every((point) => point.latitude === routeCoordinates[0].latitude && point.longitude === routeCoordinates[0].longitude)) {
      map.current.animateCamera({ center: routeCoordinates[0], zoom: 15 }, { duration: 400 });
    } else {
      map.current.fitToCoordinates(routeCoordinates, { edgePadding: { top: 60, right: 64, bottom: 44, left: 44 }, animated: true });
    }
  }, [routeCoordinates, ready]);
  useEffect(() => { fitStops(); }, [fitStops]);

  const changeZoom = async (amount: number) => {
    try {
      const camera = await map.current?.getCamera();
      if (camera) map.current?.animateCamera({ zoom: Math.max(1, Math.min(20, (camera.zoom ?? 5) + amount)) });
    } catch { /* A map that has not finished mounting cannot be zoomed yet. */ }
  };
  const initial = coordinates[0] || { longitude: 37.9062, latitude: -0.0236 };
  const notice = !rows.length ? 'Delivery coordinates unavailable' : slow && !ready ? 'Map is taking longer to load. You can still complete this stop.' : null;
  return (
    <>
      <View style={fullscreen ? styles.fullscreenContainer : [styles.container, { height }]}>
        <MapView
          initialRegion={{ ...initial, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
          onMapReady={() => setReady(true)}
          provider={PROVIDER_GOOGLE}
          showsUserLocation={locationAllowed}
          showsMyLocationButton={false}
          toolbarEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          style={styles.map}
          ref={map}
        >
          {roadRoute?.segments.map((segment, index) => <Polyline key={`road-segment-${index}`} coordinates={segment} strokeColor="#2563EB" strokeWidth={4} />)}
          {rows.map(({ stop, number, coordinate: [longitude, latitude] }) => {
            const active = stop.name === activeStop;
            return (
              <Marker key={stop.name} identifier={stop.name} coordinate={{ longitude, latitude }} title={stopLabel(stop)} description={`Stop ${number}`}>
                <View style={styles.markerContainer}>
                  {active ? <View style={styles.markerLabel}><Text style={styles.markerLabelText} numberOfLines={1}>{stopLabel(stop)}</Text></View> : null}
                  <View style={[styles.marker, active && styles.activeMarker]}><Text style={[styles.markerText, active && styles.activeMarkerText]}>{number}</Text></View>
                </View>
              </Marker>
            );
          })}
        </MapView>
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
          <Pressable accessibilityLabel={fullscreen ? 'Close full screen map' : 'Open full screen map'} style={styles.controlButton} onPress={fullscreen ? onClose : () => setFullscreenVisible(true)}><Ionicons color={colors.ink} size={20} name={fullscreen ? 'contract-outline' : 'expand-outline'} /></Pressable>
          <Pressable accessibilityLabel="Zoom in" style={styles.controlButton} onPress={() => void changeZoom(1)}><Ionicons color={colors.ink} size={22} name="add" /></Pressable>
          <Pressable accessibilityLabel="Zoom out" style={styles.controlButton} onPress={() => void changeZoom(-1)}><Ionicons color={colors.ink} size={22} name="remove" /></Pressable>
          {location ? <Pressable accessibilityLabel="Show my location" style={styles.controlButton} onPress={() => map.current?.animateCamera({ center: location, zoom: 15 })}><Ionicons color={colors.ink} size={20} name="locate" /></Pressable> : null}
          {rows.length ? <Pressable accessibilityLabel="Show delivery stops" style={styles.controlButton} onPress={fitStops}><Ionicons color={colors.ink} size={20} name="map-outline" /></Pressable> : null}
        </View>
      </View>
      {!fullscreen && fullscreenVisible ? <Modal visible animationType="fade" onRequestClose={() => setFullscreenVisible(false)}><GoogleTripMap stops={stops} activeStop={activeStop} fullscreen roadRoute={roadRoute} routeError={routeError} routeLoading={routeLoading} onShowRoute={onShowRoute} onHideRoute={onHideRoute} onClose={() => setFullscreenVisible(false)} /></Modal> : null}
    </>
  );
}
