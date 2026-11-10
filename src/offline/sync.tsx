import { type PropsWithChildren, useEffect, useState } from 'react';
import { isConnectivityFailure, MobileAccessError } from '../auth/session';
import { getOfflineDatabase } from './database';
import { getTripDetails, prepareProofOfDelivery, prepareTransferProof, submitProofOfDelivery, submitTransferProof, uploadPODAttachment, type TransferProof } from '../features/trips/api';
import type { DeliveryTrip, ProofOfDeliveryDraft } from '../features/trips/types';
import { useConnectivity } from './connectivity';
import { readPODPhotoBase64, removePODPhoto } from './files';
import {
  getOfflineOperation,
  getPendingOfflineOperations,
  type OfflineOperation,
  updateOfflineOperation,
} from './outbox';
import { cacheSynchronizedTrip } from './trip_repository';
import { getCachedValue, getOfflineScope, setCachedValue } from './cache';

export type OfflineTransportPODPayload = {
  tripName: string;
  stopName: string;
  taskName: string;
  proof: Record<string, unknown>;
  signatureSvg?: string | null;
  photoUri?: string | null;
  photoFilename?: string | null;
  serverPodName?: string | null;
};

export type OfflinePODPayload = {
  tripName: string;
  stopName: string;
  pod: ProofOfDeliveryDraft;
  signatureSvg?: string | null;
  photoUri?: string | null;
  photoFilename?: string | null;
  serverPodName?: string | null;
};

const listeners = new Set<() => void>();
let syncPromise: Promise<void> | null = null;
const activeOperations = new Map<string, ReturnType<typeof synchronizeOperation>>();

export function requestOfflineSync() {
  for (const listener of listeners) listener();
}

