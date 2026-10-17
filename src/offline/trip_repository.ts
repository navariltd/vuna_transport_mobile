import { getOfflineWork, isConnectivityFailure } from '../auth/session';
import { getDeliveryNoteDetails, getTripDetails, prepareProofOfDelivery } from '../features/trips/api';
import type { DeliveryNoteDetails, DeliveryTrip, ProofOfDeliveryDraft } from '../features/trips/types';
import { readThroughCache, type ReadThroughResult } from './read_through';
import { getCachedValue, setCachedValue } from './cache';

type AssignedTripsResponse = {
  linked: boolean;
  driver?: { full_name: string };
  message?: string;
  trips?: DeliveryTrip[];
};

type OfflineManifest = {
  assigned: AssignedTripsResponse;
  delivery_notes: DeliveryNoteDetails[];
  rejection_reasons?: string[];
  synced_at: string;
};

export async function loadAssignedTrips(
  installationId: string,
  deviceIdentifier?: string | null,
): Promise<ReadThroughResult<AssignedTripsResponse>> {
  const result = await readThroughCache<OfflineManifest>('offline-manifest', 'current', () =>
    getOfflineWork(installationId, deviceIdentifier),
  );

  if (result.source === 'server') {
    await Promise.all(
      [
        ...((result.data.assigned.trips || []).map((trip) =>
          setCachedValue('delivery-trip', trip.name, { trip }),
        )),
        ...result.data.delivery_notes.map((details) =>
          setCachedValue('delivery-note', `${details.trip.name}:${details.stop.name}`, details),
        ),
        setCachedValue('pod-options', 'current', {
          rejectionReasons: result.data.rejection_reasons || [],
        }),
      ],
    );
  }
  return {
    data: result.data.assigned,
    source: result.source,
    cachedAt: result.cachedAt || result.data.synced_at,
  } as ReadThroughResult<AssignedTripsResponse>;
}

export function loadTripDetails(tripName: string) {
  return readThroughCache<{ trip: DeliveryTrip }>('delivery-trip', tripName, () => getTripDetails(tripName));
}

export function loadDeliveryNoteDetails(tripName: string, stopName: string) {
  return readThroughCache<DeliveryNoteDetails>('delivery-note', `${tripName}:${stopName}`, () =>
    getDeliveryNoteDetails(tripName, stopName),
  );
}

export async function cacheStartedTrip(trip: Partial<DeliveryTrip> & Pick<DeliveryTrip, 'name'>) {
  const cachedTrip = await getCachedValue<{ trip: DeliveryTrip }>('delivery-trip', trip.name);
  const mergedTrip = cachedTrip ? { ...cachedTrip.value.trip, ...trip } : trip;
  const updates: Promise<unknown>[] = [setCachedValue('delivery-trip', trip.name, { trip: mergedTrip })];
  for (const stop of mergedTrip.stops || []) {
    const key = `${trip.name}:${stop.name}`;
    const cached = await getCachedValue<DeliveryNoteDetails>('delivery-note', key);
    if (!cached) continue;
    updates.push(
      setCachedValue('delivery-note', key, {
        ...cached.value,
        trip: {
          ...cached.value.trip,
          status: mergedTrip.status,
          erpnext_status: mergedTrip.erpnext_status,
          actual_start: mergedTrip.actual_start,
          actual_completion: mergedTrip.actual_completion,
          actions: mergedTrip.actions,
        },
        stop: {
          ...cached.value.stop,
          requires_trip_start: false,
          can_complete_delivery: !cached.value.stop.visited,
        },
      }),
    );
  }
  await Promise.all(updates);
}

