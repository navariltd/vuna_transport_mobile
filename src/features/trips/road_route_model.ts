export type MapPoint = { latitude: number; longitude: number };
export type MobileRoadRoute = { origin: MapPoint; segments: MapPoint[][]; returnToStart: boolean };

// Provider geometry stays in memory, outside offline manifests and SQLite caches.
export function decodePolyline(encoded: string): MapPoint[] {
  if (!/^[\x3f-\x7e]{2,200000}$/.test(encoded)) throw new Error('The road route line could not be displayed.');
  let offset = 0;
  let latitude = 0;
  let longitude = 0;
  const points: MapPoint[] = [];
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (offset >= encoded.length || shift > 30) throw new Error('The road route line is incomplete.');
      byte = encoded.charCodeAt(offset++) - 63;
      result += (byte & 31) * 2 ** shift;
      shift += 5;
    } while (byte >= 32);
    return result % 2 ? -(Math.floor(result / 2) + 1) : result / 2;
  };
  while (offset < encoded.length) {
    latitude += next();
    longitude += next();
    const point = { latitude: latitude / 1e5, longitude: longitude / 1e5 };
    if (Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180 || points.length >= 100000) throw new Error('The road route line is invalid.');
    points.push(point);
  }
  if (points.length < 2) throw new Error('The road route line is incomplete.');
  return points;
}

export function parseRoadRoute(value: unknown, tripName: string, stopNames: string[]): MobileRoadRoute {
  const row = value as Record<string, unknown> | null;
  if (!row || row.version !== 1 || row.provider !== 'google' || row.trip_name !== tripName
    || JSON.stringify(row.stop_order) !== JSON.stringify(stopNames)
    || typeof row.return_to_start !== 'boolean'
    || !Array.isArray(row.encoded_polylines) || !row.encoded_polylines.length || row.encoded_polylines.length > 8) {
    throw new Error('The trip route changed. Refresh the trip before showing its road route.');
  }
  const origin = row.origin as MapPoint | null;
  if (!origin || typeof origin.latitude !== 'number' || typeof origin.longitude !== 'number'
    || !Number.isFinite(origin.latitude) || !Number.isFinite(origin.longitude)
    || Math.abs(origin.latitude) > 90 || Math.abs(origin.longitude) > 180) throw new Error('The route origin is unavailable.');
  return { origin, returnToStart: row.return_to_start, segments: row.encoded_polylines.map((encoded) => {
    if (typeof encoded !== 'string') throw new Error('The road route line is invalid.');
    return decodePolyline(encoded);
  }) };
}
