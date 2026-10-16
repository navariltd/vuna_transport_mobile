import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenHeader, StateView } from '../features/trips/components';
import { useConnectivity } from '../offline/connectivity';
import {
  clearCompletedOfflineOperations,
  getOfflineOperations,
  type OfflineOperation,
  type OfflineOperationStatus,
  updateOfflineOperation,
} from '../offline/outbox';
import {
  type OfflinePODPayload,
  synchronizeOfflineOperation,
  synchronizePendingOperations,
} from '../offline/sync';
import { colors, radius, spacing } from '../shared/theme';

export default function SyncCenterScreen() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const { isOffline } = useConnectivity();
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeOperation, setActiveOperation] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setOperations(await getOfflineOperations());
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Could not load synchronization history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const counts = useMemo(() => operations.reduce<Record<OfflineOperationStatus, number>>(
    (summary, operation) => ({ ...summary, [operation.status]: summary[operation.status] + 1 }),
    { Pending: 0, Syncing: 0, Failed: 0, 'Needs Attention': 0, Completed: 0 },
  ), [operations]);
  const outstanding = counts.Pending + counts.Syncing + counts.Failed + counts['Needs Attention'];
  const automaticallyRetryable = counts.Pending + counts.Failed;

  const syncAll = async () => {
    if (isOffline) return Alert.alert('You are offline', 'Connect to the internet before synchronizing.');
    setSyncing(true);
    try {
      await synchronizePendingOperations();
    } finally {
      setSyncing(false);
      await load();
    }
  };

  const retry = async (operation: OfflineOperation) => {
    if (isOffline) return Alert.alert('You are offline', 'Connect to the internet before retrying.');
    setActiveOperation(operation.operationId);
    try {
      await updateOfflineOperation(operation.operationId, { status: 'Pending', lastError: null });
      await synchronizeOfflineOperation(operation.operationId);
    } catch (exception) {
      Alert.alert('Could not synchronize', exception instanceof Error ? exception.message : 'Please try again.');
    } finally {
      setActiveOperation(null);
      await load();
    }
  };

  const clearHistory = () => Alert.alert(
    'Clear completed history?',
    'This removes completed synchronization records from this device. It does not delete server documents.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearCompletedOfflineOperations();
          await load();
        },
      },
    ],
  );

  if (!fontsLoaded || loading) return <View style={styles.screen}><StateView loading /></View>;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={() => { setRefreshing(true); void load(); }} refreshing={refreshing} tintColor={colors.ink} />}
      >
        <ScreenHeader back title="Sync Center" />
        <View style={[styles.connection, isOffline ? styles.connectionOffline : styles.connectionOnline]}>
          <Ionicons color={isOffline ? colors.warning : colors.success} name={isOffline ? 'cloud-offline-outline' : 'cloud-done-outline'} size={20} />
          <View style={styles.connectionCopy}>
            <Text style={styles.connectionTitle}>{isOffline ? 'Offline' : 'Connected'}</Text>
            <Text style={styles.connectionMessage}>{isOffline ? 'Saved work will remain on this device.' : outstanding ? `${outstanding} item${outstanding === 1 ? '' : 's'} waiting to synchronize.` : 'All saved work is synchronized.'}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <Summary label="Waiting" value={counts.Pending + counts.Syncing} />
          <Summary attention={counts.Failed + counts['Needs Attention'] > 0} label="Attention" value={counts.Failed + counts['Needs Attention']} />
          <Summary complete label="Completed" value={counts.Completed} />
        </View>

        <Pressable disabled={isOffline || syncing || !automaticallyRetryable} onPress={() => void syncAll()} style={[styles.syncButton, (isOffline || syncing || !automaticallyRetryable) && styles.buttonDisabled]}>
          {syncing ? <ActivityIndicator color={colors.surface} /> : <Ionicons color={colors.surface} name="sync" size={19} />}
          <Text style={styles.syncButtonText}>{syncing ? 'Synchronizing…' : 'Sync now'}</Text>
        </Pressable>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Activity</Text>
          {counts.Completed ? <Pressable hitSlop={10} onPress={clearHistory}><Text style={styles.clearText}>Clear completed</Text></Pressable> : null}
        </View>
        {error ? <StateView error={error} onRetry={load} /> : operations.length ? operations.map((operation) => (
          <OperationCard
            busy={activeOperation === operation.operationId}
            key={operation.operationId}
            onRetry={() => void retry(operation)}
            operation={operation}
          />
        )) : (
          <View style={styles.empty}>
            <Ionicons color={colors.faint} name="cloud-done-outline" size={30} />
            <Text style={styles.emptyTitle}>No synchronization activity</Text>
            <Text style={styles.emptyMessage}>Offline submissions and their status will appear here.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Summary({ label, value, attention = false, complete = false }: { label: string; value: number; attention?: boolean; complete?: boolean }) {
  return <View style={styles.summary}><Text style={[styles.summaryValue, attention && styles.summaryAttention, complete && styles.summaryComplete]}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

function OperationCard({ operation, busy, onRetry }: { operation: OfflineOperation; busy: boolean; onRetry: () => void }) {
  const payload = operation.payload as Partial<OfflinePODPayload>;
  const reviewable = operation.operationType === 'submit_pod' && payload.tripName && payload.stopName && operation.status !== 'Completed';
  const retryable = ['Pending', 'Failed', 'Needs Attention'].includes(operation.status);
  const title = operation.operationType === 'submit_pod' ? 'Proof of Delivery' : operation.operationType;
  const reference = payload.pod?.delivery_note || operation.entityKey;

  return <View style={styles.operationCard}>
    <View style={styles.operationHeader}>
      <View style={styles.operationTitleCopy}>
        <Text style={styles.operationTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.operationReference}>{reference}</Text>
      </View>
      <OperationStatus status={operation.status} />
    </View>
    {payload.pod?.customer ? <Text style={styles.customer}>{payload.pod.customer}</Text> : null}
    <Text style={styles.metadata}>{formatTimestamp(operation.updatedAt)} · {operation.attemptCount} {operation.attemptCount === 1 ? 'attempt' : 'attempts'}</Text>
    {operation.lastError ? <View style={styles.errorBox}><Ionicons color={colors.danger} name="alert-circle-outline" size={17} /><Text style={styles.errorText}>{operation.lastError}</Text></View> : null}
    {reviewable || retryable ? <View style={styles.actions}>
      {reviewable ? <Pressable onPress={() => router.push(`/trips/${encodeURIComponent(payload.tripName!)}/stops/${encodeURIComponent(payload.stopName!)}/pod` as never)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Review</Text></Pressable> : null}
      {retryable ? <Pressable disabled={busy} onPress={onRetry} style={styles.retryButton}>{busy ? <ActivityIndicator color={colors.surface} size="small" /> : <><Ionicons color={colors.surface} name="refresh" size={16} /><Text style={styles.retryButtonText}>Retry</Text></>}</Pressable> : null}
    </View> : null}
  </View>;
}

function OperationStatus({ status }: { status: OfflineOperationStatus }) {
  const attention = ['Failed', 'Needs Attention'].includes(status);
  const completed = status === 'Completed';
  return <View style={[styles.status, attention && styles.statusAttention, completed && styles.statusComplete]}><Text style={[styles.statusText, attention && styles.statusTextAttention, completed && styles.statusTextComplete]}>{status}</Text></View>;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { flexGrow: 1, padding: spacing.xl, paddingBottom: 60, paddingTop: 58 },
  connection: { alignItems: 'center', borderRadius: radius.md, flexDirection: 'row', gap: 12, marginTop: spacing.lg, padding: spacing.md },
  connectionOnline: { backgroundColor: colors.successSoft },
  connectionOffline: { backgroundColor: colors.warningSoft },
  connectionCopy: { flex: 1 },
  connectionTitle: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  connectionMessage: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 3 },
  summaryRow: { flexDirection: 'row', gap: 9, marginTop: spacing.md },
  summary: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, flex: 1, paddingVertical: 13 },
  summaryValue: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 20 },
  summaryAttention: { color: colors.danger },
  summaryComplete: { color: colors.success },
  summaryLabel: { color: colors.muted, fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 3 },
  syncButton: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: radius.sm, flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: spacing.md, minHeight: 50 },
  syncButtonText: { color: colors.surface, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  buttonDisabled: { opacity: 0.38 },
  listHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, marginTop: spacing.xl },
  listTitle: { color: colors.ink, fontFamily: 'Inter_700Bold', fontSize: 18 },
  clearText: { color: colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  operationCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, marginBottom: 12, padding: spacing.md },
  operationHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  operationTitleCopy: { flex: 1 },
  operationTitle: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  operationReference: { color: colors.muted, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 4 },
  customer: { color: colors.ink, fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 12 },
  metadata: { color: colors.faint, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 7 },
  status: { backgroundColor: colors.warningSoft, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 },
  statusAttention: { backgroundColor: colors.dangerSoft },
  statusComplete: { backgroundColor: colors.successSoft },
  statusText: { color: colors.warning, fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  statusTextAttention: { color: colors.danger },
  statusTextComplete: { color: colors.success },
  errorBox: { alignItems: 'flex-start', backgroundColor: colors.dangerSoft, borderRadius: radius.sm, flexDirection: 'row', gap: 8, marginTop: 12, padding: 11 },
  errorText: { color: colors.danger, flex: 1, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 17 },
  actions: { borderTopColor: colors.divider, borderTopWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'flex-end', marginTop: 14, paddingTop: 12 },
  secondaryButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 16 },
  secondaryButtonText: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  retryButton: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: radius.sm, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 40, minWidth: 88, paddingHorizontal: 16 },
  retryButtonText: { color: colors.surface, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  empty: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.xl },
  emptyTitle: { color: colors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 15, marginTop: 12 },
  emptyMessage: { color: colors.muted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: 'center' },
});
