import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getAssignedTrips } from '../../auth/session';
import { StatusBadge, TripProgress, formatDateTime } from '../../features/trips/components';
import type { DeliveryTrip } from '../../features/trips/types';
import { colors } from '../../shared/theme';
import { getOnboardingRecord } from '../../storage/onboarding';

export default function DashboardScreen() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [driverName, setDriverName] = useState('');
  const [message, setMessage] = useState('Your assigned trips will appear here.');
  const [trips, setTrips] = useState<DeliveryTrip[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const record = await getOnboardingRecord();
      if (!record) return router.replace('/');
      const result = await getAssignedTrips(record.installationId, record.deviceIdentifier);
      if (result.linked && result.driver) {
        setDriverName(result.driver.full_name);
        setTrips(result.trips || []);
        setMessage(result.trips?.length ? 'Your assigned delivery work.' : 'Your assigned trips will appear here.');
      } else {
        setMessage(result.message || 'Your driver profile needs administrator attention.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load your work profile.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  const activeTrips = trips
    .filter((trip) => !['Completed', 'Cancelled'].includes(trip.status))
    .sort((left, right) => tripStatusPriority(left.status) - tripStatusPriority(right.status));
  const completedTrips = trips
    .filter((trip) => trip.status === 'Completed')
    .sort((left, right) => (right.departure_time || '').localeCompare(left.departure_time || ''));

  if (!fontsLoaded) return <ActivityIndicator color="#111111" style={styles.loading} />;
  return <View style={styles.screen}>
    <StatusBar style="dark" />
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl colors={["#111111"]} onRefresh={() => { setRefreshing(true); void loadProfile(); }} refreshing={refreshing} tintColor="#111111" />}
    >
      <View style={styles.pageHeader}><Image source={require('../../../assets/icon.png')} style={styles.logo} /><Text style={styles.pageTitle}>Home</Text></View>
      {loading ? <DashboardSkeleton /> : <>
      <Text style={styles.greeting}>{driverName ? `Good day, ${driverName}.` : 'Good day.'}</Text>
      <Text style={styles.subtitle}>{message}</Text>
      {trips.length ? <>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active deliveries</Text>
          <Text style={styles.sectionCount}>{activeTrips.length}</Text>
        </View>
        {activeTrips.length
          ? activeTrips.map((trip) => <TripCard key={trip.name} trip={trip} />)
          : <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No active deliveries</Text>
            <Text style={styles.emptyText}>Your scheduled and in-progress trips will appear here.</Text>
          </View>}
        {completedTrips.length ? <View style={styles.completedSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showCompleted }}
            onPress={() => setShowCompleted((visible) => !visible)}
            style={styles.completedHeader}
          >
            <View style={styles.completedTitleRow}>
              <Text style={styles.completedTitle}>Completed deliveries</Text>
              <Text style={styles.sectionCount}>{completedTrips.length}</Text>
            </View>
            <Ionicons color={colors.muted} name={showCompleted ? 'chevron-up' : 'chevron-down'} size={20} />
          </Pressable>
          {showCompleted ? completedTrips.map((trip) => <TripCard key={trip.name} trip={trip} />) : null}
        </View> : null}
      </> : <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>No assigned trips yet</Text>
        <Text style={styles.emptyText}>When a Delivery Trip is assigned to you, its stops and delivery actions will be available here.</Text>
      </View>}
      </>}
    </ScrollView>
  </View>;
}

function DashboardSkeleton() {
  return <View accessibilityLabel="Loading assigned trips" accessibilityRole="progressbar" style={styles.skeleton}>
    <View style={[styles.skeletonBlock, styles.skeletonGreeting]} />
    <View style={[styles.skeletonBlock, styles.skeletonSubtitle]} />
    <View style={[styles.skeletonBlock, styles.skeletonSectionTitle]} />
    <View style={styles.skeletonCard}>
      <View style={[styles.skeletonBlock, styles.skeletonVehicle]} />
      <View style={[styles.skeletonBlock, styles.skeletonReference]} />
      <View style={[styles.skeletonBlock, styles.skeletonProgress]} />
    </View>
    <View style={styles.skeletonCard}>
      <View style={[styles.skeletonBlock, styles.skeletonVehicleShort]} />
      <View style={[styles.skeletonBlock, styles.skeletonReference]} />
      <View style={[styles.skeletonBlock, styles.skeletonProgress]} />
    </View>
  </View>;
}