export async function cachePendingProofOfDelivery(
  tripName: string,
  stopName: string,
  operationId: string,
) {
  const [cachedTrip, cachedDetails, cachedManifest] = await Promise.all([
    getCachedValue<{ trip: DeliveryTrip }>('delivery-trip', tripName),
    getCachedValue<DeliveryNoteDetails>('delivery-note', `${tripName}:${stopName}`),
    getCachedValue<OfflineManifest>('offline-manifest', 'current'),
  ]);
  const pendingProof = {
    name: `offline-${operationId}`,
    status: 'Awaiting Sync',
    docstatus: 0,
  };
  const markPending = (stop: DeliveryTrip['stops'][number]) => stop.name === stopName
    ? {
        ...stop,
        visited: 1,
        delivery_status: 'Awaiting Sync',
        can_arrive: false,
        can_complete_delivery: false,
        requires_trip_start: false,
        proof_of_delivery: pendingProof,
      }
    : stop;
  const updateTrip = (trip: DeliveryTrip) => {
    const stops = trip.stops.map(markPending);
    return {
      ...trip,
      stops,
      completed_stop_count: stops.filter((stop) => stop.visited).length,
      next_stop: stops.find((stop) => !stop.visited)?.name,
    };
  };

  const updates: Promise<unknown>[] = [];
  if (cachedTrip) {
    updates.push(setCachedValue('delivery-trip', tripName, { trip: updateTrip(cachedTrip.value.trip) }));
  }
  if (cachedDetails) {
    updates.push(setCachedValue('delivery-note', `${tripName}:${stopName}`, {
      ...cachedDetails.value,
      stop: markPending(cachedDetails.value.stop),
    }));
  }
  if (cachedManifest) {
    updates.push(setCachedValue('offline-manifest', 'current', {
      ...cachedManifest.value,
      assigned: {
        ...cachedManifest.value.assigned,
        trips: cachedManifest.value.assigned.trips?.map((trip) =>
          trip.name === tripName ? updateTrip(trip) : trip,
        ),
      },
      delivery_notes: cachedManifest.value.delivery_notes.map((details) =>
        details.trip.name === tripName && details.stop.name === stopName
          ? { ...details, stop: markPending(details.stop) }
          : details,
      ),
    }));
  }
  await Promise.all(updates);
}

export async function cacheSynchronizedTrip(trip: DeliveryTrip) {
  const cachedManifest = await getCachedValue<OfflineManifest>('offline-manifest', 'current');
  const updates: Promise<unknown>[] = [setCachedValue('delivery-trip', trip.name, { trip })];

  for (const stop of trip.stops) {
    const key = `${trip.name}:${stop.name}`;
    const cachedDetails = await getCachedValue<DeliveryNoteDetails>('delivery-note', key);
    if (!cachedDetails) continue;
    updates.push(setCachedValue('delivery-note', key, {
      ...cachedDetails.value,
      trip: {
        ...cachedDetails.value.trip,
        status: trip.status,
        erpnext_status: trip.erpnext_status,
        actual_start: trip.actual_start,
        actual_completion: trip.actual_completion,
        actions: trip.actions,
      },
      stop,
    }));
  }

  if (cachedManifest) {
    const stops = new Map(trip.stops.map((stop) => [stop.name, stop]));
    updates.push(setCachedValue('offline-manifest', 'current', {
      ...cachedManifest.value,
      assigned: {
        ...cachedManifest.value.assigned,
        trips: cachedManifest.value.assigned.trips?.map((cachedTrip) =>
          cachedTrip.name === trip.name ? trip : cachedTrip,
        ),
      },
      delivery_notes: cachedManifest.value.delivery_notes.map((details) => {
        const stop = details.trip.name === trip.name ? stops.get(details.stop.name) : undefined;
        return stop ? {
          ...details,
          trip: {
            ...details.trip,
            status: trip.status,
            erpnext_status: trip.erpnext_status,
            actual_start: trip.actual_start,
            actual_completion: trip.actual_completion,
            actions: trip.actions,
          },
          stop,
        } : details;
      }),
    }));
  }
  await Promise.all(updates);
}

export async function loadProofOfDeliveryDraft(tripName: string, stopName: string) {
  try {
    return await readThroughCache<ProofOfDeliveryDraft>(
      'proof-of-delivery',
      `${tripName}:${stopName}`,
      () => prepareProofOfDelivery(tripName, stopName),
    );
  } catch (error) {
    if (!isConnectivityFailure(error)) throw error;
    const [details, options] = await Promise.all([
      getCachedValue<DeliveryNoteDetails>('delivery-note', `${tripName}:${stopName}`),
      getCachedValue<{ rejectionReasons: string[] }>('pod-options', 'current'),
    ]);
    if (!details) throw error;

    const { delivery_note: note, stop } = details.value;
    const pod: ProofOfDeliveryDraft = {
      name: `offline-${tripName}-${stopName}`,
      docstatus: 0,
      status: 'Pending',
      delivery_trip: tripName,
      delivery_stop: stopName,
      delivery_note: note.name,
      customer: note.customer,
      delivery_address: stop.address || stop.customer_address || '',
      rejection_reasons: options?.value.rejectionReasons || [],
      items: note.items.map((item) => ({
        name: item.name,
        delivery_note_item: item.name,
        item_code: item.item_code,
        item_name: item.item_name,
        ordered_qty: item.qty,
        delivered_qty: item.qty,
        rejected_qty: 0,
        uom: item.uom,
        batch_no: item.batch_no,
      })),
    };
    await setCachedValue('proof-of-delivery', `${tripName}:${stopName}`, pod);
    return { data: pod, source: 'cache', cachedAt: details.updatedAt } as ReadThroughResult<ProofOfDeliveryDraft>;
  }
}
