import type { DeliveryTrip } from './types';

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tripStatusPriority(status: string) {
  if (status === 'In Transit') return 0;
  if (status === 'Scheduled') return 1;
  return 2;
}

// Search only the currently loaded trips, including cached trips when offline.
export function searchAssignedTrips(trips: readonly DeliveryTrip[], query: string) {
  const search = normalizeSearch(query);
  const matches = trips.filter(trip => trip.status !== 'Cancelled' && (
    !search || normalizeSearch(trip.name).includes(search) || normalizeSearch(trip.vehicle || '').includes(search)
  ));

  return {
    isSearching: search.length > 0,
    activeTrips: matches
      .filter(trip => trip.status !== 'Completed')
      .sort((left, right) => tripStatusPriority(left.status) - tripStatusPriority(right.status)),
    completedTrips: matches
      .filter(trip => trip.status === 'Completed')
      .sort((left, right) => (right.departure_time || '').localeCompare(left.departure_time || '')),
  };
}
