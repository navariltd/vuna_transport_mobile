import type { TransferProof } from '../trips/api';
import type { ProofOfDeliveryDraft } from '../trips/types';

export type PODFormItem = {
  id: string; itemCode: string; itemName?: string; batch?: string; uom: string;
  planned: number; accepted: string; rejected: string; recordMissing?: boolean;
  reason?: string; reasonNotes?: string; serials?: string; availableSerials?: string;
  rejectedSerials?: string; custody?: string; depotRejected?: string; depotSerials?: string;
  captureBatch?: boolean; captureSerials?: boolean;
};
export type PODFormDraft = {
  mode: 'customer' | 'depot' | 'pickup'; party: string; reference: string;
  receivedBy: string; phone: string; remarks: string; rejectionReasons: string[];
  items: PODFormItem[];
};
export type PODFormSubmission = {
  draft: PODFormDraft; signatureSvg: string | null; photo: { uri: string; filename: string } | null;
};

export function rejectedQuantity(item: PODFormItem, mode: PODFormDraft['mode']) {
  return mode === 'pickup' ? 0 : mode === 'depot' && item.recordMissing ? Number(item.rejected) : Math.max(item.planned - Number(item.accepted), 0);
}
export function depotRejectedQuantity(item: PODFormItem, rejected: number) {
  return rejected <= 0 ? 0 : item.custody === 'All received by depot' ? rejected : item.custody === 'Split between depot and vehicle' ? Number(item.depotRejected) : 0;
}
export function validatePODForm(draft: PODFormDraft) {
  const errors: Record<string, string> = {};
  if (!draft.receivedBy.trim()) errors.receivedBy = draft.mode === 'pickup' ? 'Enter the name of the person releasing the goods.' : 'Enter the receiver name.';
  for (const item of draft.items) {
    const accepted = Number(item.accepted);
    const rejected = rejectedQuantity(item, draft.mode);
    if (!item.accepted.trim() || !Number.isFinite(accepted) || accepted < 0 || accepted > item.planned) errors[`quantity.${item.id}`] = `Enter a quantity between 0 and ${item.planned}.`;
    if (!Number.isFinite(rejected) || rejected < 0 || accepted + rejected > item.planned || (item.recordMissing && !item.rejected.trim())) errors[`rejected.${item.id}`] = 'Accepted plus rejected cannot exceed the planned quantity.';
    if (rejected > 0 && !item.reason && !item.reasonNotes?.trim()) errors[`rejection.${item.id}`] = 'Select a rejection reason or add details.';
    if (draft.mode === 'depot' && rejected > 0 && item.custody === 'Split between depot and vehicle') {
      const depot = depotRejectedQuantity(item, rejected);
      if (!item.depotRejected?.trim() || !Number.isFinite(depot) || depot <= 0 || depot >= rejected) errors[`custody.${item.id}`] = 'Enter a depot quantity greater than zero and less than the rejected quantity.';
    }
    if (item.planned - accepted - rejected > 0.000001 && !draft.remarks.trim()) errors.remarks = draft.mode === 'pickup' ? 'Explain the uncollected quantity.' : 'Explain the missing or unaccounted quantity.';
  }
  return errors;
}

export function customerForm(pod: ProofOfDeliveryDraft): PODFormDraft {
  return { mode: 'customer', party: pod.customer, reference: pod.delivery_note, receivedBy: pod.received_by || '', phone: pod.receiver_phone || '', remarks: pod.remarks || '', rejectionReasons: pod.rejection_reasons,
    items: pod.items.map((item) => ({ id: item.name, itemCode: item.item_code, itemName: item.item_name, batch: item.batch_no, uom: item.uom, planned: item.ordered_qty, accepted: String(item.delivered_qty), rejected: String(item.rejected_qty || 0), reason: item.rejection_reason, reasonNotes: item.rejection_reason_remarks })) };
}
export function applyCustomerForm(pod: ProofOfDeliveryDraft, draft: PODFormDraft): ProofOfDeliveryDraft {
  return { ...pod, received_by: draft.receivedBy.trim(), receiver_phone: draft.phone.trim(), remarks: draft.remarks.trim(), items: pod.items.map((item) => {
    const form = draft.items.find((row) => row.id === item.name)!;
    return { ...item, delivered_qty: Number(form.accepted), rejected_qty: rejectedQuantity(form, draft.mode), rejection_reason: form.reason, rejection_reason_remarks: form.reasonNotes };
  }) };
}
export function transportForm(proof: TransferProof, party: string): PODFormDraft {
  const mode = ['Return Pickup', 'Supplier Pickup'].includes(proof.task_type) ? 'pickup' : 'depot';
  return { mode, party, reference: proof.reference_name || proof.return_request || '', receivedBy: proof.received_by || '', phone: proof.receiver_phone || '', remarks: proof.remarks || '', rejectionReasons: proof.rejection_reasons || [],
    items: proof.items.map((item, index) => ({ id: String(index), itemCode: item.item_code, itemName: item.item_name, batch: item.batch_no, uom: item.uom, planned: item.planned_qty, accepted: String(item.qty), rejected: String(item.rejected_qty || 0), recordMissing: mode === 'depot' && item.qty + (item.rejected_qty || 0) < item.planned_qty,
      captureBatch: Boolean(proof.capture_identity && item.has_batch_no), captureSerials: Boolean(proof.capture_identity && item.has_serial_no), reason: item.rejection_reason, reasonNotes: item.rejection_reason_remarks, serials: item.serial_no, availableSerials: item.serial_no || item.rejected_serial_no,
      rejectedSerials: item.rejected_serial_no, custody: item.rejected_goods_handling || 'All remain on vehicle', depotRejected: String(item.depot_received_rejected_qty || 0), depotSerials: item.depot_received_rejected_serial_no })) };
}
export function transportPayload(proof: TransferProof, draft: PODFormDraft, requestId: string) {
  return { request_id: requestId, received_by: draft.receivedBy.trim(), receiver_phone: draft.phone.trim(), remarks: draft.remarks.trim(), items: proof.items.map((row, index) => {
    const item = draft.items[index];
    const rejected = rejectedQuantity(item, draft.mode);
    return { source_row: row.source_row, batch_no: proof.capture_identity ? item.batch : row.batch_no, delivered_qty: Number(item.accepted), serial_no: item.serials,
      rejected_qty: rejected, rejected_serial_no: rejected ? item.rejectedSerials : '', rejected_goods_handling: item.custody,
      depot_received_rejected_qty: depotRejectedQuantity(item, rejected), depot_received_rejected_serial_no: rejected ? item.depotSerials : '',
      rejection_reason: item.reason, rejection_reason_remarks: item.reasonNotes?.trim() || draft.remarks.trim() };
  }) };
}
