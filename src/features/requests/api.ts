import { callMobileMethod } from '../../auth/session';
import { getOnboardingRecord } from '../../storage/onboarding';
import type { CreatedMobileRequest, MaterialRequestItemOption, MobileRequestDetail, MobileRequestHistoryItem, MobileRequestSetup } from './types';

async function requestArgs() {
  const record = await getOnboardingRecord();
  if (!record) throw new Error('This device has not been connected to a Vuna Transport site.');
  return {
    installation_id: record.installationId,
    device_identifier: record.deviceIdentifier,
  };
}

export async function getMobileRequestSetup(tripName: string): Promise<MobileRequestSetup> {
  return callMobileMethod(
    'vuna_transport.api.get_mobile_trip_request_setup',
    { ...(await requestArgs()), trip_name: tripName },
    'Could not load request options.',
  );
}

export async function getMobileRequestHistory(): Promise<MobileRequestHistoryItem[]> {
  const result = await callMobileMethod(
    'vuna_transport.api.get_mobile_request_history',
    { ...(await requestArgs()), limit: 100 },
    'Could not load your requests.',
    45000,
  );
  return result.requests || [];
}

export async function getMobileRequestDetails(
  doctype: MobileRequestHistoryItem['doctype'],
  name: string,
): Promise<MobileRequestDetail> {
  return callMobileMethod(
    'vuna_transport.api.get_mobile_request',
    { ...(await requestArgs()), doctype, name },
    'Could not load the request details.',
    45000,
  );
}

export async function searchMaterialRequestItems(
  tripName: string,
  text: string,
): Promise<MaterialRequestItemOption[]> {
  return callMobileMethod(
    'vuna_transport.api.search_mobile_material_items',
    { ...(await requestArgs()), trip_name: tripName, txt: text },
    'Could not search Items.',
  );
}

export async function createExpenseClaim(
  tripName: string,
  payload: Record<string, unknown>,
): Promise<CreatedMobileRequest> {
  return callMobileMethod(
    'vuna_transport.api.create_mobile_trip_expense_claim',
    { ...(await requestArgs()), trip_name: tripName, payload },
    'Could not create the Expense Claim.',
  );
}

export async function createMaterialRequest(
  tripName: string,
  payload: Record<string, unknown>,
): Promise<CreatedMobileRequest> {
  return callMobileMethod(
    'vuna_transport.api.create_mobile_trip_material_request',
    { ...(await requestArgs()), trip_name: tripName, payload },
    'Could not create the Material Request.',
  );
}
