const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(path.join(__dirname, '../src/features/trips/map_handoff.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleObject, exports: moduleObject.exports });
const { createMapHandoff } = moduleObject.exports;

test('fullscreen handoff keeps the loaded route and callbacks in memory without recalculation', () => {
  const store = createMapHandoff();
  const geometry = { segments: [[{ latitude: -1, longitude: 37 }]] };
  const callback = () => { throw new Error('Do not fetch a route just to expand the map'); };
  const payload = { stops: [{ name: 'STOP' }], roadRoute: geometry, onShowRoute: callback };
  const id = store.open('owner', payload);
  assert.equal(store.getSnapshot().id, id);
  assert.equal(store.getSnapshot().payload, payload);
  assert.equal(store.getSnapshot().payload.roadRoute, geometry);
  assert.equal(store.getSnapshot().payload.onShowRoute, callback);
});

test('a route response arriving while fullscreen updates the same map session', () => {
  const store = createMapHandoff();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications++; });
  const id = store.open('owner', { routeLoading: true });
  store.update('owner', { routeLoading: false, roadRoute: 'loaded' });
  assert.equal(store.getSnapshot().id, id);
  assert.equal(store.getSnapshot().payload.roadRoute, 'loaded');
  assert.equal(notifications, 2);
  unsubscribe(); store.clearId(id);
  assert.equal(notifications, 2);
});

test('account/provider owner disposal clears the fullscreen payload and callbacks', () => {
  const store = createMapHandoff();
  store.open('old-site', { stops: ['private-stop'] });
  store.clearOwner('old-site');
  assert.equal(store.getSnapshot(), null);
});

test('stale screen cleanup cannot erase a newer map or another account', () => {
  const store = createMapHandoff();
  const old = store.open('old-site', {});
  const latest = store.open('new-site', { stops: ['new-stop'] });
  store.update('old-site', {}); store.clearOwner('old-site'); store.clearId(old);
  assert.equal(store.getSnapshot().id, latest);
  assert.deepEqual(store.getSnapshot().payload.stops, ['new-stop']);
});

test('closing fullscreen discards the handoff; reopening uses a new identifier', () => {
  const store = createMapHandoff();
  const first = store.open('owner', {});
  store.clearId(first);
  assert.equal(store.getSnapshot(), null);
  assert.notEqual(store.open('owner', {}), first);
});

test('Google maps never mount inside a native Modal and release the canvas on screen blur', () => {
  const source = readFileSync(path.join(__dirname, '../src/features/trips/google_trip_map.tsx'), 'utf8');
  assert.doesNotMatch(source, /\bModal\b/);
  assert.match(source, /useIsFocused/);
  assert.match(source, /mapType=\{1\}/);
  assert.ok(source.indexOf('if (!focused) return') < source.indexOf('return <GoogleMapCanvas'));
  const root = readFileSync(path.join(__dirname, '../src/app/_layout.tsx'), 'utf8');
  assert.match(root, /name="map\/\[mapId\]"/);
  assert.match(root, /presentation: 'card', animation: 'none'/);
});

test('map-containing scroll views do not detach native fragment containers offscreen', () => {
  for (const file of ['src/app/trips/[tripName]/index.tsx', 'src/app/trips/[tripName]/stops/[stopName]/index.tsx', 'src/features/trips/task_detail_screen.tsx']) {
    const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.match(source, /removeClippedSubviews=\{false\}/);
  }
});

test('trip cards and map navigation use the screen-bound SDK 58 router', () => {
  for (const file of ['src/app/(tabs)/dashboard.tsx', 'src/features/trips/components.tsx', 'src/features/trips/google_trip_map.tsx', 'src/features/trips/fullscreen_map_screen.tsx', 'src/features/trips/navigation_screen.tsx']) {
    const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.match(source, /const router = useRouter\(\)/);
    assert.doesNotMatch(source, /import\s*\{[^}]*\brouter\b[^}]*\}\s*from 'expo-router'/);
  }
});