export function OfflineSyncProvider({ children }: PropsWithChildren) {
  const { isOffline } = useConnectivity();
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    const listener = () => setRequestVersion((current) => current + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  useEffect(() => {
    if (!isOffline) void synchronizePendingOperations();
  }, [isOffline, requestVersion]);

  return children;
}

export async function synchronizePendingOperations() {
  if (syncPromise) return syncPromise;
  syncPromise = runSynchronization().finally(() => { syncPromise = null; });
  return syncPromise;
}

export async function synchronizeOfflineOperation(operationId: string) {
  const running = activeOperations.get(operationId);
  if (running) return running;
  const pending = loadAndSynchronizeOperation(operationId);
  activeOperations.set(operationId, pending);
  try { return await pending; }
  finally { if (activeOperations.get(operationId) === pending) activeOperations.delete(operationId); }
}

async function loadAndSynchronizeOperation(operationId: string) {
  const operation = await getOfflineOperation(operationId);
  if (!operation) throw new Error('The saved offline operation could not be found.');
  return synchronizeOperation(operation);
}

async function runSynchronization() {
  const operations = await getPendingOfflineOperations();
  for (const operation of operations) {
    try {
      await synchronizeOfflineOperation(operation.operationId);
    } catch (error) {
      if (isConnectivityFailure(error) || error instanceof MobileAccessError) break;
    }
  }
}

async function synchronizeOperation(operation: OfflineOperation) {
  const scope = await getOfflineScope();
  if (!scope) throw new MobileAccessError('expired', 'Please sign in again to sync saved work.');
  await updateOfflineOperation(operation.operationId, {
    status: 'Syncing',
    lastError: null,
    incrementAttempts: true,
  });
  try {
    if (operation.operationType === 'submit_pod') {
      return await synchronizePOD(operation as OfflineOperation<OfflinePODPayload>);
    }
    if (operation.operationType === 'submit_transport_pod') {
      return await synchronizeTransportPOD(operation as OfflineOperation<OfflineTransportPODPayload>);
    }
    throw new Error(`Unsupported offline operation: ${operation.operationType}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Synchronization failed.';
    if (error instanceof MobileAccessError) {
      // Authentication may already have cleared the active session. Use only
      // the captured owner scope to pause this operation without losing it.
      const database = await getOfflineDatabase();
      await database.runAsync(
        "UPDATE offline_outbox SET status = 'Pending', last_error = ?, updated_at = ? WHERE scope = ? AND operation_id = ? AND status = 'Syncing'",
        message, new Date().toISOString(), scope, operation.operationId,
      );
      throw error;
    }
    await updateOfflineOperation(operation.operationId, {
      status: isConnectivityFailure(error) ? 'Failed' : 'Needs Attention',
      lastError: message,
    });
    throw error;
  }
}

async function synchronizeTransportPOD(operation: OfflineOperation<OfflineTransportPODPayload>) {
  let payload = operation.payload;
  const cached = await getCachedValue<{ trip: DeliveryTrip }>('delivery-trip', payload.tripName);
  let trip = cached?.value.trip || (await getTripDetails(payload.tripName)).trip;
  if (payload.signatureSvg || payload.photoUri) {
    // Only persist a draft when uploading evidence, never merely by viewing a
    // stop. Retrying a submitted proof must not attempt another file upload.
    const prepared = await prepareTransferProof(payload.taskName, true);
    if (!prepared.name || prepared.task !== payload.taskName) throw new Error('The evidence draft does not match this task.');
    if (prepared.docstatus === 0) {
      payload = { ...payload, serverPodName: prepared.name };
      await updateOfflineOperation(operation.operationId, { payload });
      if (payload.signatureSvg) await uploadPODAttachment(payload.tripName, payload.stopName, prepared.name, 'signature', payload.signatureSvg, `signature-${prepared.name}.svg`, 'text');
      if (payload.photoUri && payload.photoFilename) await uploadPODAttachment(payload.tripName, payload.stopName, prepared.name, 'delivery_photo', await readPODPhotoBase64(payload.photoUri), payload.photoFilename);
    }
  }
  const result = await submitTransferProof(payload.taskName, payload.proof);
  await updateOfflineOperation(operation.operationId, { status: 'Completed', lastError: null });
  try { removePODPhoto(payload.photoUri); } catch { /* Local cleanup must not reopen a posted handover. */ }
  // Posting has succeeded. A failed refresh must never turn it into another
  // handover or cause a new request ID to be generated.
  try {
    const cachedProof = await getCachedValue<TransferProof>('transport-proof', payload.taskName);
    if (cachedProof) {
      const submitted = payload.proof.items as Record<string, unknown>[];
      await setCachedValue('transport-proof', payload.taskName, {
        ...cachedProof.value, name: result.name, docstatus: 1, outcome: result.outcome,
        received_by: payload.proof.received_by, receiver_phone: payload.proof.receiver_phone, remarks: payload.proof.remarks,
        items: cachedProof.value.items.map((row) => {
          const actual = submitted.find((item) => item.source_row === row.source_row && (item.batch_no || '') === (row.batch_no || ''));
          return actual ? { ...row, ...actual, qty: actual.delivered_qty } : row;
        }),
      });
    }
    trip = (await getTripDetails(payload.tripName)).trip;
    await cacheSynchronizedTrip(trip);
    const confirmed = await prepareTransferProof(payload.taskName);
    await setCachedValue('transport-proof', payload.taskName, confirmed);
  } catch { /* The submitted proof will be refreshed on the next online visit. */ }
  return { ...result, trip };
}

async function synchronizePOD(operation: OfflineOperation<OfflinePODPayload>) {
  let payload = operation.payload;
  let serverPOD = payload.serverPodName
    ? { ...payload.pod, name: payload.serverPodName }
    : await prepareProofOfDelivery(payload.tripName, payload.stopName);

  if (!payload.serverPodName) {
    payload = { ...payload, serverPodName: serverPOD.name };
    await updateOfflineOperation(operation.operationId, { payload });
  }

  let signature: string | undefined;
  let deliveryPhoto: string | undefined;
  const uploads = await Promise.all([
    payload.signatureSvg
      ? uploadPODAttachment(
          payload.tripName,
          payload.stopName,
          serverPOD.name,
          'signature',
          payload.signatureSvg,
          `signature-${serverPOD.name}.svg`,
          'text',
        )
      : null,
    payload.photoUri && payload.photoFilename
      ? readPODPhotoBase64(payload.photoUri).then((content) =>
          uploadPODAttachment(
            payload.tripName,
            payload.stopName,
            serverPOD.name,
            'delivery_photo',
            content,
            payload.photoFilename!,
          ),
        )
      : null,
  ]);
  signature = uploads[0]?.file_url;
  deliveryPhoto = uploads[1]?.file_url;

  const localItems = new Map(
    payload.pod.items.map((item) => [item.delivery_note_item || item.name, item]),
  );
  serverPOD = {
    ...serverPOD,
    ...payload.pod,
    name: serverPOD.name,
    request_id: operation.operationId,
    signature: signature || payload.pod.signature,
    delivery_photo: deliveryPhoto || payload.pod.delivery_photo,
    items: serverPOD.items.map((serverItem) => {
      const local = localItems.get(serverItem.delivery_note_item || serverItem.name);
      return local ? { ...serverItem, ...local, name: serverItem.name } : serverItem;
    }),
  };

  const result = await submitProofOfDelivery(payload.tripName, payload.stopName, serverPOD);
  await Promise.all([
    updateOfflineOperation(operation.operationId, { status: 'Completed', lastError: null }),
    cacheSynchronizedTrip(result.trip),
  ]);
  removePODPhoto(payload.photoUri);
  return result;
}
