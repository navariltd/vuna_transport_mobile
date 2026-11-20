const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const sessionKey = 'vuna_transport_mobile_session';
const pendingKey = 'vuna_transport_mobile_pending_session';
const session = { siteUrl: 'https://example.test', sid: 'session-one', user: 'driver@example.test' };
const device = { installation_id: 'installation-one' };

function loadModule(filename, dependencies, globals = {}) {
  const code = ts.transpileModule(readFileSync(path.join(__dirname, '..', filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: (name) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    setTimeout, clearTimeout, AbortController, Error, console: { ...console, warn: () => {} }, ...globals,
  }, { filename });
  return module.exports;
}

function response(status, payload) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => 'sid=session-one; Path=/' }, text: async () => typeof payload === 'string' ? payload : JSON.stringify(payload) };
}

function setup() {
  const storage = new Map();
  const replies = [];
  const calls = [];
  const api = loadModule('src/auth/session.ts', {
    'expo-secure-store': {
      getItemAsync: async (key) => storage.get(key) || null,
      setItemAsync: async (key, value) => { storage.set(key, value); },
      deleteItemAsync: async (key) => { storage.delete(key); },
    },
  }, { fetch: async (...args) => {
    calls.push(args);
    assert.ok(replies.length, 'Unexpected request');
    const reply = replies.shift();
    return typeof reply === 'function' ? reply() : reply;
  } });
  return { api, storage, replies, calls };
}

test('changing site clears active and pending credentials only after saved-work checks', async () => {
  const { api, storage } = setup();
  storage.set(sessionKey, JSON.stringify(session));
  storage.set(pendingKey, JSON.stringify(session));
  const events = [];
  api.subscribeToSessionChange((next) => events.push(next));
  let setupRequired = false;
  await api.clearSessionForSiteChange(session.siteUrl, async () => {
    assert.ok(storage.has(sessionKey));
    assert.ok(storage.has(pendingKey));
  }, async () => {
    assert.equal(await api.getSession(), null);
    assert.equal(await api.getPendingSession(), null);
    setupRequired = true;
  });
  assert.equal(setupRequired, true);
  assert.deepEqual(events, [null]);
});

test('unsynced work or a failed database check preserves credentials and setup', async () => {
  for (const message of ['Pending work', 'Database unavailable']) {
    const { api, storage } = setup();
    storage.set(sessionKey, JSON.stringify(session));
    storage.set(pendingKey, JSON.stringify(session));
    let changed = false;
    await assert.rejects(api.clearSessionForSiteChange(session.siteUrl, async () => { throw new Error(message); }, async () => { changed = true; }));
    assert.equal(changed, false);
    assert.equal((await api.getSession()).sid, session.sid);
    assert.equal((await api.getPendingSession()).sid, session.sid);
  }
});

test('site switching can run after session expiry or while device approval is pending', async () => {
  for (const pending of [false, true]) {
    const { api, storage } = setup();
    if (pending) storage.set(pendingKey, JSON.stringify(session));
    let checked = false, marked = false;
    await api.clearSessionForSiteChange(session.siteUrl, async () => { checked = true; }, async () => { marked = true; });
    assert.equal(checked && marked, true);
    assert.equal(await api.getPendingSession(), null);
  }
});

test('a stale site-change action cannot sign out a newer customer account', async () => {
  const { api, storage } = setup();
  storage.set(sessionKey, JSON.stringify({ ...session, siteUrl: 'https://new-customer.test' }));
  await assert.rejects(api.clearSessionForSiteChange(session.siteUrl, async () => assert.fail('Must not check another site'), async () => assert.fail('Must not reset another site')));
  assert.equal((await api.getSession()).siteUrl, 'https://new-customer.test');
});

