const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const read = (file) => readFileSync(path.join(__dirname, '..', file), 'utf8');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(read('src/features/trips/map_model.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleObject, exports: moduleObject.exports });
const { stopNavigationTarget } = moduleObject.exports;
const stop = { name: 'STOP / 1', lat: -1.25, lng: 36.8 };

test('OpenStreetMap and unknown preferences use external directions on every platform', () => {
  for (const provider of ['openstreetmap', undefined]) {
    for (const platform of ['android', 'ios']) {
      const result = stopNavigationTarget(provider, platform, 'TRIP', stop, 'Address');
      assert.equal(result.kind, 'external');
      const url = new URL(result.url);
      assert.equal(url.hostname, 'www.google.com');
      assert.equal(url.searchParams.get('destination'), '-1.25,36.8');
      assert.equal(url.searchParams.get('dir_action'), 'navigate');
    }
  }
});

test('only Android with an effective Google provider opens the in-app navigation screen', () => {
  const result = stopNavigationTarget('google', 'android', 'TRIP / 1', stop, 'Address');
  assert.equal(result.kind, 'internal');
  assert.equal(result.url, '/trips/TRIP%20%2F%201/navigation/STOP%20%2F%201');
  assert.equal(stopNavigationTarget('google', 'ios', 'TRIP', stop, 'Address').kind, 'external');
});

test('external directions use a safely encoded address when coordinates are unavailable', () => {
  const result = stopNavigationTarget('openstreetmap', 'android', 'TRIP', { name: 'STOP' }, 'Depot & Market, Meru');
  assert.equal(new URL(result.url).searchParams.get('destination'), 'Depot & Market, Meru');
  assert.throws(() => stopNavigationTarget('openstreetmap', 'android', 'TRIP', { name: 'STOP' }, ' '), /no destination/);
});

test('customer deliveries and depot/pickup tasks share the provider-aware action', () => {
  for (const file of ['src/app/trips/[tripName]/stops/[stopName]/index.tsx', 'src/features/trips/task_components.tsx']) {
    const source = read(file);
    assert.match(source, /useStopNavigation\(tripName,/);
    assert.doesNotMatch(source, /router.push\(`[^`]*\/navigation\//);
  }
  const hook = read('src/features/trips/use_stop_navigation.ts');
  assert.match(hook, /await getSession\(\)/);
  assert.match(hook, /session.mapConfig\?\.provider/);
  assert.doesNotMatch(hook, /getMobileGoogleMapsKey|startGuidance|NativeNavigation/);
});
