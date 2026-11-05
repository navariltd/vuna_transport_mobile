import { loadTripDetails } from '../../offline/trip_repository';
import { pendingTransportProof } from '../../offline/transport_proof_repository';

export async function loadStopWork(tripName: string, stopName: string) {
  const result = await loadTripDetails(tripName);
  const stop = result.data.trip.stops.find((item) => item.name === stopName);
  if (!stop) throw new Error('This stop is no longer part of the trip.');
  const pending: Record<string, string> = {};
  await Promise.all((stop.tasks || []).filter((task) => task.task_type !== 'Customer Delivery').map(async (task) => {
    const operation = await pendingTransportProof(task.name);
    if (operation) pending[task.name] = operation.status;
  }));
  return { trip: result.data.trip, stop, pending };
}
