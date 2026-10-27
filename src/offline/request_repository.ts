import { getMobileRequestDetails, getMobileRequestHistory } from '../features/requests/api';
import type { MobileRequestDetail, MobileRequestHistoryItem } from '../features/requests/types';
import { readThroughCache } from './read_through';

export function loadMobileRequestHistory(tripName?: string) {
  const key = tripName ? `history:${tripName}` : 'history';
  return readThroughCache<MobileRequestHistoryItem[]>('mobile-requests', key, () => getMobileRequestHistory(tripName));
}

export function loadMobileRequestDetails(
  doctype: MobileRequestHistoryItem['doctype'],
  name: string,
) {
  return readThroughCache<MobileRequestDetail>(
    'mobile-request-details',
    `${doctype}:${name}`,
    () => getMobileRequestDetails(doctype, name),
  );
}