test('a late sign-in response cannot restore the old account after changing site', async () => {
  const { api, replies } = setup();
  let finish;
  replies.push(response(200, {}), () => new Promise((resolve) => { finish = resolve; }));
  const signIn = api.loginAndRegisterDevice(session.siteUrl, session.user, 'password', device);
  const rejected = assert.rejects(signIn, api.MobileAccessError);
  await new Promise(setImmediate);
  await api.clearSessionForSiteChange(session.siteUrl, async () => {}, async () => {});
  finish(response(200, { message: { allowed: true } }));
  await rejected;
  assert.equal(await api.getSession(), null);
});

test('mobile map preferences accept only the credential-free supported contract', () => {
  const { api } = setup();
  const safe = api.normalizeMobileMapConfiguration({ version: 1, selection: 'Automatic', provider: 'google', api_key: 'must-not-be-stored' });
  assert.equal(JSON.stringify(safe), JSON.stringify({ version: 1, selection: 'Automatic', provider: 'google' }));
  for (const value of [null, {}, { version: 2, selection: 'Automatic', provider: 'google' }, { version: 1, selection: 'Google Maps', provider: 'openstreetmap' }, { version: 1, selection: 'OpenStreetMap', provider: 'google' }, { version: 1, selection: 'Automatic', provider: 'unknown' }]) {
    assert.equal(api.normalizeMobileMapConfiguration(value), null);
  }
});

test('login caches map preferences without exposing backend credentials', async () => {
  const { api, storage, replies } = setup();
  replies.push(response(200, {}), response(200, { message: { allowed: true, map_config: { version: 1, selection: 'Automatic', provider: 'google', api_key: 'private-key' } } }));
  await api.loginAndRegisterDevice(session.siteUrl, session.user, 'password', device);
  assert.equal((await api.getSession()).mapConfig.provider, 'google');
  assert.ok(!storage.get(sessionKey).includes('private-key'));
});

test('offline work refresh changes provider and notifies mounted maps', async () => {
  const { api, storage, replies } = setup();
  storage.set(sessionKey, JSON.stringify(session));
  const changes = [];
  const unsubscribe = api.subscribeToSessionChange((next) => changes.push(next));
  replies.push(response(200, { message: { map_config: { version: 1, selection: 'OpenStreetMap', provider: 'openstreetmap' } } }));
  await api.getOfflineWork('installation-one');
  assert.equal(changes[0].mapConfig.provider, 'openstreetmap');
  assert.equal((await api.getSession()).mapConfig.provider, 'openstreetmap');
  await api.clearSession();
  assert.equal(changes[1], null);
  unsubscribe();
});

test('late successful map response cannot change a newer site or cache its work', async () => {
  const { api, storage, replies } = setup();
  storage.set(sessionKey, JSON.stringify(session));
  let finish;
  replies.push(() => new Promise((resolve) => { finish = resolve; }));
  const request = api.getOfflineWork('installation-one');
  const rejected = assert.rejects(request, api.MobileAccessError);
  await new Promise(setImmediate);
  const newer = { ...session, siteUrl: 'https://another.test', mapConfig: { version: 1, selection: 'OpenStreetMap', provider: 'openstreetmap' } };
  storage.set(sessionKey, JSON.stringify(newer));
  finish(response(200, { message: { map_config: { version: 1, selection: 'Automatic', provider: 'google' } } }));
  await rejected;
  assert.equal(storage.get(sessionKey), JSON.stringify(newer));
});

test('new login without map preferences does not inherit the old site preference', async () => {
  const { api, storage, replies } = setup();
  storage.set(sessionKey, JSON.stringify({ ...session, mapConfig: { version: 1, selection: 'Automatic', provider: 'google' } }));
  replies.push(response(200, {}), response(200, { message: { allowed: true } }));
  await api.loginAndRegisterDevice('https://another.test', 'another@example.test', 'password', device);
  assert.equal((await api.getSession()).mapConfig, undefined);
});

