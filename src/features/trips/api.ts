import { callMobileMethod } from '../../auth/session';
import { getOnboardingRecord } from '../../storage/onboarding';
import type { DeliveryNoteDetails, DeliveryTrip, MobileTripIncidents, ProofOfDeliveryDraft } from './types';

async function deviceArgs() {
  const record = await getOnboardingRecord();
  if (!record) throw new Error('This device has not been connected to a Vuna Transport site.');
  return {
    installation_id: record.installationId,
    device_identifier: record.deviceIdentifier,
  };
}

export type CollectionItemOption = { key: string; reference_row: string; row_idx: number; name: string; item_name: string; stock_uom: string; uom: string; qty: number; uoms: string[]; batch_no?: string; serial_no?: string; has_batch_no: number; has_serial_no: number };
export type CollectionRecord = { name: string; collection_location: string; collection_review_status: string; return_request?: string };
export async function getUnplannedCollections(tripName: string, stopName: string): Promise<CollectionRecord[]> {
  return callMobileMethod('vuna_transport.api.get_mobile_unplanned_collections', { ...(await deviceArgs()), trip_name: tripName, stop_name: stopName }, 'Could not load collections.');
}
export async function getCollectionSetup(tripName: string, stopName: string): Promise<{ enabled: boolean; reference_types: string[] }> {
  return callMobileMethod('vuna_transport.api.get_mobile_collection_setup', { ...(await deviceArgs()), trip_name: tripName, stop_name: stopName }, 'Could not identify the stop source.');
}
export async function searchCollectionItems(tripName: string, stopName: string, referenceType: string, referenceName: string): Promise<CollectionItemOption[]> {
  return callMobileMethod('vuna_transport.api.search_mobile_collection_items', { ...(await deviceArgs()), trip_name: tripName, stop_name: stopName, reference_doctype: referenceType, reference_name: referenceName }, 'Could not load items from this document.');
}
export async function reportUnplannedCollection(tripName: string, payload: Record<string, unknown>): Promise<{ name: string; created: boolean }> {
  return callMobileMethod('vuna_transport.api.report_mobile_unplanned_collection', { ...(await deviceArgs()), trip_name: tripName, payload }, 'Could not record collection.');
}

export type TransferProofItem = {
  has_batch_no?: boolean; has_serial_no?: boolean;
  source_row: string; item_code: string; item_name?: string; batch_no?: string; qty: number;
  planned_qty: number; uom: string; serial_no?: string;
  rejected_qty?: number; rejected_serial_no?: string; rejection_reason?: string; rejection_reason_remarks?: string;
  depot_received_rejected_qty?: number; depot_received_rejected_serial_no?: string;
  rejected_goods_handling?: string;
};
export type TransferProof = { name?: string; docstatus: number; task: string; task_type: string; capture_identity?: boolean; return_request?: string; return_context?: string; reference_doctype?: string; reference_name?: string; received_by?: string; receiver_phone?: string; signature?: string; delivery_photo?: string; rejection_reasons?: string[]; delivery_datetime?: string; remarks?: string; outcome?: string; status?: string; items: TransferProofItem[] };
export async function prepareTransferProof(taskName: string, saveDraft = false): Promise<TransferProof> {
  return callMobileMethod('vuna_transport.api.prepare_mobile_transport_proof',
    { ...(await deviceArgs()), task_name: taskName, save_draft: saveDraft }, 'Could not load Proof of Delivery.');
}
export async function submitTransferProof(taskName: string, payload: Record<string, unknown>): Promise<{ name: string; outcome: string }> {
  return callMobileMethod('vuna_transport.api.submit_mobile_transport_proof',
    { ...(await deviceArgs()), task_name: taskName, payload }, 'Could not submit transfer confirmation.');
}

export async function getTripDetails(tripName: string): Promise<{ trip: DeliveryTrip }> {
  return callMobileMethod(
    'vuna_transport.api.get_mobile_delivery_trip_details',
    { ...(await deviceArgs()), trip_name: tripName },
    'Could not load the Delivery Trip.',
  );
}

