import { Ionicons } from '@expo/vector-icons';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { LocationManager } from '@maplibre/maplibre-react-native';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenHeader, StateView } from '../../../features/trips/components';
import { getTripIncidents, reportTripIncident, resolveTripIncident } from '../../../features/trips/api';
import type { MobileTripIncidents, VehicleIncidentSummary } from '../../../features/trips/types';
import { colors, radius, spacing } from '../../../shared/theme';

type Coordinate = { latitude: number; longitude: number };

export default function TripIncidentsScreen() {
  const { tripName } = useLocalSearchParams<{ tripName: string }>();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [data, setData] = useState<MobileTripIncidents | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [incidentType, setIncidentType] = useState('');
  const [severity, setSeverity] = useState('Medium');
  const [description, setDescription] = useState('');
  const [vehicleImmobilized, setVehicleImmobilized] = useState(false);
  const [cargoAffected, setCargoAffected] = useState(false);
  const [driverAffected, setDriverAffected] = useState(false);
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const [resolving, setResolving] = useState<VehicleIncidentSummary | null>(null);
  const [resolution, setResolution] = useState('');
  const requestId = useRef(Crypto.randomUUID());

  const load = useCallback(async () => {
    if (!tripName) return;
    try {
      setError('');
      setData(await getTripIncidents(tripName));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not load Vehicle Incidents.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tripName]);

  useEffect(() => { void load(); }, [load]);

  const attachCurrentLocation = async () => {
    const allowed = await LocationManager.requestPermissions();
    if (!allowed) return setError('Allow location access to attach your current position.');
    const position = await LocationManager.getCurrentPosition();
    if (!position) return setError('Your current location is not available yet.');
    setCoordinate({ latitude: position.coords.latitude, longitude: position.coords.longitude });
  };

  const submitIncident = async () => {
    if (!tripName || submitting) return;
    if (!incidentType) return setError('Select what happened.');
    if (!description.trim()) return setError('Describe what happened.');
    setSubmitting(true);
    setError('');
    try {
      await reportTripIncident(tripName, {
        cargo_affected: cargoAffected,
        description,
        driver_affected: driverAffected,
        incident_type: incidentType,
        latitude: coordinate?.latitude,
        longitude: coordinate?.longitude,
        request_id: requestId.current,
        severity,
        vehicle_immobilized: vehicleImmobilized,
      });
      requestId.current = Crypto.randomUUID();
      setShowForm(false);
      setIncidentType('');
      setSeverity('Medium');
      setDescription('');
      setVehicleImmobilized(false);
      setCargoAffected(false);
      setDriverAffected(false);
      setCoordinate(null);
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not report the Vehicle Incident.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitResolution = async () => {
    if (!tripName || !resolving || submitting) return;
    if (!resolution.trim()) return setError('Describe how the incident was resolved.');
    setSubmitting(true);
    setError('');
    try {
      await resolveTripIncident(tripName, resolving.name, resolution);
      setResolving(null);
      setResolution('');
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not resolve the Vehicle Incident.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!fontsLoaded || loading) return <View style={styles.screen}><StateView loading /></View>;
  if (!data) return <View style={styles.screen}><ScreenHeader back title="Vehicle Incidents" /><StateView error={error || 'Vehicle Incidents are unavailable.'} onRetry={load} /></View>;

  return <View style={styles.screen}>
    <StatusBar style="dark" />
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.ink} />}
    >
      <ScreenHeader back title="Vehicle Incidents" />
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}><Text style={styles.tripName}>{data.trip.name}</Text><Text style={styles.vehicle}>{data.trip.vehicle}</Text></View>
        <Pressable onPress={() => setShowForm((current) => !current)} style={styles.reportButton}><Ionicons color={colors.surface} name={showForm ? 'close' : 'add'} size={18} /><Text style={styles.reportButtonText}>{showForm ? 'Cancel' : 'Report'}</Text></Pressable>
      </View>

      {showForm ? <View style={styles.formCard}>
        <Text style={styles.formTitle}>What happened?</Text>
        <Text style={styles.label}>INCIDENT TYPE</Text>
        <View style={styles.chips}>{data.incident_types.map((option) => <Choice key={option} label={option} selected={incidentType === option} onPress={() => setIncidentType(option)} />)}</View>
        <Text style={styles.label}>SEVERITY</Text>
        <View style={styles.chips}>{data.severities.map((option) => <Choice key={option} label={option} selected={severity === option} onPress={() => setSeverity(option)} />)}</View>
        <Text style={styles.label}>DESCRIPTION</Text>
        <TextInput multiline onChangeText={setDescription} placeholder="Describe the event and immediate action taken" placeholderTextColor={colors.faint} style={styles.textArea} value={description} />
        <View style={styles.toggleList}>
          <Toggle label="Vehicle immobilized" onPress={() => setVehicleImmobilized((value) => !value)} selected={vehicleImmobilized} />
          <Toggle label="Cargo affected" onPress={() => setCargoAffected((value) => !value)} selected={cargoAffected} />
          <Toggle label="Driver affected" onPress={() => setDriverAffected((value) => !value)} selected={driverAffected} />
        </View>
        <Pressable onPress={() => void attachCurrentLocation()} style={styles.locationButton}><Ionicons color={colors.ink} name={coordinate ? 'checkmark-circle' : 'locate-outline'} size={19} /><Text style={styles.locationText}>{coordinate ? 'Current location attached' : 'Attach current location'}</Text></Pressable>
        <Pressable disabled={submitting} onPress={() => void submitIncident()} style={[styles.submitButton, submitting && styles.disabled]}><Text style={styles.submitText}>{submitting ? 'Reporting…' : 'Report incident'}</Text></Pressable>
      </View> : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.sectionTitle}>Trip incident history</Text>
      {data.incidents.length ? data.incidents.map((incident) => <IncidentCard incident={incident} key={incident.name} onResolve={() => { setError(''); setResolution(''); setResolving(incident); }} />) : <View style={styles.empty}><Ionicons color={colors.muted} name="shield-checkmark-outline" size={26} /><Text style={styles.emptyTitle}>No incidents reported</Text><Text style={styles.emptyText}>Events reported during this trip will appear here.</Text></View>}
    </ScrollView>

    <Modal animationType="fade" onRequestClose={() => setResolving(null)} transparent visible={Boolean(resolving)}>
      <View style={styles.modalBackdrop}><View style={styles.resolutionSheet}><Text style={styles.resolutionTitle}>Resolve incident</Text><Text style={styles.resolutionName}>{resolving?.name}</Text><TextInput multiline onChangeText={setResolution} placeholder="Explain how the incident was resolved" placeholderTextColor={colors.faint} style={styles.resolutionInput} value={resolution} />{error ? <Text style={styles.error}>{error}</Text> : null}<View style={styles.modalActions}><Pressable onPress={() => setResolving(null)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable disabled={submitting} onPress={() => void submitResolution()} style={[styles.resolveButton, submitting && styles.disabled]}><Text style={styles.resolveText}>{submitting ? 'Resolving…' : 'Resolve and submit'}</Text></Pressable></View></View></View>
    </Modal>
  </View>;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}

function Toggle({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.toggle}><Ionicons color={selected ? colors.ink : colors.faint} name={selected ? 'checkbox' : 'square-outline'} size={21} /><Text style={styles.toggleText}>{label}</Text></Pressable>;
}

function IncidentCard({ incident, onResolve }: { incident: VehicleIncidentSummary; onResolve: () => void }) {
  const resolved = ['Resolved', 'Closed'].includes(incident.resolution_status);
  return <View style={styles.incidentCard}><View style={styles.incidentTop}><View style={styles.incidentCopy}><Text style={styles.incidentType}>{incident.incident_type}</Text><Text style={styles.incidentName}>{incident.name} · {incident.severity}</Text></View><View style={[styles.status, resolved && styles.statusResolved]}><Text style={[styles.statusText, resolved && styles.statusTextResolved]}>{incident.resolution_status}</Text></View></View><Text style={styles.description}>{incident.description}</Text>{incident.vehicle_immobilized ? <Text style={styles.immobilized}>Vehicle immobilized</Text> : null}{incident.resolution ? <View style={styles.resolutionSummary}><Text style={styles.label}>RESOLUTION</Text><Text style={styles.description}>{incident.resolution}</Text></View> : null}{!resolved ? <Pressable onPress={onResolve} style={styles.resolveOutline}><Text style={styles.resolveOutlineText}>Record resolution</Text><Ionicons color={colors.ink} name="arrow-forward" size={17} /></Pressable> : null}</View>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 }, content: { padding: spacing.xl, paddingBottom: 48, paddingTop: 58 },
  headingRow: { alignItems: 'center', flexDirection: 'row', marginTop: spacing.xl }, headingCopy: { flex: 1 }, tripName: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 21 }, vehicle: { color: colors.muted, fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 5 },
  reportButton: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: 99, flexDirection: 'row', gap: 5, minHeight: 40, paddingHorizontal: 14 }, reportButtonText: { color: colors.surface, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  formCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, marginTop: spacing.xl, padding: spacing.md }, formTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 18 }, label: { color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 0.8, marginTop: 16 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 }, chip: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 99, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 }, chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink }, chipText: { color: colors.ink, fontFamily: 'Inter_500Medium', fontSize: 11 }, chipTextSelected: { color: colors.surface },
  textArea: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.ink, fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 8, minHeight: 110, padding: 13, textAlignVertical: 'top' }, toggleList: { borderTopColor: colors.divider, borderTopWidth: 1, marginTop: 16, paddingTop: 8 }, toggle: { alignItems: 'center', flexDirection: 'row', gap: 9, minHeight: 42 }, toggleText: { color: colors.ink, fontFamily: 'Inter_500Medium', fontSize: 13 },
  locationButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 12, minHeight: 46 }, locationText: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 12 }, submitButton: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: radius.sm, justifyContent: 'center', marginTop: 12, minHeight: 50 }, submitText: { color: colors.surface, fontFamily: 'Inter_600SemiBold', fontSize: 14 }, disabled: { opacity: 0.55 }, error: { color: colors.danger, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, marginTop: 12 },
  sectionTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 13, marginTop: spacing.xl }, incidentCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, marginBottom: 12, padding: spacing.md }, incidentTop: { alignItems: 'flex-start', flexDirection: 'row' }, incidentCopy: { flex: 1 }, incidentType: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 15 }, incidentName: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 }, status: { backgroundColor: colors.warningSoft, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 }, statusResolved: { backgroundColor: colors.successSoft }, statusText: { color: colors.warning, fontFamily: 'Inter_600SemiBold', fontSize: 10 }, statusTextResolved: { color: colors.success }, description: { color: colors.ink, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 12 }, immobilized: { color: colors.danger, fontFamily: 'Inter_600SemiBold', fontSize: 11, marginTop: 10 }, resolutionSummary: { borderTopColor: colors.divider, borderTopWidth: 1, marginTop: 13 }, resolveOutline: { alignItems: 'center', borderTopColor: colors.divider, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 13 }, resolveOutlineText: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  empty: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.xl }, emptyTitle: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 10 }, emptyText: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5, textAlign: 'center' },
  modalBackdrop: { backgroundColor: 'rgba(9,9,11,0.42)', flex: 1, justifyContent: 'flex-end' }, resolutionSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingBottom: 36 }, resolutionTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 20 }, resolutionName: { color: colors.muted, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 5 }, resolutionInput: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, color: colors.ink, fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 18, minHeight: 120, padding: 13, textAlignVertical: 'top' }, modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 }, cancelButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 }, cancelText: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 13 }, resolveButton: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: radius.sm, flex: 1.5, justifyContent: 'center', minHeight: 48 }, resolveText: { color: colors.surface, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});
