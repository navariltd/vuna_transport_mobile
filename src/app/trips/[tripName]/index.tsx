import { Ionicons } from '@expo/vector-icons';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DeliveryStopCard, ScreenHeader, SemiCircleTripProgress, StateView, StatusBadge, formatDateTime } from '../../../features/trips/components';
import { getTripDetails, startDeliveryTrip } from '../../../features/trips/api';
import type { DeliveryTrip } from '../../../features/trips/types';
import { colors, spacing } from '../../../shared/theme';

export default function DeliveryTripScreen() {
  const { tripName, focusStop } = useLocalSearchParams<{ tripName: string; focusStop?: string }>();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [trip, setTrip] = useState<DeliveryTrip | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requestMenuOpen, setRequestMenuOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

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

  const startTrip = async () => {
    if (!tripName || actionLoading) return;
    setActionLoading(true);
    setActionError('');
    try {
      const result = await startDeliveryTrip(tripName);
      setTrip((current) => current ? { ...current, ...result.trip } : current);
      await load();
    } catch (exception) {
      setActionError(exception instanceof Error ? exception.message : 'Could not start the Delivery Trip.');
    } finally {
      setActionLoading(false);
    }
  };

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

        {trip.actions?.can_start ? <Pressable disabled={actionLoading} onPress={() => void startTrip()} style={[styles.primaryAction, actionLoading && styles.actionDisabled]}>
          <Ionicons color={colors.surface} name="play" size={19} />
          <Text style={styles.primaryActionText}>{actionLoading ? 'Starting trip…' : 'Start trip'}</Text>
        </Pressable> : null}
        {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Delivery stops</Text>
          <View style={styles.headerActions}>
            {trip.actions?.can_report_incident ? <Pressable onPress={() => router.push(`/trips/${encodeURIComponent(trip.name)}/incidents` as never)} style={styles.incidentButton}>
              <Ionicons color={colors.danger} name="warning-outline" size={17} />
              <Text style={styles.incidentButtonText}>Incident</Text>
            </Pressable> : null}
            <Pressable onPress={() => setRequestMenuOpen(true)} style={styles.requestButton}>
              <Ionicons color={colors.surface} name="add" size={18} />
              <Text style={styles.requestButtonText}>Request</Text>
            </Pressable>
          </View>
        </View>
        {trip.stops.map((stop) => (
          <DeliveryStopCard
            current={stop.name === currentStop}
            key={stop.name}
            onPress={() => router.push(`/trips/${encodeURIComponent(trip.name)}/stops/${encodeURIComponent(stop.name)}` as never)}
            stop={stop}
          />
        ))}
      </ScrollView>
      <Modal animationType="fade" onRequestClose={() => setRequestMenuOpen(false)} transparent visible={requestMenuOpen}>
        <Pressable onPress={() => setRequestMenuOpen(false)} style={styles.modalBackdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.requestSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>New request</Text>
            <Text style={styles.sheetSubtitle}>Choose what you need for {trip.name}.</Text>
            <Pressable onPress={() => { setRequestMenuOpen(false); router.push(`/trips/${encodeURIComponent(trip.name)}/requests/material-request` as never); }} style={styles.requestOption}>
              <View style={styles.requestIcon}><Ionicons color={colors.ink} name="cube-outline" size={22} /></View>
              <View style={styles.requestCopy}><Text style={styles.requestTitle}>Material Request</Text><Text style={styles.requestDescription}>Request an item for purchase or warehouse issue.</Text></View>
              <Ionicons color={colors.muted} name="chevron-forward" size={20} />
            </Pressable>
            <Pressable onPress={() => { setRequestMenuOpen(false); router.push(`/trips/${encodeURIComponent(trip.name)}/requests/expense-claim` as never); }} style={styles.requestOption}>
              <View style={styles.requestIcon}><Ionicons color={colors.ink} name="receipt-outline" size={22} /></View>
              <View style={styles.requestCopy}><Text style={styles.requestTitle}>Expense Claim</Text><Text style={styles.requestDescription}>Record a driver expense against this trip.</Text></View>
              <Ionicons color={colors.muted} name="chevron-forward" size={20} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.xl, paddingBottom: 48, paddingTop: 58 },
  tripOverview: { alignItems: 'center', flexDirection: 'row', gap: 16, marginTop: spacing.lg },
  tripDetails: { flex: 1 },
  tripHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  tripName: { color: colors.ink, flex: 1, fontFamily: 'Inter_700Bold', fontSize: 17 },
  vehicle: { color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 8 },
  departure: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 5 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, marginTop: spacing.xl },
  sectionTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 18 },
  primaryAction: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: 10, flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: spacing.xl, minHeight: 52 },
  primaryActionText: { color: colors.surface, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  actionDisabled: { opacity: 0.55 },
  actionError: { color: colors.danger, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, marginTop: 10 },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  incidentButton: { alignItems: 'center', borderColor: colors.danger, borderRadius: 99, borderWidth: 1, flexDirection: 'row', gap: 5, minHeight: 38, paddingHorizontal: 12 },
  incidentButtonText: { color: colors.danger, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  requestButton: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: 99, flexDirection: 'row', gap: 4, minHeight: 38, paddingHorizontal: 14 },
  requestButtonText: { color: colors.surface, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  modalBackdrop: { backgroundColor: 'rgba(9, 9, 11, 0.4)', flex: 1, justifyContent: 'flex-end' },
  requestSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: spacing.xl, paddingBottom: 38 },
  sheetHandle: { alignSelf: 'center', backgroundColor: colors.border, borderRadius: 99, height: 4, marginBottom: spacing.lg, width: 42 },
  sheetTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 20 },
  sheetSubtitle: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: spacing.lg, marginTop: 6 },
  requestOption: { alignItems: 'center', borderTopColor: colors.divider, borderTopWidth: 1, flexDirection: 'row', paddingVertical: 16 },
  requestIcon: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 12, height: 44, justifyContent: 'center', width: 44 },
  requestCopy: { flex: 1, marginLeft: 13 },
  requestTitle: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  requestDescription: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17, marginTop: 3 },
});
