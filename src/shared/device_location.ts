import { LocationManager } from '@maplibre/maplibre-react-native';

export type DeviceLocation = {
  status: 'Captured' | 'Permission Denied' | 'Unavailable' | 'Timed Out';
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  captured_at?: string;
};

/** One foreground fix at the action, never a planned address or a later sync location. */
export async function captureDeviceLocation(timeoutMs = 12000): Promise<DeviceLocation> {
  try {
    if (!await LocationManager.requestPermissions()) return { status: 'Permission Denied' };
    const started = Date.now();
    return await new Promise<DeviceLocation>((resolve) => {
      let settled = false;
      const finish = (result: DeviceLocation) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        LocationManager.removeListener(onLocation);
        resolve(result);
      };
      const onLocation = (position: { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }) => {
        const { latitude, longitude, accuracy } = position.coords;
        // MapLibre Android reports milliseconds; its iOS bridge reports seconds.
        const timestamp = position.timestamp < 100000000000 ? position.timestamp * 1000 : position.timestamp;
        if (![latitude, longitude, accuracy, timestamp].every(Number.isFinite)
          || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0
          || timestamp < started - 1000 || timestamp > Date.now() + 1000) return;
        finish({ status: 'Captured', latitude, longitude, accuracy, captured_at: new Date(timestamp).toISOString() });
      };
      const timer = setTimeout(() => finish({ status: 'Timed Out' }), timeoutMs);
      try {
        // Request fresh foreground updates even if the map previously used a distance filter.
        LocationManager.setMinDisplacement(0);
        LocationManager.addListener(onLocation);
        void LocationManager.getCurrentPosition().then((position) => {
          if (position) onLocation(position);
        }).catch(() => finish({ status: 'Unavailable' }));
      } catch { finish({ status: 'Unavailable' }); }
    });
  } catch { return { status: 'Unavailable' }; }
}
