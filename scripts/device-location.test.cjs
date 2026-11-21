const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function setup({ allowed = true, position, failed = false } = {}) {
  let listener;
  let removed = 0;
  const manager = {
    async requestPermissions() { return allowed; },
    setMinDisplacement(value) { assert.equal(value, 0); },
    addListener(callback) { listener = callback; },
    removeListener(callback) { assert.equal(callback, listener); removed++; },
    async getCurrentPosition() { if (failed) throw new Error('GPS unavailable'); return position; },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/shared/device_location.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: () => ({ LocationManager: manager }), setTimeout, clearTimeout, Date });
  return { capture: exports.captureDeviceLocation, removed: () => removed, update: (value) => listener(value) };
}
const fix = (timestamp = Date.now()) => ({ timestamp, coords: { latitude: -1.2, longitude: 36.8, accuracy: 6 } });

test('captures actual coordinates, accuracy and timestamp and removes only its listener', async () => {
  const position = fix();
  const api = setup({ position });
  const value = await api.capture(50);
  assert.equal(value.status, 'Captured');
  assert.equal(value.latitude, -1.2);
  assert.equal(value.longitude, 36.8);
  assert.equal(value.accuracy, 6);
  assert.equal(value.captured_at, new Date(position.timestamp).toISOString());
  assert.equal(api.removed(), 1);
});
test('supports iOS timestamps in seconds', async () => {
  const api = setup({ position: fix(Date.now() / 1000) });
  assert.equal((await api.capture(50)).status, 'Captured');
});
test('permission denial is recorded without inventing coordinates', async () => {
  const api = setup({ allowed: false });
  const result = await api.capture(50);
  assert.equal(result.status, 'Permission Denied');
  assert.equal(result.latitude, undefined);
  assert.equal(api.removed(), 0);
});
test('stale cached fixes are rejected and time out without blocking the action indefinitely', async () => {
  const api = setup({ position: fix(Date.now() - 60000) });
  assert.equal((await api.capture(10)).status, 'Timed Out');
  assert.equal(api.removed(), 1);
});
test('waits for a fresh update rather than using the old map position', async () => {
  const api = setup({ position: fix(Date.now() - 60000) });
  const pending = api.capture(100);
  await new Promise((resolve) => setTimeout(resolve, 5));
  api.update(fix());
  assert.equal((await pending).status, 'Captured');
});
test('native errors and invalid fixes never become valid evidence', async () => {
  assert.equal((await setup({ failed: true }).capture(50)).status, 'Unavailable');
  const position = fix();
  position.coords.latitude = NaN;
  assert.equal((await setup({ position }).capture(10)).status, 'Timed Out');
});
test('offline synchronization never requests another device fix', () => {
  const sync = fs.readFileSync(path.join(__dirname, '../src/offline/sync.tsx'), 'utf8');
  assert.doesNotMatch(sync, /captureDeviceLocation|LocationManager/);
  assert.match(sync, /\.\.\.payload\.pod/);
  const customer = fs.readFileSync(path.join(__dirname, '../src/features/proof-of-delivery/customer_confirmation.tsx'), 'utf8');
  assert.match(customer, /pod\.device_location \|\| await captureDeviceLocation/);
});
