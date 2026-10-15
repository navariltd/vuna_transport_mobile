import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'vuna_transport_mobile_session';

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

export async function callMobileMethod(
	method: string,
	args: Record<string, unknown>,
	fallback: string,
) {
  const session = await getSession();
  if (!session) throw new Error('Your mobile session has expired. Please sign in again.');

	const response = await fetch(`${session.siteUrl}/api/method/${method}`, {
		body: JSON.stringify(args),
    headers: { 'Content-Type': 'application/json', Cookie: `sid=${session.sid}` },
    method: 'POST',
  });
	const payload = await parseResponse(response, fallback);
	if (!response.ok || payload.exc) throw new Error(getServerMessage(payload, fallback));
  return payload.message;
}

export async function loginAndRegisterDevice(siteUrl: string, username: string, password: string, device: Record<string, unknown>) {
  const loginResponse = await fetch(`${siteUrl}/api/method/login`, {
    body: JSON.stringify({ usr: username, pwd: password }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const loginPayload = await parseResponse(loginResponse, 'Login failed.');
  if (!loginResponse.ok || loginPayload.exc) throw new Error(getServerMessage(loginPayload, 'Login failed.'));

  const setCookie = loginResponse.headers.get('set-cookie') || '';
  const sid = setCookie.match(/sid=([^;]+)/)?.[1];
  if (!sid) throw new Error('Frappe did not return a session cookie.');

  const bootstrapResponse = await fetch(`${siteUrl}/api/method/vuna_transport.api.bootstrap_mobile_device`, {
    body: JSON.stringify(device),
    headers: { 'Content-Type': 'application/json', Cookie: `sid=${sid}` },
    method: 'POST',
  });
  const bootstrapPayload = await parseResponse(bootstrapResponse, 'Device registration failed.');
  if (!bootstrapResponse.ok || bootstrapPayload.exc) throw new Error(getServerMessage(bootstrapPayload, 'Device registration failed.'));

  const result = bootstrapPayload.message;
  if (!result?.allowed) return { allowed: false, message: result?.message || 'This device is not allowed.' };

  const session = { siteUrl, sid, user: username };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  return { allowed: true, message: null };
}

async function parseResponse(response: Response, fallback: string) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${fallback} The server returned HTTP ${response.status} instead of JSON. Check the site URL, migration status, and server logs.`);
  }
}

function getServerMessage(payload: Record<string, unknown>, fallback: string) {
  if (typeof payload.message === 'string' && payload.message) return payload.message;
  if (typeof payload.exception === 'string' && payload.exception) return payload.exception;
  if (typeof payload.exc_type === 'string' && payload.exc_type) return `${fallback} (${payload.exc_type})`;
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
