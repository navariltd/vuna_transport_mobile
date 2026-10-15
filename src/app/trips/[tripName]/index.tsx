import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DeliveryStopCard, ScreenHeader, SemiCircleTripProgress, StateView, StatusBadge, formatDateTime } from '../../../features/trips/components';
import { getTripDetails } from '../../../features/trips/api';
import { TripMap } from '../../../features/trips/trip_map';
import type { DeliveryTrip } from '../../../features/trips/types';
import { colors, spacing } from '../../../shared/theme';

export default function DeliveryTripScreen() {
  const { tripName, focusStop } = useLocalSearchParams<{ tripName: string; focusStop?: string }>();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [trip, setTrip] = useState<DeliveryTrip | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!tripName) return;
    try {
      setError('');
      const result = await getTripDetails(tripName);
      setTrip(result.trip);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not load the Delivery Trip.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tripName]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!fontsLoaded || loading) return <View style={styles.screen}><StateView loading /></View>;
  if (error || !trip) return <View style={styles.screen}><ScreenHeader back title="Delivery Trip" /><StateView error={error || 'Delivery Trip not found.'} onRetry={load} /></View>;

  const currentStop = focusStop || trip.next_stop;
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.ink} />}
      >
        <ScreenHeader back title="Delivery Trip" />
        <View style={styles.map}><TripMap activeStop={currentStop} stops={trip.stops} /></View>
        <View style={styles.tripOverview}>
          <View style={styles.tripDetails}>
            <View style={styles.tripHeading}>
              <Text numberOfLines={1} style={styles.tripName}>{trip.name}</Text>
              <StatusBadge status={trip.status} />
            </View>
            <Text style={styles.vehicle}>{trip.vehicle || 'Vehicle not assigned'}</Text>
            {trip.departure_time ? <Text style={styles.departure}>Departure {formatDateTime(trip.departure_time)}</Text> : null}
          </View>
          <SemiCircleTripProgress completed={trip.completed_stop_count} total={trip.stop_count} />
        </View>

        <Text style={styles.sectionTitle}>Delivery stops</Text>
        {trip.stops.map((stop) => (
          <DeliveryStopCard
            current={stop.name === currentStop}
            key={stop.name}
            onPress={() => router.push(`/trips/${encodeURIComponent(trip.name)}/stops/${encodeURIComponent(stop.name)}` as never)}
            stop={stop}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.xl, paddingBottom: 48, paddingTop: 58 },
  map: { marginHorizontal: -spacing.xl, marginTop: spacing.lg },
  tripOverview: { alignItems: 'center', flexDirection: 'row', gap: 16, marginTop: spacing.lg },
  tripDetails: { flex: 1 },
  tripHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  tripName: { color: colors.ink, flex: 1, fontFamily: 'Inter_700Bold', fontSize: 17 },
  vehicle: { color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 8 },
  departure: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 5 },
  sectionTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 14, marginTop: spacing.xl },
});
