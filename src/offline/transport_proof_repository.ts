import { prepareTransferProof, type TransferProof } from '../features/trips/api';
import { getActiveOfflineOperation } from './outbox';
import { readThroughCache } from './read_through';

export function loadTransportProof(taskName: string) {
  return readThroughCache<TransferProof>('transport-proof', taskName, () => prepareTransferProof(taskName));
}

export function pendingTransportProof(taskName: string) {
  return getActiveOfflineOperation('submit_transport_pod', taskName);
}