export async function getTripRoadRoute(tripName: string): Promise<unknown> {
  return callMobileMethod('vuna_transport.api.get_mobile_trip_road_route',
    { ...(await deviceArgs()), trip_name: tripName }, 'Could not show the road route. You can still complete your stops.', 180000);
}

export async function getMobileGoogleMapsKey(platform: string): Promise<unknown> {
  return callMobileMethod('vuna_transport.api.get_mobile_google_maps_key',
    { ...(await deviceArgs()), platform }, 'Could not load your company’s mobile Google Maps configuration.');
}

// Authorization is live, never cached or placed in the offline outbox.
export async function getNavigationDestination(tripName: string, stopName: string, start = false): Promise<unknown> {
  return callMobileMethod(start ? 'vuna_transport.api.start_mobile_navigation' : 'vuna_transport.api.get_mobile_navigation_destination',
    { ...(await deviceArgs()), trip_name: tripName, stop_name: stopName }, 'In-app navigation is unavailable. You can still complete this stop.');
}

export async function startDeliveryTrip(tripName: string): Promise<{ trip: DeliveryTrip }> {
  return callMobileMethod(
    'vuna_transport.api.start_mobile_trip',
    { ...(await deviceArgs()), trip_name: tripName },
    'Could not start the Delivery Trip.',
  );
}

export async function getTripIncidents(tripName: string): Promise<MobileTripIncidents> {
  return callMobileMethod(
    'vuna_transport.api.get_mobile_incidents',
    { ...(await deviceArgs()), trip_name: tripName },
    'Could not load Vehicle Incidents.',
  );
}

export async function reportTripIncident(
  tripName: string,
  payload: Record<string, unknown>,
): Promise<{ incident: string; created: boolean }> {
  return callMobileMethod(
    'vuna_transport.api.report_mobile_incident',
    { ...(await deviceArgs()), trip_name: tripName, payload },
    'Could not report the Vehicle Incident.',
  );
}

export async function resolveTripIncident(
  tripName: string,
  incidentName: string,
  resolution: string,
): Promise<{ incident: string; status: string; submitted: boolean }> {
  return callMobileMethod(
    'vuna_transport.api.resolve_mobile_incident',
    {
      ...(await deviceArgs()),
      trip_name: tripName,
      incident_name: incidentName,
      resolution,
    },
    'Could not resolve the Vehicle Incident.',
  );
}

export async function getDeliveryNoteDetails(
  tripName: string,
  stopName: string,
): Promise<DeliveryNoteDetails> {
  return callMobileMethod(
    'vuna_transport.api.get_mobile_delivery_note_details',
    { ...(await deviceArgs()), trip_name: tripName, stop_name: stopName },
    'Could not load the Delivery Note.',
  );
}

export async function prepareProofOfDelivery(
  tripName: string,
  stopName: string,
): Promise<ProofOfDeliveryDraft> {
  return callMobileMethod(
    'vuna_transport.api.prepare_mobile_pod',
    { ...(await deviceArgs()), trip_name: tripName, stop_name: stopName },
    'Could not prepare Proof of Delivery.',
  );
}

export async function submitProofOfDelivery(
  tripName: string,
  stopName: string,
  payload: ProofOfDeliveryDraft,
): Promise<{ proof_of_delivery: string; status: string; trip: DeliveryTrip }> {
  return callMobileMethod(
    'vuna_transport.api.submit_mobile_pod',
    {
      ...(await deviceArgs()),
      trip_name: tripName,
      stop_name: stopName,
      payload,
    },
    'Could not submit Proof of Delivery.',
  );
}

export async function uploadPODAttachment(
  tripName: string,
  stopName: string,
  podName: string,
  attachmentType: 'signature' | 'delivery_photo',
  content: string,
  filename: string,
  contentEncoding: 'base64' | 'text' = 'base64',
): Promise<{ file_url: string; fieldname: string }> {
  return callMobileMethod(
    'vuna_transport.api.upload_mobile_pod_file',
    {
      ...(await deviceArgs()),
      trip_name: tripName,
      stop_name: stopName,
      pod_name: podName,
      attachment_type: attachmentType,
      content,
      filename,
      content_encoding: contentEncoding,
    },
    'Could not upload the Proof of Delivery attachment.',
    120000,
  );
}
