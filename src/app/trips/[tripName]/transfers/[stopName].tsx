import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenHeader, Section, StateView, StatusBadge } from '../../../../features/trips/components';
import { TaskErrorBanner } from '../../../../features/requests/components';
import { type TransferProof } from '../../../../features/trips/api';
import { isConnectivityFailure } from '../../../../auth/session';
import { enqueueOfflineOperation } from '../../../../offline/outbox';
import { requestOfflineSync, synchronizeOfflineOperation, type OfflineTransportPODPayload } from '../../../../offline/sync';
import { loadTransportProof, pendingTransportProof } from '../../../../offline/transport_proof_repository';
import type { DeliveryStop } from '../../../../features/trips/types';
import { loadTripDetails } from '../../../../offline/trip_repository';
import { colors, spacing } from '../../../../shared/theme';

export default function TransferStopScreen() {
  const { tripName, stopName } = useLocalSearchParams<{ tripName: string; stopName: string }>();
  const [stop, setStop] = useState<DeliveryStop>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState<TransferProof>();
  const [quantities, setQuantities] = useState<string[]>([]);
  const [serials, setSerials] = useState<string[]>([]);
  const [rejectedQuantities, setRejectedQuantities] = useState<string[]>([]);
  const [rejectedSerials, setRejectedSerials] = useState<string[]>([]);
  const [depotRejected, setDepotRejected] = useState<string[]>([]);
  const [handling, setHandling] = useState<string[]>([]);
  const [depotRejectedSerials, setDepotRejectedSerials] = useState<string[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [confirmedBy, setConfirmedBy] = useState('');
  const [remarks, setRemarks] = useState('');
  const [requestId, setRequestId] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const result = await loadTripDetails(tripName);
      const selected = result.data.trip.stops.find((row) => row.name === stopName);
      if (!selected) throw new Error('This stop is no longer part of the trip.');
      setStop(selected);
      void Promise.allSettled((selected.tasks || []).filter((task) => task.can_record_proof && task.task_type !== 'Customer Delivery').map((task) => loadTransportProof(task.name)));
    } catch (exception) { setError(exception instanceof Error ? exception.message : 'Could not load this delivery.'); }
    finally { setLoading(false); }
  }, [tripName, stopName]);
  useEffect(() => { void load(); }, [load]);
  const openProof = async (taskName: string) => {
    setBusy(true); setError(''); setNotice(''); setProof(undefined);
    try {
      if (await pendingTransportProof(taskName)) {
        setNotice('This handover is saved on this device. Open Sync Center to check or retry it; do not collect it again.');
        return;
      }
      const { data: result } = await loadTransportProof(taskName);
      setProof(result); setQuantities(result.items.map((row) => String(row.qty)));
      setSerials(result.items.map((row) => row.serial_no || ''));
      setRejectedQuantities(result.items.map((row) => String(row.rejected_qty || 0)));
      setRejectedSerials(result.items.map((row) => row.rejected_serial_no || ''));
      setDepotRejected(result.items.map((row) => String(row.depot_received_rejected_qty || 0)));
      setHandling(result.items.map((row) => row.rejected_goods_handling || (!row.depot_received_rejected_qty ? 'All remain on vehicle' : row.depot_received_rejected_qty === row.rejected_qty ? 'All received by depot' : 'Split between depot and vehicle')));
      setDepotRejectedSerials(result.items.map((row) => row.depot_received_rejected_serial_no || ''));
      setReasons(result.items.map((row) => row.rejection_reason_remarks || ''));
      setConfirmedBy(''); setRemarks(''); setRequestId(randomUUID());
    } catch (exception) { setError(exception instanceof Error ? exception.message : 'Could not prepare confirmation.'); }
    finally { setBusy(false); }
  };
  const depotQuantity = (index: number) => handling[index] === 'All received by depot'
    ? Number(rejectedQuantities[index] || 0) : handling[index] === 'Split between depot and vehicle' ? Number(depotRejected[index] || 0) : 0;
  const submit = async () => {
    if (!proof || busy) return;
    if (!confirmedBy.trim()) { setError('Enter the name of the person confirming this handover.'); return; }
    if (quantities.some((value, index) => !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > proof.items[index].planned_qty)) {
      setError('Enter quantities between zero and the dispatched amount.'); return;
    }
    if (rejectedQuantities.some((value, index) => !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) + Number(quantities[index]) > proof.items[index].planned_qty)) {
      setError('Accepted plus rejected quantities cannot exceed the dispatched amount.'); return;
    }
    if (handling.some((choice, index) => Number(rejectedQuantities[index]) > 0 && choice === 'Split between depot and vehicle' && (!depotRejected[index]?.trim() || !Number.isFinite(depotQuantity(index)) || depotQuantity(index) <= 0 || depotQuantity(index) >= Number(rejectedQuantities[index])))) {
      setError('For Split, enter a depot quantity greater than zero and less than the rejected quantity.'); return;
    }
    if (proof.items.some((row, index) => row.planned_qty - Number(quantities[index]) - Number(rejectedQuantities[index]) > 0.000001) && !remarks.trim()) {
      setError('Explain the missing or unaccounted quantity in Remarks.'); return;
    }
    setBusy(true); setError('');
    try {
      const payload = {
        request_id: requestId, received_by: confirmedBy.trim(), remarks: remarks.trim(),
        items: proof.items.map((row, index) => ({ source_row: row.source_row, batch_no: row.batch_no,
          delivered_qty: Number(quantities[index]), serial_no: serials[index],
          rejected_qty: Number(rejectedQuantities[index]), rejected_serial_no: rejectedSerials[index],
          rejected_goods_handling: handling[index],
          depot_received_rejected_qty: depotQuantity(index),
          depot_received_rejected_serial_no: depotRejectedSerials[index],
          rejection_reason_remarks: reasons[index].trim() || remarks.trim() })),
      };
      const queued = await pendingTransportProof(proof.task);
      const operationId = queued?.operationId || await enqueueOfflineOperation<OfflineTransportPODPayload>('submit_transport_pod', proof.task, {
        tripName, stopName, taskName: proof.task, proof: payload,
      });
      const result = await synchronizeOfflineOperation(operationId);
      if (!('name' in result)) throw new Error('Unexpected handover synchronization result.');
      setNotice(proof.task_type === 'Return Pickup' ? proof.return_context === 'Customer' ? `${result.name} recorded. Customer returns are with the driver; warehouse staff will process the Sales Return.` : `${result.name} recorded. Collected goods are now in vehicle transit; warehouse staff must confirm receiving.` : `${result.name} recorded. Received quantities have been posted; rejected goods are tracked in the Return Request.`);
      setProof(undefined); await load();
    } catch (exception) {
      if (isConnectivityFailure(exception)) {
        setNotice('Handover saved on this device. It will synchronize when online; stock is not posted until the server confirms it.');
        setProof(undefined);
        requestOfflineSync();
      } else { setError(exception instanceof Error ? exception.message : 'Could not submit confirmation.'); setNotice('If this handover was saved, review it in Sync Center before trying again.'); }
    }
    finally { setBusy(false); }
  };
  if (loading) return <StateView loading />;
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader back title={stop?.location_label || 'Depot delivery'} />
      {stop && (stop.unplanned_pickups_enabled || Boolean(stop.unplanned_collection_count)) ? <Pressable style={styles.button} onPress={() => router.push(`/trips/${encodeURIComponent(tripName)}/collections/${encodeURIComponent(stopName)}` as never)}><Text style={styles.buttonText}>{stop.unplanned_pickups_enabled ? 'Unplanned collections' : 'Collection history'}</Text></Pressable> : null}
      {error ? <TaskErrorBanner message={error} title="Check this handover" /> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {notice ? <Pressable style={styles.button} onPress={() => router.push('/sync-center')}><Text style={styles.buttonText}>Sync Center</Text></Pressable> : null}
      {stop?.delivery_note ? <Pressable style={styles.button} onPress={() => router.push(`/trips/${encodeURIComponent(tripName)}/stops/${encodeURIComponent(stopName)}` as never)}><Text style={styles.buttonText}>Customer delivery</Text></Pressable> : null}
      {(stop?.tasks || []).filter((row) => row.task_type !== 'Customer Delivery').map((operation) => <Section key={operation.name} title={operation.operation_label || 'Depot delivery'}>
        <StatusBadge status={operation.status} />
        <Pressable disabled={busy} style={styles.button} onPress={() => void openProof(operation.name)}><Text style={styles.buttonText}>{operation.can_record_proof ? 'Confirm handover' : 'View confirmation'}</Text></Pressable>
      </Section>)}
      {proof ? <Section title={proof.task_type === 'Return Pickup' ? 'Proof of pickup' : proof.task_type === 'Transfer Dispatch' ? 'Loading POD' : 'Proof of delivery'}>
        {proof.items.map((row, index) => <View key={`${row.source_row}:${row.batch_no || ''}`} style={styles.item}>
          <Text style={styles.label}>{row.item_code}{row.batch_no ? ` · ${row.batch_no}` : ''}</Text>
          <Text>{proof.task_type === 'Return Pickup' ? 'Planned collection' : 'Dispatched'}: {row.planned_qty} {row.uom}</Text>
          <Text style={styles.label}>{proof.task_type === 'Return Pickup' ? 'Quantity collected' : 'Accepted quantity'}</Text>
          <TextInput style={styles.input} accessibilityLabel={`Actual quantity for ${row.item_code}`} keyboardType="decimal-pad" editable={proof.docstatus === 0 && proof.task_type !== 'Transfer Dispatch'} value={quantities[index]} onChangeText={(value) => setQuantities((current) => current.map((qty, position) => position === index ? value : qty))} />
          {proof.task_type === 'Transfer Receipt' ? <>
            <Text style={styles.label}>Rejected quantity</Text>
            <TextInput style={styles.input} accessibilityLabel={`Rejected quantity for ${row.item_code}`} keyboardType="decimal-pad" editable={proof.docstatus === 0} value={rejectedQuantities[index]} onChangeText={(value) => setRejectedQuantities((current) => current.map((qty, position) => position === index ? value : qty))} />
            <Text style={styles.hint}>Unaccounted: {Math.max(row.planned_qty - Number(quantities[index] || 0) - Number(rejectedQuantities[index] || 0), 0)} {row.uom}. Only explicit rejection creates a Return Request.</Text>
            {Number(rejectedQuantities[index]) > 0 ? <>
              <Text style={styles.label}>Where are the rejected goods?</Text>
              {['All remain on vehicle', 'All received by depot', 'Split between depot and vehicle'].map((choice) => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ selected: handling[index] === choice }} disabled={proof.docstatus !== 0} style={[styles.choice, handling[index] === choice && styles.selectedChoice]} onPress={() => setHandling((current) => current.map((value, position) => position === index ? choice : value))}><Text style={styles.label}>{handling[index] === choice ? '●' : '○'} {choice}</Text></Pressable>)}
              {handling[index] === 'Split between depot and vehicle' ? <>
              <Text style={styles.label}>Quantity received by depot</Text>
              <TextInput style={styles.input} accessibilityLabel={`Rejected quantity received by depot for ${row.item_code}`} keyboardType="decimal-pad" editable={proof.docstatus === 0} value={depotRejected[index]} onChangeText={(value) => setDepotRejected((current) => current.map((qty, position) => position === index ? value : qty))} />
              <Text style={styles.hint}>{Math.max(Number(rejectedQuantities[index] || 0) - depotQuantity(index), 0)} {row.uom} remain on vehicle (calculated).</Text>
              {row.serial_no || row.rejected_serial_no ? <><Text style={styles.label}>Rejected serial numbers received by depot</Text><TextInput multiline style={styles.input} editable={proof.docstatus === 0} value={depotRejectedSerials[index]} onChangeText={(value) => setDepotRejectedSerials((current) => current.map((serial, position) => position === index ? value : serial))} /></> : null}
              </> : null}
              <Text style={styles.label}>Rejection reason</Text><TextInput multiline style={styles.input} editable={proof.docstatus === 0} value={reasons[index]} onChangeText={(value) => setReasons((current) => current.map((reason, position) => position === index ? value : reason))} />
              {row.serial_no || row.rejected_serial_no ? <><Text style={styles.label}>Rejected serial numbers</Text><TextInput multiline style={styles.input} editable={proof.docstatus === 0} value={rejectedSerials[index]} onChangeText={(value) => setRejectedSerials((current) => current.map((serial, position) => position === index ? value : serial))} /></> : null}
            </> : null}
          </> : null}
          {row.serial_no ? <TextInput multiline style={styles.input} accessibilityLabel="Actual serial numbers" editable={proof.docstatus === 0 && proof.task_type !== 'Transfer Dispatch'} value={serials[index]} onChangeText={(value) => setSerials((current) => current.map((serial, position) => position === index ? value : serial))} /> : null}
        </View>)}
        {proof.docstatus === 0 ? <>
          <Text style={styles.label}>{proof.task_type === 'Return Pickup' ? 'Released by' : 'Confirmed by'}</Text><TextInput style={styles.input} value={confirmedBy} onChangeText={setConfirmedBy} autoCapitalize="words" />
          <Text style={styles.label}>Remarks</Text><TextInput style={styles.input} value={remarks} onChangeText={setRemarks} multiline />
          <Text style={styles.hint}>Offline handovers are saved on this device and posted only after server synchronization. {proof.task_type === 'Return Pickup' ? proof.return_context === 'Customer' ? 'Customer collection is evidence only, not inventory receipt or credit.' : 'Only collected goods enter vehicle transit; uncollected goods stay at the depot.' : 'Rejected goods left on the vehicle remain in transit.'}</Text>
          <Pressable disabled={busy} style={styles.button} onPress={() => void submit()}><Text style={styles.buttonText}>{busy ? 'Submitting…' : proof.task_type === 'Return Pickup' ? 'Submit pickup' : 'Submit confirmation'}</Text></Pressable>
        </> : <Text style={styles.notice}>{proof.name} has already been submitted.</Text>}
      </Section> : null}
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  choice: { padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, minHeight: 48, justifyContent: 'center' },
  selectedChoice: { backgroundColor: colors.surface, borderColor: colors.ink },
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.md, paddingBottom: 80, gap: spacing.md },
  item: { gap: spacing.sm, paddingVertical: spacing.sm }, label: { color: colors.ink, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, minHeight: 48, color: colors.ink, backgroundColor: colors.surface },
  button: { backgroundColor: colors.ink, padding: 14, borderRadius: 12, marginTop: spacing.sm }, buttonText: { color: colors.surface, textAlign: 'center', fontWeight: '600' },
  notice: { color: colors.success, padding: spacing.sm }, hint: { color: colors.muted, fontSize: 12, marginTop: spacing.sm },
});
