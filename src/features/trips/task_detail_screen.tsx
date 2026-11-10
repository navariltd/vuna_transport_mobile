import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { formatDateTime, ScreenHeader, Section, StateView, StatusBadge } from './components';
import type { TransferProof } from './api';
import { StopLocation, taskStyles as styles, useTaskFonts } from './task_components';
import { nextStopAction, stopActions, stopActionPath, taskActionLabel, taskFinished, taskTitle } from './task_model';
import { loadStopWork } from './task_repository';
import { loadTransportProof } from '../../offline/transport_proof_repository';
import { colors } from '../../shared/theme';

export default function TransportTaskScreen() {
  const { tripName, stopName, taskName, completed } = useLocalSearchParams<{ tripName: string; stopName: string; taskName: string; completed?: string }>();
  const [fontsLoaded] = useTaskFonts();
  const [work, setWork] = useState<Awaited<ReturnType<typeof loadStopWork>>>();
  const [proof, setProof] = useState<TransferProof>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [proofError, setProofError] = useState('');
  const version = useRef(0);
  const load = useCallback(async () => {
    const current = ++version.current;
    try {
      setError(''); setProofError(''); setProof(undefined);
      const result = await loadStopWork(tripName, stopName);
      const task = stopActions(result.stop, result.pending).find((item) => item.name === taskName);
      if (!task || task.task_type === 'Customer Delivery') throw new Error('This action is no longer assigned to this stop.');
      if (current !== version.current) return;
      setWork(result);
      if (!task.blocked_reason && !task.queued) {
        try {
          const response = await loadTransportProof(taskName);
          if (response.data.task !== taskName) throw new Error('The confirmation does not match this action.');
          if (current === version.current) setProof(response.data);
        } catch (exception) {
          if (current === version.current) setProofError(exception instanceof Error ? exception.message : 'Connect to download the confirmation details.');
        }
      }
    } catch (exception) { if (current === version.current) setError(exception instanceof Error ? exception.message : 'Could not load this action.'); }
    finally { if (current === version.current) { setLoading(false); setRefreshing(false); } }
  }, [tripName, stopName, taskName]);
  useFocusEffect(useCallback(() => { void load(); return () => { version.current += 1; }; }, [load]));
  if (!fontsLoaded || loading) return <View style={styles.screen}><StateView loading /></View>;
  const task = work && stopActions(work.stop, work.pending).find((item) => item.name === taskName);
  if (!work || !task || error) return <View style={styles.screen}><ScreenHeader back title="Stop action" /><StateView error={error || 'Action unavailable.'} onRetry={load} /></View>;
  const recorded = proof?.docstatus === 1 || taskFinished(task);
  const next = nextStopAction(work.stop, taskName, work.pending);
  const canComplete = Boolean(task.can_record_proof && proof && proof.docstatus === 0 && !task.queued && !recorded && !task.blocked_reason);
  const actualProof = proof?.docstatus === 1;
  const pickup = ['Return Pickup', 'Supplier Pickup'].includes(task.task_type);
  const items: TransferProof['items'] = proof?.items || (task.items || []).map((item) => ({ ...item, source_row: item.item_code, planned_qty: item.qty }));
  const reference = proof?.reference_name || task.reference_name || task.return_request || 'Document pending';
  const status = task.queued ? task.status : proof?.docstatus === 1 ? proof.outcome || 'Completed' : task.status;
  return <View style={styles.screen}><StatusBar style="dark" />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
      <ScreenHeader back title={taskTitle(task)} />
      <StopLocation stop={work.stop} party={task.party_name} />
      <View style={[styles.cardHeading, { marginTop: 22 }]}><View style={styles.flex}><Text style={styles.eyebrow}>{proof?.reference_doctype || task.reference_doctype || 'REFERENCE'}</Text><Text style={styles.body}>{reference}</Text></View><StatusBadge status={status} /></View>
      {task.queued ? <View style={styles.notice}><Text style={styles.cardTitle}>{task.status === 'Needs Attention' ? 'Handover needs attention' : 'Handover saved on this device'}</Text><Text style={styles.muted}>Awaiting server confirmation. Inventory and trip completion are not confirmed until synchronization succeeds.</Text></View> : null}
      {task.blocked_reason || proofError || (!work.trip.actual_start && !recorded) ? <View style={styles.notice}><Text style={styles.warning}>{task.blocked_reason || proofError || 'Start the trip before completing this action.'}</Text>{proofError ? <Pressable onPress={() => void load()} style={styles.outline}><Text style={styles.outlineText}>Retry loading details</Text></Pressable> : null}</View> : null}
      <Section title={`Items · ${items.length}`}>
        <View style={styles.itemList}>{items.map((item, index) => <View style={styles.itemRow} key={`${item.source_row}:${item.batch_no || ''}:${index}`}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{item.item_name || item.item_code}</Text>
            <Text style={styles.muted}>{item.item_code}{item.batch_no ? ` · Batch ${item.batch_no}` : ''}</Text>
            {actualProof && Number(item.rejected_qty) > 0 ? <Text style={styles.warning}>{item.rejected_qty} {item.uom} rejected</Text> : null}
          </View>
          <View>
            <Text style={styles.quantity}>{actualProof ? item.qty : item.planned_qty} {item.uom}</Text>
            <Text style={styles.muted}>{actualProof ? pickup ? 'Collected' : 'Accepted' : recorded ? 'Planned' : pickup ? 'To collect' : 'To deliver'}</Text>
          </View>
        </View>)}</View>
      </Section>
      {recorded ? <View style={styles.success}><Text style={styles.cardTitle}>Handover recorded</Text><Text style={styles.muted}>{proof?.name || completed || 'Submitted confirmation'}</Text>{proof?.received_by ? <Text style={styles.body}>{pickup ? 'Released by' : 'Received by'}: {proof.received_by}</Text> : null}{proof?.delivery_datetime ? <Text style={styles.muted}>{formatDateTime(proof.delivery_datetime)}</Text> : null}{proof?.remarks ? <Text style={styles.body}>{proof.remarks}</Text> : null}</View> : null}
      {work.stop.unplanned_pickups_enabled || Boolean(work.stop.unplanned_collection_count) ? <Pressable style={[styles.outline, { marginTop: 24 }]} onPress={() => router.push(`/trips/${encodeURIComponent(tripName)}/collections/${encodeURIComponent(stopName)}` as never)}><Text style={styles.outlineText}>{work.stop.unplanned_pickups_enabled ? 'Unplanned collections' : 'Collection history'}</Text></Pressable> : null}
    </ScrollView>
    <View style={styles.footer}>
      {canComplete ? <Pressable style={styles.primary} onPress={() => router.push(`/trips/${encodeURIComponent(tripName)}/transfers/${encodeURIComponent(stopName)}?taskName=${encodeURIComponent(taskName)}` as never)}><Text style={styles.primaryText}>{taskActionLabel(task)}</Text><Ionicons name="arrow-forward" color={colors.surface} size={20} /></Pressable> : null}
      {task.queued ? <Pressable style={styles.primary} onPress={() => router.push('/sync-center')}><Text style={styles.primaryText}>Open Sync Center</Text></Pressable> : null}
      {(recorded || task.queued) && next ? <Pressable style={task.queued ? styles.outline : styles.primary} onPress={() => router.replace(stopActionPath(tripName, stopName, next) as never)}><Text style={task.queued ? styles.outlineText : styles.primaryText}>Next task · {taskTitle(next)}</Text></Pressable> : null}
      <Pressable style={styles.outline} onPress={() => router.replace(`/trips/${encodeURIComponent(tripName)}/transfers/${encodeURIComponent(stopName)}?completed=${encodeURIComponent(proof?.name || completed || 'review')}` as never)}><Text style={styles.outlineText}>All actions at this stop</Text></Pressable>
    </View>
  </View>;
}
