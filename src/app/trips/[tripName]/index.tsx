import { Ionicons } from '@expo/vector-icons';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DeliveryStopCard, ScreenHeader, StateView, StatusBadge, TripProgress, formatDateTime } from '../../../features/trips/components';
import { getTripDetails } from '../../../features/trips/api';
import type { DeliveryTrip } from '../../../features/trips/types';
import { colors, radius, spacing } from '../../../shared/theme';

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
        <View style={styles.summary}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryTitleWrap}>
              <Text style={styles.tripName}>{trip.name}</Text>
              <Text style={styles.vehicle}>{trip.vehicle || 'Vehicle not assigned'}</Text>
            </View>
            <StatusBadge status={trip.status} />
          </View>
          {trip.departure_time ? <Text style={styles.departure}>Departure {formatDateTime(trip.departure_time)}</Text> : null}
          <View style={styles.progress}><TripProgress completed={trip.completed_stop_count} total={trip.stop_count} /></View>
        </View>

        <View style={styles.routePanel}>
          <View style={styles.routeIcon}><Ionicons color={colors.surface} name="navigate" size={22} /></View>
          <View style={styles.routeCopy}>
            <Text style={styles.routeTitle}>Trip route</Text>
            <Text style={styles.routeMeta}>{trip.stop_count} stops{trip.total_distance ? ` · ${trip.total_distance} ${trip.uom || ''}` : ''}</Text>
          </View>
          <Ionicons color={colors.faint} name="map-outline" size={24} />
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
  summary: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, marginTop: spacing.lg, padding: spacing.lg },
  summaryHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  summaryTitleWrap: { flex: 1 },
  tripName: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 21 },
  vehicle: { color: colors.muted, fontFamily: 'Inter_500Medium', fontSize: 14, marginTop: 7 },
  departure: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 14 },
  progress: { marginTop: 20 },
  routePanel: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: radius.lg, flexDirection: 'row', marginTop: 14, padding: spacing.lg },
  routeIcon: { alignItems: 'center', borderColor: '#444444', borderRadius: 20, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  routeCopy: { flex: 1, marginHorizontal: 14 },
  routeTitle: { color: colors.surface, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  routeMeta: { color: '#B9B9B2', fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  sectionTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 14, marginTop: spacing.xl },
});
