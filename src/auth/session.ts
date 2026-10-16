import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'vuna_transport_mobile_session';
const DEFAULT_REQUEST_TIMEOUT = 45000;

type ServerPayload = Record<string, any>;
type MobileRequestFailure = 'network' | 'timeout' | 'response';

export class MobileRequestError extends Error {
  failure: MobileRequestFailure;

  constructor(message: string, failure: MobileRequestFailure) {
    super(message);
    this.name = 'MobileRequestError';
    this.failure = failure;
  }
}

export function isConnectivityFailure(error: unknown) {
  return error instanceof MobileRequestError && ['network', 'timeout'].includes(error.failure);
}

export type MobileSession = {
  siteUrl: string;
  sid: string;
  user: string;
};

export async function getSession() {
  const value = await SecureStore.getItemAsync(SESSION_KEY);
  return value ? (JSON.parse(value) as MobileSession) : null;
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export async function getDriverProfile(installationId: string, deviceIdentifier?: string | null) {
	return callMobileMethod('vuna_transport.api.get_mobile_driver_profile', {
		installation_id: installationId,
		device_identifier: deviceIdentifier,
	}, 'Could not load the driver profile.');
}

export async function getAssignedTrips(installationId: string, deviceIdentifier?: string | null) {
	return callMobileMethod('vuna_transport.api.get_mobile_assigned_delivery_trips', {
		installation_id: installationId,
		device_identifier: deviceIdentifier,
	}, 'Could not load assigned trips.');
}

export async function getOfflineWork(installationId: string, deviceIdentifier?: string | null) {
	return callMobileMethod('vuna_transport.api.get_mobile_offline_work', {
		installation_id: installationId,
		device_identifier: deviceIdentifier,
	}, 'Could not refresh offline work.');
}

export async function callMobileMethod(
	method: string,
	args: Record<string, unknown>,
	fallback: string,
	timeoutMs = DEFAULT_REQUEST_TIMEOUT,
) {
  const session = await getSession();
  if (!session) throw new Error('Your mobile session has expired. Please sign in again.');

	const { response, payload } = await requestJson(
		`${session.siteUrl}/api/method/${method}`,
		{
			body: JSON.stringify(args),
			headers: { 'Content-Type': 'application/json', Cookie: `sid=${session.sid}` },
			method: 'POST',
		},
		timeoutMs,
	);
	if (!response.ok || payload.exc) throw new MobileRequestError(getServerMessage(payload, fallback), 'response');
	return payload.message;
}

export async function loginAndRegisterDevice(siteUrl: string, username: string, password: string, device: Record<string, unknown>) {
  const { response: loginResponse, payload: loginPayload } = await requestJson(
    `${siteUrl}/api/method/login`,
    {
      body: JSON.stringify({ usr: username, pwd: password }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  if (!loginResponse.ok || loginPayload.exc) throw new Error(getServerMessage(loginPayload, 'Login failed.'));

  const setCookie = loginResponse.headers.get('set-cookie') || '';
  const sid = setCookie.match(/sid=([^;]+)/)?.[1];
  if (!sid) throw new Error('Frappe did not return a session cookie.');

  const { response: bootstrapResponse, payload: bootstrapPayload } = await requestJson(
    `${siteUrl}/api/method/vuna_transport.api.bootstrap_mobile_device`,
    {
      body: JSON.stringify(device),
      headers: { 'Content-Type': 'application/json', Cookie: `sid=${sid}` },
      method: 'POST',
    },
  );
  if (!bootstrapResponse.ok || bootstrapPayload.exc) throw new Error(getServerMessage(bootstrapPayload, 'Device registration failed.'));

  const result = bootstrapPayload.message;
  if (!result?.allowed) return { allowed: false, message: result?.message || 'This device is not allowed.' };

  const session = { siteUrl, sid, user: username };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  return { allowed: true, message: null };
}

async function requestJson(
  url: string,
  options: RequestInit,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT,
): Promise<{ response: Response; payload: ServerPayload }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return { response, payload: await parseResponse(response) };
  } catch (error) {
    if (error instanceof MobileRequestError) throw error;

    if (error instanceof Error && error.name === 'AbortError') {
      throw new MobileRequestError('The server is taking too long to respond. Check your connection and try again.', 'timeout');
    }

    console.warn('Vuna Transport mobile request failed', error);
    throw new MobileRequestError("You're offline or the server can't be reached. Check your internet connection and try again.", 'network');
  } finally {
    clearTimeout(timeout);
  }
}

async function parseResponse(response: Response): Promise<ServerPayload> {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    if (response.status === 401 || response.status === 403) {
      throw new MobileRequestError('Your session has expired or you no longer have access. Please sign in again.', 'response');
    }
    if (response.status >= 500) {
      throw new MobileRequestError('The server is temporarily unavailable. Please try again shortly.', 'response');
    }
    throw new MobileRequestError('The site returned an unexpected response. Check the site address or contact your administrator.', 'response');
  }
}

function getServerMessage(payload: ServerPayload, fallback: string) {
  if (typeof payload.message === 'string' && payload.message) return payload.message;
  if (typeof payload._server_messages === 'string') {
    try {
      const messages = JSON.parse(payload._server_messages) as { message?: string }[];
      const message = messages.map((item) => item.message).filter(Boolean).join(' ');
      if (message) return message;
    } catch {
      // Keep the fallback when Frappe's server messages are not JSON.
    }
  }
  return fallback;
}
