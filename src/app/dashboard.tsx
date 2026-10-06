import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getAssignedTrips } from '../auth/session';
import { MobileTabBar } from '../shared/mobile_tab_bar';
import { getOnboardingRecord } from '../storage/onboarding';

export default function DashboardScreen() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [driverName, setDriverName] = useState('Driver');
  const [message, setMessage] = useState('Your assigned trips will appear here.');
  const [trips, setTrips] = useState<Trip[]>([]);
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
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  if (!fontsLoaded) return <ActivityIndicator color="#111111" style={styles.loading} />;
  return <View style={styles.screen}>
    <StatusBar style="dark" />
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl colors={["#111111"]} onRefresh={() => { setRefreshing(true); void loadProfile(); }} refreshing={refreshing} tintColor="#111111" />}
    >
      <View style={styles.pageHeader}><Image source={require('../../assets/icon.png')} style={styles.logo} /><Text style={styles.pageTitle}>Home</Text></View>
      <Text style={styles.greeting}>Good day, {driverName}.</Text>
      <Text style={styles.subtitle}>{message}</Text>
      {trips.length ? trips.map((trip) => <TripCard key={trip.name} trip={trip} />) : <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>No assigned trips yet</Text>
        <Text style={styles.emptyText}>When a Delivery Trip is assigned to you, its stops and delivery actions will be available here.</Text>
      </View>}
    </ScrollView>
    <MobileTabBar />
  </View>;
}

type Trip = {
  name: string;
  status: string;
  vehicle?: string;
  departure_time?: string;
  stop_count: number;
  stops?: Array<{ customer?: string; delivery_note?: string; visited?: number }>;
};

function TripCard({ trip }: { trip: Trip }) {
  return <View style={styles.tripCard}>
    <View style={styles.tripHeader}><Text style={styles.tripName}>{trip.name}</Text><Text style={styles.tripStatus}>{trip.status}</Text></View>
    <Text style={styles.tripMeta}>{trip.vehicle || 'Vehicle not assigned'} · {trip.stop_count} {trip.stop_count === 1 ? 'stop' : 'stops'}</Text>
    {trip.departure_time ? <Text style={styles.tripTime}>Departure {trip.departure_time}</Text> : null}
    {trip.stops?.slice(0, 3).map((stop, index) => <View key={`${trip.name}-${index}`} style={styles.stopRow}><View style={[styles.stopDot, stop.visited ? styles.visited : null]} /><Text style={styles.stopText}>{stop.customer || 'Customer'}{stop.delivery_note ? ` · ${stop.delivery_note}` : ''}</Text></View>)}
    {trip.stop_count > 3 ? <Text style={styles.moreStops}>+ {trip.stop_count - 3} more stops</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  loading: { backgroundColor: '#F7F7F5', flex: 1 },
  screen: { backgroundColor: '#F7F7F5', flex: 1 },
  content: { flexGrow: 1, padding: 28, paddingTop: 64 },
  pageHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  logo: { borderRadius: 7, height: 28, width: 28 },
  pageTitle: { color: '#111111', fontFamily: 'Inter_700Bold', fontSize: 20 },
  greeting: { color: '#111111', fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 39, marginTop: 28 },
  subtitle: { color: '#6B6B6B', fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24, marginTop: 16 },
  emptyCard: { backgroundColor: '#FFFFFF', borderColor: '#D9D9D4', borderRadius: 16, borderWidth: 1, marginTop: 32, padding: 20 },
  emptyTitle: { color: '#111111', fontFamily: 'Inter_600SemiBold', fontSize: 17 },
  emptyText: { color: '#6B6B6B', fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 10 },
  tripCard: { backgroundColor: '#FFFFFF', borderColor: '#D9D9D4', borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 18 },
  tripHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  tripName: { color: '#111111', fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  tripStatus: { color: '#4D6B56', fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  tripMeta: { color: '#6B6B6B', fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 10 },
  tripTime: { color: '#6B6B6B', fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 6 },
  stopRow: { alignItems: 'center', borderTopColor: '#ECECE8', borderTopWidth: 1, flexDirection: 'row', marginTop: 12, paddingTop: 12 },
  stopDot: { backgroundColor: '#B9B9B2', borderRadius: 5, height: 10, marginRight: 10, width: 10 },
  visited: { backgroundColor: '#111111' },
  stopText: { color: '#111111', flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13 },
  moreStops: { color: '#6B6B6B', fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 12 },
});
