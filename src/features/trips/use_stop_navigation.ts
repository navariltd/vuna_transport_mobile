import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Alert, Platform } from 'react-native';
import { getSession } from '../../auth/session';
import { formatAddress } from './components';
import { stopNavigationTarget } from './map_model';
import type { DeliveryStop } from './types';

// Resolve the latest saved site preference at tap time, not from an old screen
// closure. External directions never initialize our Google SDK or request a key.
export function useStopNavigation(tripName: string, stop?: DeliveryStop | null) {
  const router = useRouter();
  return async () => {
    if (!stop) return;
    try {
      const session = await getSession();
      if (!session) throw new Error('Please sign in again before opening directions.');
      const target = stopNavigationTarget(session.mapConfig?.provider, Platform.OS, tripName, stop, formatAddress(stop));
      if (target.kind === 'internal') router.push(target.url as never);
      else await Linking.openURL(target.url);
    } catch (error) {
      Alert.alert('Directions unavailable', error instanceof Error ? error.message : 'Could not open directions.');
    }
  };
}
