import { useLocalSearchParams } from 'expo-router';
import RequestsScreen from '../../../(tabs)/requests';

export default function TripRequestsScreen() {
  const { tripName } = useLocalSearchParams<{ tripName: string }>();
  return <RequestsScreen tripName={tripName} />;
}
