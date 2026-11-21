import { requireOptionalNativeModule } from 'expo-modules-core';

type NativeMaps = { configure(site: string, apiKey: string): Promise<'ready' | 'restart_required' | 'unavailable'> };
export const nativeMaps = requireOptionalNativeModule<NativeMaps>('TransportMaps');
