import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'vuna_transport_mobile_session';
const PENDING_SESSION_KEY = 'vuna_transport_mobile_pending_session';
const DEFAULT_REQUEST_TIMEOUT = 45000;
type SessionInterruption = 'expired' | 'device';
const sessionListeners = new Set<(reason: SessionInterruption) => void>();
const sessionChangeListeners = new Set<(session: MobileSession | null) => void>();
const sessionChecks = new Map<string, Promise<boolean>>();
let sessionMutation: Promise<unknown> = Promise.resolve();
let signInGeneration = 0;

function mutateSession<T>(operation: () => Promise<T>): Promise<T> {
  const task = sessionMutation.then(operation, operation);
  sessionMutation = task.then(() => {}, () => {});
  return task;
}

function notifySessionChanged(session: MobileSession | null) {
  for (const listener of sessionChangeListeners) listener(session);
}

export function subscribeToSessionChange(listener: (session: MobileSession | null) => void) {
  sessionChangeListeners.add(listener);
  return () => { sessionChangeListeners.delete(listener); };
}

export type MobileMapConfiguration = {
  version: 1;
  selection: 'Automatic' | 'OpenStreetMap' | 'Google Maps';
  provider: 'google' | 'openstreetmap';
};

export function normalizeMobileMapConfiguration(value: unknown): MobileMapConfiguration | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !['Automatic', 'OpenStreetMap', 'Google Maps'].includes(String(record.selection))) return null;
  if (record.provider !== 'google' && record.provider !== 'openstreetmap') return null;
  if (record.selection === 'OpenStreetMap' && record.provider !== 'openstreetmap') return null;
  if (record.selection === 'Google Maps' && record.provider !== 'google') return null;
  return { version: 1, selection: record.selection as MobileMapConfiguration['selection'], provider: record.provider };
}

function sameSession(a: MobileSession | null, b: MobileSession) {
  return Boolean(a && a.sid === b.sid && a.siteUrl === b.siteUrl && a.user === b.user);
}

async function updateMapConfiguration(session: MobileSession, value: unknown) {
  const mapConfig = normalizeMobileMapConfiguration(value);
  if (!mapConfig) return;
  await mutateSession(async () => {
    const current = await getSession();
    if (!sameSession(current, session) || !current) return;
    if (JSON.stringify(current.mapConfig) === JSON.stringify(mapConfig)) return;
    const updated = { ...current, mapConfig };
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(updated));
    notifySessionChanged(updated);
  });
}

export function subscribeToSessionInterruption(listener: (reason: SessionInterruption) => void) {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
}

export class MobileAccessError extends Error {
  constructor(public reason: SessionInterruption, message: string) {
    super(message);
    this.name = 'MobileAccessError';
  }
}

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
  mapConfig?: MobileMapConfiguration;
};

export async function getSession() {
  const value = await SecureStore.getItemAsync(SESSION_KEY);
  return value ? (JSON.parse(value) as MobileSession) : null;
}

export async function clearSession() {
  signInGeneration += 1;
  await mutateSession(async () => {
    await Promise.all([SecureStore.deleteItemAsync(SESSION_KEY), SecureStore.deleteItemAsync(PENDING_SESSION_KEY)]);
    notifySessionChanged(null);
  });
}

export async function clearSessionForSiteChange(siteUrl: string, checkSavedWork: () => Promise<void>, markSetup: () => Promise<void>) {
  return mutateSession(async () => {
    const [current, pending] = await Promise.all([getSession(), getPendingSession()]);
    if ([current, pending].some((value) => value && value.siteUrl !== siteUrl)) {
      throw new Error('Your connected site changed. Reopen this screen and try again.');
    }
    // This also works at login after session expiry, without needing an active
    // account scope. Failed checks must leave credentials and setup untouched.
    await checkSavedWork();
    signInGeneration += 1;
    await Promise.all([SecureStore.deleteItemAsync(SESSION_KEY), SecureStore.deleteItemAsync(PENDING_SESSION_KEY)]);
    notifySessionChanged(null);
    await markSetup();
  });
}

export async function getPendingSession(): Promise<MobileSession | null> {
  const value = await SecureStore.getItemAsync(PENDING_SESSION_KEY);
  return value ? JSON.parse(value) : null;
}

async function interruptSession(session: MobileSession, reason: SessionInterruption) {
  return mutateSession(async () => {
    const current = await getSession();
    const pending = await getPendingSession();
    // A late response from an older login must not sign out a newer session.
    const matches = (candidate: MobileSession | null) => sameSession(candidate, session);
    if (!matches(current) && !matches(pending)) return;
    if (reason === 'device') await SecureStore.setItemAsync(PENDING_SESSION_KEY, JSON.stringify(session));
    else await SecureStore.deleteItemAsync(PENDING_SESSION_KEY);
    await SecureStore.deleteItemAsync(SESSION_KEY);
    notifySessionChanged(null);
    for (const listener of sessionListeners) listener(reason);
  });
}

