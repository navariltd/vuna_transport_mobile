import type { DeliveryStop } from './types';

export type Coordinate = [longitude: number, latitude: number];
export type TripMapProps = {
  stops: DeliveryStop[];
  activeStop?: string;
  height?: number;
  fullscreen?: boolean;
  onClose?: () => void;
  tripName?: string;
  navigationTripName?: string;
};

export function stopNavigationTarget(provider: string | undefined, platform: string, tripName: string, stop: DeliveryStop, address: string) {
  if (provider === 'google' && platform === 'android') {
    return { kind: 'internal' as const, url: `/trips/${encodeURIComponent(tripName)}/navigation/${encodeURIComponent(stop.name)}` };
  }
  const point = stopCoordinate(stop);
  const destination = point ? `${point[1]},${point[0]}` : address.trim();
  if (!destination) throw new Error('This stop has no destination coordinates or address.');
  return { kind: 'external' as const, url: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving&dir_action=navigate` };
}

// URLs carry identifiers only. Stop details and loaded road geometry remain in
// the in-memory handoff and are checked against the signed-in trip on opening.
export function navigationMapPath(props: TripMapProps, mapId: string): string | null {
  const trip = props.navigationTripName || props.tripName;
  if (!trip) return null;
  const rows = mappedStops(props.stops);
  const target = rows.find((row) => row.stop.name === props.activeStop) || rows[0];
  if (!target) return null;
  return `/trips/${encodeURIComponent(trip)}/navigation/${encodeURIComponent(target.stop.name)}?mapId=${encodeURIComponent(mapId)}&overview=${props.stops.length > 1 ? '1' : '0'}`;
}

export function stopCoordinate(stop: Pick<DeliveryStop, 'lat' | 'lng'>): Coordinate | null {
  const values = [stop.lng, stop.lat];
  if (values.some((value) => value == null || typeof value === 'boolean' || String(value).trim() === '')) return null;
  const [longitude, latitude] = values.map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return [longitude, latitude];
}

export function coordinateBounds(coordinates: Coordinate[]): [number, number, number, number] {
  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}

export function stopLabel(stop: DeliveryStop): string {
  const address = stop.address_details;
  const destination = stop.location_label || stop.customer || stop.vuna_depot_names || address?.address_title || 'Delivery stop';
  const locality = address?.city || address?.county || address?.state;
  return locality && locality !== destination ? `${destination} · ${locality}` : destination;
}

export function mappedStops(stops: DeliveryStop[]) {
  return stops.flatMap((stop, index) => {
    const coordinate = stopCoordinate(stop);
    return coordinate ? [{ stop, coordinate, number: stop.idx || index + 1 }] : [];
  });
}