test('pending approval is isolated from the active session and can be refreshed', async () => {
  const { api, storage, replies, calls } = setup();
  replies.push(response(200, {}), response(200, { message: { allowed: false, message: 'Awaiting approval' } }));
  const result = await api.loginAndRegisterDevice(session.siteUrl, session.user, 'password', device);
  assert.equal(result.allowed, false);
  assert.equal(await api.getSession(), null);
  assert.equal((await api.getPendingSession()).sid, session.sid);
  assert.ok(!storage.get(pendingKey).includes('password'));
  replies.push(response(200, { message: { allowed: true } }));
  assert.equal((await api.refreshDeviceRegistration(device)).allowed, true);
  assert.equal((await api.getSession()).sid, session.sid);
  assert.equal(await api.getPendingSession(), null);
  assert.equal(calls.length, 3);
  assert.equal(calls[2][1].headers.Cookie, `sid=${session.sid}`);
});

test('denied refresh cannot activate a blocked device', async () => {
  const { api, storage, replies } = setup();
  storage.set(pendingKey, JSON.stringify(session));
  replies.push(response(200, { message: { allowed: false, message: 'Revoked' } }));
  assert.equal((await api.refreshDeviceRegistration(device)).allowed, false);
  assert.equal(await api.getSession(), null);
  assert.ok(await api.getPendingSession());
});

for (const [name, reply] of [
  ['JSON HTTP 401', response(401, {})],
  ['non-JSON HTTP 401', response(401, '<html>Unauthorized</html>')],
  ['Frappe AuthenticationError', response(403, { exc_type: 'AuthenticationError' })],
  ['Frappe SessionExpired', response(417, { exc_type: 'SessionExpired' })],
  ['Frappe session_expired flag', response(403, { session_expired: 1 })],
]) {
  test(`${name} clears authentication and signals sign-in`, async () => {
    const { api, storage, replies } = setup();
    storage.set(sessionKey, JSON.stringify(session));
    const reasons = [];
    api.subscribeToSessionInterruption((reason) => reasons.push(reason));
    replies.push(reply);
    await assert.rejects(api.getOfflineWork('installation-one'), (error) => error instanceof api.MobileAccessError && error.reason === 'expired' && !api.isConnectivityFailure(error));
    assert.equal(await api.getSession(), null);
    assert.deepEqual(reasons, ['expired']);
  });
}

test('expired pending approval returns to password sign-in', async () => {
  const { api, storage, replies } = setup();
  storage.set(pendingKey, JSON.stringify(session));
  replies.push(response(401, {}));
  await assert.rejects(api.refreshDeviceRegistration(device), (error) => error.reason === 'expired');
  assert.equal(await api.getPendingSession(), null);
});

for (const code of ['DEVICE_NOT_REGISTERED', 'DEVICE_NOT_ACTIVE', 'MULTIPLE_ACTIVE_DEVICES']) {
  test(`${code} moves an active login into the approval flow`, async () => {
    const { api, storage, replies } = setup();
    storage.set(sessionKey, JSON.stringify(session));
    replies.push(response(200, { message: { linked: false, code, message: 'Contact administrator' } }));
    await assert.rejects(api.getDriverProfile('installation-one'), (error) => error.reason === 'device');
    assert.equal(await api.getSession(), null);
    assert.equal((await api.getPendingSession()).sid, session.sid);
  });
}

test('ordinary permission failures do not sign out the user', async () => {
  const { api, storage, replies } = setup();
  storage.set(sessionKey, JSON.stringify(session));
  replies.push(response(403, { exc_type: 'PermissionError', exc: 'denied', _server_messages: JSON.stringify([JSON.stringify({ message: 'Not permitted' })]) }));
  await assert.rejects(api.getOfflineWork('installation-one'), /Not permitted/);
  assert.ok(await api.getSession());
});

function guestWhitelistResponse() {
  return response(403, {
    exc_type: 'PermissionError', exc: 'PermissionError',
    _server_messages: JSON.stringify([JSON.stringify({ message: '<details><summary>You are not permitted to access this resource. Login to access</summary>Function <strong>vuna_transport.api.get_mobile_offline_work</strong> is not whitelisted.</details>' })]),
  });
}

