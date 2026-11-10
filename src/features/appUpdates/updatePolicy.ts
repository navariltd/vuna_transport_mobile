import type { OfflineOperation } from '../../offline/outbox';

// Never interrupt proof capture, requests, signatures, or stop/task screens.
export function isSafeUpdateScreen(pathname: string) {
  return pathname === '/dashboard' || pathname === '/profile';
}

export function hasUnsyncedWork(operations: Pick<OfflineOperation, 'status'>[]) {
  return operations.some(operation => operation.status !== 'Completed');
}