function tripStatusPriority(status: string) {
  if (status === 'In Transit') return 0;
  if (status === 'Scheduled') return 1;
  return 2;
}

function TripCard({ trip }: { trip: DeliveryTrip }) {
  return <Pressable onPress={() => router.push(`/trips/${encodeURIComponent(trip.name)}` as never)} style={styles.tripCard}>
    <View style={styles.tripBody}>
      <View style={styles.vehicleRow}>
        <Text numberOfLines={1} style={styles.vehiclePlate}>{trip.vehicle || 'Vehicle not assigned'}</Text>
        <Text style={styles.stopCount}>{trip.stop_count} {trip.stop_count === 1 ? 'stop' : 'stops'}</Text>
      </View>
      <View style={styles.tripReferenceRow}>
        <Text numberOfLines={1} style={styles.tripName}>{trip.name}</Text>
        <StatusBadge status={trip.status} />
      </View>
      {trip.departure_time ? <Text style={styles.tripTime}>Departure {formatDateTime(trip.departure_time)}</Text> : null}
      <View style={styles.tripProgress}><TripProgress completed={trip.completed_stop_count || 0} total={trip.stop_count} /></View>
    </View>
    <Ionicons color={colors.faint} name="chevron-forward" size={22} />
  </Pressable>;
}

const styles = StyleSheet.create({
  loading: { backgroundColor: '#F7F7F5', flex: 1 },
  screen: { backgroundColor: '#F7F7F5', flex: 1 },
  content: { flexGrow: 1, padding: 28, paddingTop: 64 },
  pageHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  logo: { borderRadius: 7, height: 28, width: 28 },
  pageTitle: { color: '#111111', fontFamily: 'Inter_700Bold', fontSize: 20 },
  skeleton: { paddingTop: 30 },
  skeletonBlock: { backgroundColor: colors.divider, borderRadius: 7 },
  skeletonGreeting: { height: 35, width: '72%' },
  skeletonSubtitle: { height: 16, marginTop: 18, width: '58%' },
  skeletonSectionTitle: { height: 20, marginTop: 34, width: 150 },
  skeletonCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 18 },
  skeletonVehicle: { height: 23, width: '54%' },
  skeletonVehicleShort: { height: 23, width: '42%' },
  skeletonReference: { height: 14, marginTop: 14, width: '68%' },
  skeletonProgress: { height: 6, marginTop: 22, width: '100%' },
  greeting: { color: '#111111', fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 39, marginTop: 28 },
  subtitle: { color: '#6B6B6B', fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24, marginTop: 16 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 30 },
  sectionTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 18 },
  sectionCount: { backgroundColor: colors.divider, borderRadius: 12, color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 12, minWidth: 24, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3, textAlign: 'center' },
  completedSection: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 30, paddingTop: 6 },
  completedHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 50, paddingVertical: 8 },
  completedTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  completedTitle: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  emptyCard: { backgroundColor: '#FFFFFF', borderColor: '#D9D9D4', borderRadius: 16, borderWidth: 1, marginTop: 32, padding: 20 },
  emptyTitle: { color: '#111111', fontFamily: 'Inter_600SemiBold', fontSize: 17 },
  emptyText: { color: '#6B6B6B', fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 10 },
  tripCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#D9D9D4', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, marginTop: 18, padding: 18 },
  tripBody: { flex: 1 },
  vehicleRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  vehiclePlate: { color: colors.ink, flexShrink: 1, fontFamily: 'Inter_700Bold', fontSize: 20 },
  stopCount: { backgroundColor: colors.divider, borderRadius: 12, color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 11, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 },
  tripReferenceRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 9 },
  tripName: { color: '#111111', flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  tripTime: { color: '#6B6B6B', fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 6 },
  tripProgress: { marginTop: 16 },
});