test('Guest whitelist denial confirms expiry and redirects without deleting saved work', async () => {
  const { api, storage, replies, calls } = setup();
  storage.set(sessionKey, JSON.stringify(session));
  storage.set('offline-proof', 'unsynced work');
  const reasons = [];
  api.subscribeToSessionInterruption((reason) => reasons.push(reason));
  replies.push(guestWhitelistResponse(), guestWhitelistResponse());
  await assert.rejects(api.getOfflineWork('installation-one'), (error) => error instanceof api.MobileAccessError && error.reason === 'expired');
  assert.equal(await api.getSession(), null);
  assert.equal(storage.get('offline-proof'), 'unsynced work');
  assert.deepEqual(reasons, ['expired']);
  assert.equal(calls[1][0], `${session.siteUrl}/api/method/frappe.auth.get_logged_user`);
  assert.equal(calls[1][1].headers.Cookie, `sid=${session.sid}`);
});

test('an unavailable endpoint does not sign out a still-authenticated user', async () => {
  const { api, storage, replies } = setup();
  storage.set(sessionKey, JSON.stringify(session));
  replies.push(guestWhitelistResponse(), response(200, { message: session.user }));
  await assert.rejects(api.getOfflineWork('installation-one'), api.MobileRequestError);
  assert.ok(await api.getSession());
});

test('failed session verification preserves credentials for offline work', async () => {
  const { api, storage, replies } = setup();
  storage.set(sessionKey, JSON.stringify(session));
  replies.push(guestWhitelistResponse(), () => { throw new TypeError('offline'); });
  await assert.rejects(api.getOfflineWork('installation-one'), api.isConnectivityFailure);
  assert.ok(await api.getSession());
});

test('late Guest confirmation cannot sign out a newer login', async () => {
  const { api, storage, replies } = setup();
  storage.set(sessionKey, JSON.stringify(session));
  let finish;
  replies.push(guestWhitelistResponse(), () => new Promise((resolve) => { finish = resolve; }));
  const request = api.getOfflineWork('installation-one');
  const rejected = assert.rejects(request, api.MobileAccessError);
  while (!finish) await new Promise(setImmediate);
  storage.set(sessionKey, JSON.stringify({ ...session, sid: 'new-session' }));
  finish(guestWhitelistResponse());
  await rejected;
  assert.equal((await api.getSession()).sid, 'new-session');
});

test('expired pending device approval also handles Guest whitelist errors', async () => {
  const { api, storage, replies } = setup();
  storage.set(pendingKey, JSON.stringify(session));
  replies.push(guestWhitelistResponse(), response(401, {}));
  await assert.rejects(api.refreshDeviceRegistration(device), (error) => error.reason === 'expired');
  assert.equal(await api.getPendingSession(), null);
});

test('a Guest identity response confirms that sign-in is required', async () => {
  const { api, storage, replies } = setup();
  storage.set(sessionKey, JSON.stringify(session));
  replies.push(guestWhitelistResponse(), response(200, { message: 'Guest' }));
  await assert.rejects(api.getOfflineWork('installation-one'), (error) => error.reason === 'expired');
  assert.equal(await api.getSession(), null);
});

test('concurrent Guest failures share a verification request and redirect only once', async () => {
  const { api, storage, replies, calls } = setup();
  storage.set(sessionKey, JSON.stringify(session));
  let finish;
  replies.push(guestWhitelistResponse(), guestWhitelistResponse(), () => new Promise((resolve) => { finish = resolve; }));
  const reasons = [];
  api.subscribeToSessionInterruption((reason) => reasons.push(reason));
  const results = Promise.allSettled([api.getOfflineWork('installation-one'), api.getDriverProfile('installation-one')]);
  while (!finish) await new Promise(setImmediate);
  await new Promise(setImmediate);
  finish(response(401, {}));
  for (const result of await results) {
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason.reason, 'expired');
  }
  assert.equal(calls.filter(([url]) => url.endsWith('/frappe.auth.get_logged_user')).length, 1);
  assert.deepEqual(reasons, ['expired']);
});

