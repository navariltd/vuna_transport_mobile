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
