import type { GoogleTripMapProps } from './google_trip_map';
import { createMapHandoff } from './map_handoff';

export const fullscreenMap = createMapHandoff<GoogleTripMapProps>();