test('a missing driver link is not treated as device revocation', async () => {
  const { api, storage, replies } = setup();
  storage.set(sessionKey, JSON.stringify(session));
  replies.push(response(200, { message: { linked: false, code: 'DRIVER_NOT_LINKED' } }));
  assert.equal((await api.getDriverProfile('installation-one')).code, 'DRIVER_NOT_LINKED');
  assert.ok(await api.getSession());
  assert.equal(await api.getPendingSession(), null);
});

test('a request timeout does not clear authentication', async () => {
  const { api, storage, replies } = setup();
  storage.set(sessionKey, JSON.stringify(session));
  replies.push(() => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; });
  await assert.rejects(api.callMobileMethod('test', {}, 'Failed'), (error) => error.failure === 'timeout');
  assert.ok(await api.getSession());
});

test('a connection failure keeps the session available for offline work', async () => {
  const { api, storage, replies } = setup();
  storage.set(sessionKey, JSON.stringify(session));
  replies.push(() => { throw new TypeError('network failed'); });
  await assert.rejects(api.getOfflineWork('installation-one'), api.isConnectivityFailure);
  assert.ok(await api.getSession());
});

test('late failures from an older session do not clear a newer login', async () => {
  const { api, storage, replies } = setup();
  storage.set(sessionKey, JSON.stringify(session));
  let finish;
  replies.push(() => new Promise((resolve) => { finish = resolve; }));
  const request = api.getOfflineWork('installation-one');
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  storage.set(sessionKey, JSON.stringify({ ...session, sid: 'new-session' }));
  finish(response(401, {}));
  await assert.rejects(request);
  assert.equal((await api.getSession()).sid, 'new-session');
});

test('late approval cannot overwrite a different login', async () => {
  const { api, storage, replies } = setup();
  storage.set(pendingKey, JSON.stringify(session));
  let finish;
  replies.push(() => new Promise((resolve) => { finish = resolve; }));
  const request = api.refreshDeviceRegistration(device);
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  await api.clearSession();
  storage.set(sessionKey, JSON.stringify({ ...session, sid: 'new-session' }));
  finish(response(200, { message: { allowed: true } }));
  await assert.rejects(request);
  assert.equal((await api.getSession()).sid, 'new-session');
});

test('switching accounts clears pending approval as well as active credentials', async () => {
  const { api, storage } = setup();
  storage.set(pendingKey, JSON.stringify(session));
  await api.clearSession();
  assert.equal(await api.getSession(), null);
  assert.equal(await api.getPendingSession(), null);
});

test('an authentication interruption pauses synchronization under its original owner scope', async () => {
  const { api } = setup();
  const queries = [];
  const updates = [];
  const operation = { operationId: 'saved-proof', operationType: 'submit_pod', payload: { tripName: 'trip', stopName: 'stop', pod: {} } };
  const error = new api.MobileAccessError('expired', 'Sign in again');
  const sync = loadModule('src/offline/sync.tsx', {
    react: {},
    '../auth/session': api,
    '../features/trips/api': { prepareProofOfDelivery: async () => { throw error; } },
    './connectivity': {}, './files': {}, './trip_repository': {},
    './cache': { getOfflineScope: async () => 'https://example.test|driver@example.test' },
    './database': { getOfflineDatabase: async () => ({ runAsync: async (...args) => queries.push(args) }) },
    './outbox': { getOfflineOperation: async () => operation, updateOfflineOperation: async (...args) => updates.push(args) },
  });
  await assert.rejects(sync.synchronizeOfflineOperation(operation.operationId), (actual) => actual === error);
  assert.equal(updates[0][1].status, 'Syncing');
  assert.equal(queries.length, 1);
  assert.match(queries[0][0], /status = 'Pending'/);
  assert.equal(queries[0][3], 'https://example.test|driver@example.test');
  assert.equal(queries[0][4], 'saved-proof');
});
