import { type PropsWithChildren, useEffect, useState } from 'react';
import { isConnectivityFailure } from '../auth/session';
import { prepareProofOfDelivery, submitProofOfDelivery, uploadPODAttachment } from '../features/trips/api';
import type { ProofOfDeliveryDraft } from '../features/trips/types';
import { useConnectivity } from './connectivity';
import { readPODPhotoBase64, removePODPhoto } from './files';
import {
  getOfflineOperation,
  getPendingOfflineOperations,
  type OfflineOperation,
  updateOfflineOperation,
} from './outbox';
import { cacheSynchronizedTrip } from './trip_repository';

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
  const operation = await getOfflineOperation(operationId);
  if (!operation) throw new Error('The saved offline operation could not be found.');
  return synchronizeOperation(operation);
}

async function runSynchronization() {
  const operations = await getPendingOfflineOperations();
  for (const operation of operations) {
    try {
      await synchronizeOperation(operation);
    } catch (error) {
      if (isConnectivityFailure(error)) break;
    }
  }
}

async function synchronizeOperation(operation: OfflineOperation) {
  await updateOfflineOperation(operation.operationId, {
    status: 'Syncing',
    lastError: null,
    incrementAttempts: true,
  });
  try {
    if (operation.operationType === 'submit_pod') {
      return await synchronizePOD(operation as OfflineOperation<OfflinePODPayload>);
    }
    throw new Error(`Unsupported offline operation: ${operation.operationType}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Synchronization failed.';
    await updateOfflineOperation(operation.operationId, {
      status: isConnectivityFailure(error) ? 'Failed' : 'Needs Attention',
      lastError: message,
    });
    throw error;
  }
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