async function authenticatedRequest(session: MobileSession, method: string, args: Record<string, unknown>, fallback: string, timeoutMs = DEFAULT_REQUEST_TIMEOUT) {
  const { response, payload } = await requestJson(`${session.siteUrl}/api/method/${method}`, {
    body: JSON.stringify(args),
    headers: { 'Content-Type': 'application/json', Cookie: `sid=${session.sid}` },
    method: 'POST',
  }, timeoutMs);
  if (isExpiredResponse(response, payload) || (isGuestAccessDenial(response, payload) && await confirmGuestSession(session))) {
    await interruptSession(session, 'expired');
    throw new MobileAccessError('expired', 'Your session has expired. Please sign in again. Your saved work is still on this device.');
  }
  if (!response.ok || payload.exc) throw new MobileRequestError(getServerMessage(payload, fallback), 'response');
  return payload.message;
}

function isExpiredResponse(response: Response, payload: ServerPayload) {
  return response.status === 401 || Boolean(payload.session_expired) || ['AuthenticationError', 'SessionExpired'].includes(payload.exc_type);
}

function isGuestAccessDenial(response: Response, payload: ServerPayload) {
  if (response.status !== 403 || payload.exc_type !== 'PermissionError') return false;
  // Frappe uses this denial both for Guest access and genuinely unavailable methods.
  // Do not interpret an ordinary role/document PermissionError as session expiry.
  const message = getServerMessage(payload, '').replace(/<[^>]*>/g, ' ');
  return /not\s+whitelisted/i.test(message) && /login\s+to\s+access/i.test(message);
}

function confirmGuestSession(session: MobileSession): Promise<boolean> {
  const key = JSON.stringify([session.siteUrl, session.user, session.sid]);
  const pending = sessionChecks.get(key);
  if (pending) return pending;
  const check = (async () => {
    const { response, payload } = await requestJson(`${session.siteUrl}/api/method/frappe.auth.get_logged_user`, {
      headers: { Cookie: `sid=${session.sid}` },
      method: 'GET',
    }, 10000);
    return isExpiredResponse(response, payload)
      || isGuestAccessDenial(response, payload)
      || (response.ok && payload.message === 'Guest');
  })().finally(() => { sessionChecks.delete(key); });
  sessionChecks.set(key, check);
  return check;
}

export async function refreshDeviceRegistration(device: Record<string, unknown>) {
  const session = await getPendingSession();
  if (!session) throw new MobileAccessError('expired', 'Please sign in again to check device access.');
  const result = await authenticatedRequest(session, 'vuna_transport.api.bootstrap_mobile_device', device, 'Could not check device access.');
  if (result?.allowed) {
    await mutateSession(async () => {
      const pending = await getPendingSession();
      if (!sameSession(pending, session)) {
        throw new MobileAccessError('expired', 'Your sign-in changed. Please sign in again.');
      }
      const restored = { ...session, mapConfig: normalizeMobileMapConfiguration(result.map_config) || session.mapConfig };
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(restored));
      await SecureStore.deleteItemAsync(PENDING_SESSION_KEY);
      notifySessionChanged(restored);
    });
  }
  return result;
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
  if (!session) {
    const reason = await getPendingSession() ? 'device' : 'expired';
    for (const listener of sessionListeners) listener(reason);
    throw new MobileAccessError(reason, reason === 'device' ? 'Please check device access again.' : 'Your session has expired. Please sign in again.');
  }
  const result = await authenticatedRequest(session, method, args, fallback, timeoutMs);
  if (['DEVICE_NOT_REGISTERED', 'DEVICE_NOT_ACTIVE', 'MULTIPLE_ACTIVE_DEVICES'].includes(result?.code)) {
    await interruptSession(session, 'device');
    throw new MobileAccessError('device', result.message || 'This device is not currently authorized.');
  }
  if (!sameSession(await getSession(), session)) {
    throw new MobileAccessError('expired', 'Your sign-in changed while work was loading. Refresh to load the current account.');
  }
  await updateMapConfiguration(session, result?.map_config);
  if (!sameSession(await getSession(), session)) {
    throw new MobileAccessError('expired', 'Your sign-in changed while work was loading. Refresh to load the current account.');
  }
  return result;
}

export async function loginAndRegisterDevice(siteUrl: string, username: string, password: string, device: Record<string, unknown>) {
  const generation = ++signInGeneration;
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
  const session: MobileSession = { siteUrl, sid, user: username, mapConfig: normalizeMobileMapConfiguration(result?.map_config) || undefined };
  return mutateSession(async () => {
    if (generation !== signInGeneration) throw new MobileAccessError('expired', 'Your sign-in changed. Please try again.');
    if (!result?.allowed) {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      await SecureStore.setItemAsync(PENDING_SESSION_KEY, JSON.stringify(session));
      notifySessionChanged(null);
      return { allowed: false, message: result?.message || 'This device is not allowed.' };
    }
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    await SecureStore.deleteItemAsync(PENDING_SESSION_KEY);
    notifySessionChanged(session);
    return { allowed: true, message: null };
  });
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
    if (response.status === 401) return {};
    if (response.status === 403) {
      throw new MobileRequestError('You do not have permission to perform this action.', 'response');
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
      const messages = JSON.parse(payload._server_messages) as (string | { message?: string })[];
      const message = messages.map((item) => (typeof item === 'string' ? JSON.parse(item) : item).message).filter(Boolean).join(' ');
      if (message) return message;
    } catch {
      // Keep the fallback when Frappe's server messages are not JSON.
    }
  }
  return fallback;
}
