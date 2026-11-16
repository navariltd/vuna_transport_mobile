import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PODForm } from '../proof-of-delivery/pod_form';
import { TaskErrorBanner } from '../requests/components';
import { transportForm, transportPayload, type PODFormSubmission } from '../proof-of-delivery/form_model';
import type { TransferProof } from './api';
import { ScreenHeader, StateView } from './components';
import { captureDeviceLocation } from '../../shared/device_location';
import { taskStyles } from './task_components';
import { isConnectivityFailure } from '../../auth/session';
import { enqueueOfflineOperation } from '../../offline/outbox';
import { requestOfflineSync, synchronizeOfflineOperation, type OfflineTransportPODPayload } from '../../offline/sync';
import { loadTransportProof, pendingTransportProof } from '../../offline/transport_proof_repository';
import { loadTripDetails } from '../../offline/trip_repository';

export default function TransportConfirmationScreen() {
  const { tripName, stopName, taskName } = useLocalSearchParams<{ tripName: string; stopName: string; taskName: string }>();
  const [proof, setProof] = useState<TransferProof>();
  const [party, setParty] = useState('');
  const [loading, setLoading] = useState(true);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef<string>('');
  const detailPath = `/trips/${encodeURIComponent(tripName)}/tasks/${encodeURIComponent(taskName)}?stopName=${encodeURIComponent(stopName)}`;
  const load = useCallback(async () => {
    try {
      setError('');
      const result = await loadTripDetails(tripName);
      const stop = result.data.trip.stops.find((row) => row.name === stopName);
      const task = stop?.tasks?.find((row) => row.name === taskName);
      if (!stop || !task) throw new Error('This action is no longer assigned to this stop.');
      if (await pendingTransportProof(taskName)) { setQueued(true); return; }
      if (!task.can_record_proof || task.blocked_reason) throw new Error(task.blocked_reason || 'This action is not available for confirmation.');
      const response = await loadTransportProof(taskName);
      if (response.data.task !== taskName || response.data.docstatus !== 0) throw new Error('This proof is already submitted or no longer matches this action.');
      setProof(response.data); setParty(task.party_name || stop.location_label || stop.customer || 'Depot');
      requestId.current = randomUUID();
    } catch (exception) { setError(exception instanceof Error ? exception.message : 'Could not prepare Proof of Delivery.'); }
    finally { setLoading(false); }
  }, [tripName, stopName, taskName]);
  useEffect(() => { void load(); }, [load]);
  const submit = async ({ draft, signatureSvg, photo }: PODFormSubmission) => {
    if (!proof) return;
    try {
      // Never replace evidence for an operation which may already have posted.
      if (await pendingTransportProof(taskName)) { setQueued(true); return; }
      const location = await captureDeviceLocation();
      const payload: OfflineTransportPODPayload = { tripName, stopName, taskName, proof: { ...transportPayload(proof, draft, requestId.current), device_location: location }, signatureSvg, photoUri: photo?.uri, photoFilename: photo?.filename };
      const id = await enqueueOfflineOperation('submit_transport_pod', taskName, payload);
      const result = await synchronizeOfflineOperation(id);
      if (!('name' in result)) throw new Error('Unexpected proof synchronization result.');
      router.replace(`${detailPath}&completed=${encodeURIComponent(result.name)}` as never);
    } catch (exception) {
      if (isConnectivityFailure(exception)) { requestOfflineSync(); router.replace(detailPath as never); }
      else {
        setQueued(Boolean(await pendingTransportProof(taskName)));
        setError(exception instanceof Error ? exception.message : 'Could not submit proof. Review it in Sync Center.');
        throw exception;
      }
    }
  };
  if (loading) return <StateView loading />;
  if (queued) return <View style={taskStyles.screen}><View style={taskStyles.content}><ScreenHeader back title="Proof of Delivery" />{error ? <TaskErrorBanner title="Proof needs attention" message={error} /> : null}<StateView empty="This handover is saved on the device. Review its status in Sync Center; do not record it again." /><Pressable style={taskStyles.primary} onPress={() => router.push('/sync-center')}><Text style={taskStyles.primaryText}>Open Sync Center</Text></Pressable></View></View>;
  if (!proof || error) return <><ScreenHeader back title="Proof of Delivery" /><StateView error={error || 'Proof unavailable.'} onRetry={load} /></>;
  return <PODForm initial={transportForm(proof, party)} onSubmit={submit} />;
}
