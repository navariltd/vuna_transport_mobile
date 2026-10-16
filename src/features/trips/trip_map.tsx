import { Camera, type CameraRef, LocationManager, Map, Marker, UserLocation } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../shared/theme';
import type { DeliveryStop } from './types';

const DEFAULT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/bright';
const KENYA_CENTER: [number, number] = [37.9062, -0.0236];

type Coordinate = [longitude: number, latitude: number];

type TripMapProps = {
  stops: DeliveryStop[];
  activeStop?: string;
  height?: number;
  fullscreen?: boolean;
  onClose?: () => void;
};

function stopCoordinate(stop: DeliveryStop): Coordinate | null {
  const latitude = Number(stop.lat);
  const longitude = Number(stop.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return [longitude, latitude];
}

function coordinateBounds(coordinates: Coordinate[]): [number, number, number, number] {
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}

function stopLabel(stop: DeliveryStop): string {
  const address = stop.address_details;
  const destination = stop.customer || address?.address_title || 'Delivery stop';
  const locality = address?.city || address?.county || address?.state;

  return locality && locality !== destination ? `${destination} · ${locality}` : destination;
}

export function TripMap({ stops, activeStop, height = 250, fullscreen = false, onClose }: TripMapProps) {
  const camera = useRef<CameraRef>(null);
  const [mapReady, setMapReady] = useState(false);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [zoom, setZoom] = useState(5);
  const [locationAllowed, setLocationAllowed] = useState(false);
  const [deviceCoordinate, setDeviceCoordinate] = useState<Coordinate | null>(null);

  const mappedStops = useMemo(
    () => stops.map((stop) => ({ stop, coordinate: stopCoordinate(stop) })).filter((row): row is { stop: DeliveryStop; coordinate: Coordinate } => Boolean(row.coordinate)),
    [stops],
  );
  const stopCoordinates = useMemo(() => mappedStops.map((row) => row.coordinate), [mappedStops]);

  useEffect(() => {
    let cancelled = false;
    let listening = false;
    const handleLocation = (position: { coords: { longitude: number; latitude: number } }) => {
      if (!cancelled) setDeviceCoordinate([position.coords.longitude, position.coords.latitude]);
    };

    void LocationManager.requestPermissions().then(async (allowed) => {
      if (cancelled) return;
      setLocationAllowed(allowed);
      if (!allowed) return;
      LocationManager.addListener(handleLocation);
      listening = true;
      const position = await LocationManager.getCurrentPosition();
      if (position) handleLocation(position);
    });

    return () => {
      cancelled = true;
      if (listening) LocationManager.removeListener(handleLocation);
    };
  }, []);

  const fitStops = useCallback((animated = true) => {
    if (!mapReady || !camera.current || !stopCoordinates.length) return;
    if (stopCoordinates.length === 1) {
      camera.current.easeTo({ center: stopCoordinates[0], duration: animated ? 500 : 0, zoom: 15 });
      return;
    }
    camera.current.fitBounds(coordinateBounds(stopCoordinates), {
      duration: animated ? 500 : 0,
      padding: { top: 44, right: 44, bottom: 44, left: 44 },
    });
  }, [mapReady, stopCoordinates]);

  useEffect(() => {
    fitStops(false);
  }, [fitStops]);

  const showMyLocation = () => {
    if (deviceCoordinate && camera.current) {
      camera.current.easeTo({ center: deviceCoordinate, duration: 500, zoom: 15 });
    }
  };

  const changeZoom = (amount: number) => {
    camera.current?.zoomTo(Math.max(1, Math.min(20, zoom + amount)), { duration: 250 });
  };

  const initialViewState = stopCoordinates.length === 1
    ? { center: stopCoordinates[0], zoom: 15 }
    : stopCoordinates.length > 1
      ? { bounds: coordinateBounds(stopCoordinates), padding: { top: 44, right: 44, bottom: 44, left: 44 } }
      : { center: KENYA_CENTER, zoom: 5 };

  return (
    <>
      <View style={fullscreen ? styles.fullscreenContainer : [styles.container, { height }]}>
        <Map
          attribution
          attributionPosition={{ bottom: 6, right: 6 }}
          logo={false}
          mapStyle={process.env.EXPO_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE}
          onDidFinishLoadingStyle={() => setMapReady(true)}
          onRegionDidChange={(event) => setZoom(event.nativeEvent.zoom)}
          style={styles.map}
          touchPitch={false}
          touchRotate={false}
        >
          <Camera initialViewState={initialViewState} ref={camera} />
          {locationAllowed ? <UserLocation accuracy heading minDisplacement={10} /> : null}
          {mappedStops.map(({ stop, coordinate }, index) => {
            const active = stop.name === activeStop;
            return (
              <Marker anchor="bottom" id={`delivery-stop-${stop.name}`} key={stop.name} lngLat={coordinate}>
                <View style={styles.markerContainer}>
                  {(active || zoom >= 11) ? (
                    <View style={styles.markerLabel}>
                      <Text numberOfLines={1} style={styles.markerLabelText}>{stopLabel(stop)}</Text>
                    </View>
                  ) : null}
                  <View style={[styles.marker, active && styles.activeMarker]}>
                    <Text style={[styles.markerText, active && styles.activeMarkerText]}>{stop.idx || index + 1}</Text>
                  </View>
                </View>
              </Marker>
            );
          })}
        </Map>

        {!mappedStops.length ? (
          <View pointerEvents="none" style={styles.notice}>
            <Ionicons color={colors.muted} name="location-outline" size={18} />
            <Text style={styles.noticeText}>Delivery coordinates unavailable</Text>
          </View>
        ) : null}

        <View style={[styles.controls, fullscreen && styles.fullscreenControls]}>
          <Pressable
            accessibilityLabel={fullscreen ? 'Close full screen map' : 'Open full screen map'}
            onPress={fullscreen ? onClose : () => setFullscreenVisible(true)}
            style={styles.controlButton}
          >
            <Ionicons color={colors.ink} name={fullscreen ? 'contract-outline' : 'expand-outline'} size={20} />
          </Pressable>
          <View style={styles.zoomControls}>
            <Pressable accessibilityLabel="Zoom in" onPress={() => changeZoom(1)} style={styles.zoomButton}>
              <Ionicons color={colors.ink} name="add" size={22} />
            </Pressable>
            <View style={styles.zoomDivider} />
            <Pressable accessibilityLabel="Zoom out" onPress={() => changeZoom(-1)} style={styles.zoomButton}>
              <Ionicons color={colors.ink} name="remove" size={22} />
            </Pressable>
          </View>
          {deviceCoordinate ? (
            <Pressable accessibilityLabel="Show my location" onPress={showMyLocation} style={styles.controlButton}>
              <Ionicons color={colors.ink} name="locate" size={20} />
            </Pressable>
          ) : null}
          {stopCoordinates.length ? (
            <Pressable accessibilityLabel="Show delivery stops" onPress={() => fitStops()} style={styles.controlButton}>
              <Ionicons color={colors.ink} name="map-outline" size={20} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {!fullscreen ? (
        <Modal
          animationType="fade"
          onRequestClose={() => setFullscreenVisible(false)}
          statusBarTranslucent
          visible={fullscreenVisible}
        >
          <TripMap
            activeStop={activeStop}
            fullscreen
            onClose={() => setFullscreenVisible(false)}
            stops={stops}
          />
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#E5E7E2', overflow: 'hidden', position: 'relative' },
  fullscreenContainer: { backgroundColor: '#E5E7E2', flex: 1, position: 'relative' },
  map: { flex: 1 },
  markerContainer: { alignItems: 'center' },
  markerLabel: { backgroundColor: 'rgba(255,255,255,0.96)', borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, marginBottom: 6, maxWidth: 210, paddingHorizontal: 9, paddingVertical: 5 },
  markerLabelText: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  marker: { alignItems: 'center', backgroundColor: colors.ink, borderColor: colors.surface, borderRadius: 18, borderWidth: 3, height: 36, justifyContent: 'center', width: 36 },
  activeMarker: { backgroundColor: colors.surface, borderColor: colors.ink },
  markerText: { color: colors.surface, fontFamily: 'Inter_700Bold', fontSize: 13 },
  activeMarkerText: { color: colors.ink },
  controls: { gap: 8, position: 'absolute', right: 10, top: 10 },
  fullscreenControls: { top: 44 },
  controlButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, elevation: 2, height: 40, justifyContent: 'center', shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, width: 40 },
  zoomControls: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, elevation: 2, overflow: 'hidden', shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3 },
  zoomButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  zoomDivider: { backgroundColor: colors.border, height: 1, marginHorizontal: 8 },
  notice: { alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: radius.sm, bottom: 16, flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingVertical: 9, position: 'absolute' },
  noticeText: { color: colors.muted, fontFamily: 'Inter_500Medium', fontSize: 12 },
});
