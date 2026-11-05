import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { PODForm } from './pod_form';
import { applyCustomerForm, customerForm, type PODFormSubmission } from './form_model';
import { ScreenHeader, StateView } from '../trips/components';
import type { ProofOfDeliveryDraft } from '../trips/types';
import { isConnectivityFailure } from '../../auth/session';
import { enqueueOfflineOperation, getActiveOfflineOperation, getOfflineOperation, updateOfflineOperation, type OfflineOperationStatus } from '../../offline/outbox';
import { requestOfflineSync, synchronizeOfflineOperation, type OfflinePODPayload } from '../../offline/sync';
import { cachePendingProofOfDelivery, loadProofOfDeliveryDraft } from '../../offline/trip_repository';

export default function CustomerConfirmationScreen() {
  const { tripName, stopName } = useLocalSearchParams<{ tripName: string; stopName: string }>();
  const [pod, setPod] = useState<ProofOfDeliveryDraft>();
  const [evidence, setEvidence] = useState<Pick<OfflinePODPayload, 'signatureSvg' | 'photoUri' | 'photoFilename'>>({});
  const [operationId, setOperationId] = useState<string>();
  const [status, setStatus] = useState<OfflineOperationStatus>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setError('');
      const queued = await getActiveOfflineOperation('submit_pod', `${tripName}:${stopName}`);
      if (queued) {
        const payload = queued.payload as OfflinePODPayload;
        setOperationId(queued.operationId); setStatus(queued.status); setEvidence(payload); setPod(payload.pod);
      } else setPod((await loadProofOfDeliveryDraft(tripName, stopName)).data);
    } catch (exception) { setError(exception instanceof Error ? exception.message : 'Could not prepare Proof of Delivery.'); }
    finally { setLoading(false); }
  }, [tripName, stopName]);
  useEffect(() => { void load(); }, [load]);
  const submit = async ({ draft, signatureSvg, photo }: PODFormSubmission) => {
    if (!pod) return;
    const payload: OfflinePODPayload = { tripName, stopName, pod: applyCustomerForm(pod, draft), signatureSvg, photoUri: photo?.uri, photoFilename: photo?.filename };
    try {
      let id = operationId;
      if (id) {
        const existing = await getOfflineOperation(id);
        if (existing?.status === 'Syncing' || existing?.status === 'Completed') throw new Error('This proof is already syncing or submitted. Review it in Sync Center.');
        await updateOfflineOperation(id, { payload: { ...payload, serverPodName: (existing?.payload as OfflinePODPayload)?.serverPodName }, status: 'Pending', lastError: null });
      } else {
        id = await enqueueOfflineOperation('submit_pod', `${tripName}:${stopName}`, payload);
        setOperationId(id);
      }
      setStatus('Pending');
      await cachePendingProofOfDelivery(tripName, stopName, id);
      const result = await synchronizeOfflineOperation(id);
      const stop = result.trip.stops.find((row) => row.name === stopName);
      if (stop?.tasks?.some((task) => task.task_type !== 'Customer Delivery' && task.status !== 'Cancelled')) {
        router.replace(`/trips/${encodeURIComponent(tripName)}/transfers/${encodeURIComponent(stopName)}?completed=delivery` as never);
      } else {
        const focus = result.trip.next_stop ? `?focusStop=${encodeURIComponent(result.trip.next_stop)}` : '';
        router.replace(`/trips/${encodeURIComponent(tripName)}${focus}` as never);
      }
    } catch (exception) {
      if (!isConnectivityFailure(exception)) { setStatus('Needs Attention'); throw exception; }
      setStatus('Failed'); requestOfflineSync();
      Alert.alert('Saved for synchronization', 'This proof is saved on the device. Completion will be confirmed after synchronization.', [{ text: 'Continue', onPress: () => router.replace(`/trips/${encodeURIComponent(tripName)}` as never) }]);
    }
  };
  if (loading) return <StateView loading />;
  if (!pod || error) return <><ScreenHeader back title="Proof of Delivery" /><StateView error={error || 'Proof unavailable.'} onRetry={load} /></>;
  if (pod.docstatus !== 0) return <><ScreenHeader back title="Proof of Delivery" /><StateView empty="This proof has already been submitted. Return to the delivery details to view it." /></>;
  return <PODForm initial={customerForm(pod)} initialSignature={evidence.signatureSvg} initialPhoto={evidence.photoUri && evidence.photoFilename ? { uri: evidence.photoUri, filename: evidence.photoFilename } : null} queuedStatus={status} onSubmit={submit} />;
}
