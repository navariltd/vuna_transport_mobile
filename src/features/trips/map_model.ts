import type { DeliveryStop } from './types';

export type Coordinate = [longitude: number, latitude: number];
export type TripMapProps = {
  stops: DeliveryStop[];
  activeStop?: string;
  height?: number;
  fullscreen?: boolean;
  onClose?: () => void;
  tripName?: string;
};

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
