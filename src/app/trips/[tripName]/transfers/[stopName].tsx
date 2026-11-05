import { useLocalSearchParams } from 'expo-router';
import StopTasksScreen from '../../../../features/trips/stop_tasks_screen';
import TransportConfirmationScreen from '../../../../features/trips/transport_confirmation';

export default function StopWorkScreen() {
  const { taskName } = useLocalSearchParams<{ taskName?: string }>();
  return taskName ? <TransportConfirmationScreen /> : <StopTasksScreen />;
}
