import { callMobileMethod } from '../../auth/session';
import { getOnboardingRecord } from '../../storage/onboarding';
import type { DeliveryNoteDetails, DeliveryTrip, ProofOfDeliveryDraft } from './types';

async function deviceArgs() {
  const record = await getOnboardingRecord();
  if (!record) throw new Error('This device has not been connected to a Vuna Transport site.');
  return {
    installation_id: record.installationId,
    device_identifier: record.deviceIdentifier,
  };
}

export async function getTripDetails(tripName: string): Promise<{ trip: DeliveryTrip }> {
  return callMobileMethod(
    'vuna_transport.api.get_mobile_delivery_trip_details',
    { ...(await deviceArgs()), trip_name: tripName },
    'Could not load the Delivery Trip.',
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
  );
}
