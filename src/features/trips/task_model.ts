import type { DeliveryStop, TransportTask } from './types';

export type StopAction = TransportTask & { queued?: boolean };
const finished = new Set(['Completed', 'Completed with Variance', 'Failed', 'Cancelled']);
export const taskFinished = (task: Pick<TransportTask, 'status'>) => finished.has(task.status);
export const taskTitle = (task: Pick<TransportTask, 'task_type'>) => task.task_type === 'Return Pickup' ? 'Collect returns' : task.task_type === 'Customer Delivery' ? 'Customer delivery' : 'Depot delivery';
export const taskActionLabel = (task: Pick<TransportTask, 'task_type'>) => task.task_type === 'Return Pickup' ? 'Confirm pickup' : 'Complete delivery';

export function stopActions(stop: DeliveryStop, pending: Record<string, string> = {}): StopAction[] {
  const tasks = (stop.tasks || []).filter((task) => task.task_type !== 'Transfer Dispatch' && task.status !== 'Cancelled');
  if (stop.delivery_note && !tasks.some((task) => task.task_type === 'Customer Delivery')) {
    const queued = stop.delivery_status === 'Awaiting Sync' || stop.proof_of_delivery?.status === 'Awaiting Sync';
    tasks.unshift({ name: `customer:${stop.delivery_note}`, task_type: 'Customer Delivery', delivery_note: stop.delivery_note, reference_doctype: 'Delivery Note', reference_name: stop.delivery_note, party_name: stop.customer, status: queued ? 'Awaiting Sync' : stop.proof_of_delivery?.docstatus === 1 ? 'Completed' : 'Ready', can_record_proof: stop.can_complete_delivery });
  }
  return tasks.map((task) => ({ ...task,
    status: pending[task.name] ? pending[task.name] === 'Needs Attention' ? 'Needs Attention' : 'Awaiting Sync' : task.status,
    queued: Boolean(pending[task.name]) || task.status === 'Awaiting Sync',
  })).sort((a, b) => Number(taskFinished(a)) - Number(taskFinished(b)) || Number(a.task_type === 'Return Pickup') - Number(b.task_type === 'Return Pickup'));
}

export function stopActionPath(tripName: string, stopName: string, task: TransportTask) {
  const root = `/trips/${encodeURIComponent(tripName)}`;
  return task.task_type === 'Customer Delivery'
    ? `${root}/stops/${encodeURIComponent(stopName)}`
    : `${root}/tasks/${encodeURIComponent(task.name)}?stopName=${encodeURIComponent(stopName)}`;
}

export function nextStopAction(stop: DeliveryStop, currentTask: string, pending: Record<string, string> = {}) {
  const available = stopActions(stop, pending).filter((task) => task.name !== currentTask && !taskFinished(task) && !task.queued && !task.blocked_reason);
  return available.find((task) => task.can_record_proof) || available[0];
}
