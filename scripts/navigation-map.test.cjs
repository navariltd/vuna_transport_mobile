const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const read = (file) => readFileSync(path.join(__dirname, '..', file), 'utf8');
function model(file) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports });
  return module.exports;
}
const { assertNavigationRoute, attachGuidanceView, createNavigationRun, prepareNavigationAccess } = model('src/features/trips/navigation_model.ts');
const { navigationMapPath } = model('src/features/trips/map_model.ts');

test('route failures retain an actionable SDK status instead of blaming GPS or billing generically', () => {
  assert.doesNotThrow(() => assertNavigationRoute('OK'));
  for (const status of ['NO_ROUTE_FOUND', 'NETWORK_ERROR', 'QUOTA_CHECK_FAILED', 'ROUTE_CANCELED', 'LOCATION_DISABLED', 'LOCATION_UNKNOWN', 'WAYPOINT_ERROR', 'DUPLICATE_WAYPOINTS_ERROR', 'ROUTING_TIMEOUT']) {
    assert.throws(() => assertNavigationRoute(status), new RegExp(status));
  }
  assert.throws(() => assertNavigationRoute('unknown private native text'), /unrecognized routing status/);
});

function accessFixture(overrides = {}) {
  const calls = [];
  const steps = {
    getPermission: async () => { calls.push('check permission'); return { granted: true }; },
    requestPermission: async () => { calls.push('request permission'); return { granted: true }; },
    termsAccepted: async () => { calls.push('check terms'); return true; },
    showTerms: async () => { calls.push('show terms'); return true; },
    prompt: async (action) => { calls.push('prompt'); return action(); },
    assertActive: () => {}, ...overrides,
  };
  return { calls, steps };
}

test('already-granted location and accepted terms never open transient Android permission activities', async () => {
  const { calls, steps } = accessFixture();
  await prepareNavigationAccess(steps);
  assert.deepEqual(calls, ['check permission', 'check terms']);
});

test('first-use permission and terms use the prompt guard, then recheck foreground state', async () => {
  const { calls, steps } = accessFixture({
    getPermission: async () => ({ granted: false }), termsAccepted: async () => false,
    assertActive: () => { calls.push('active'); },
  });
  await prepareNavigationAccess(steps);
  assert.deepEqual(calls, ['active', 'prompt', 'request permission', 'active', 'active', 'prompt', 'show terms', 'active']);
});

test('permission or terms denial prevents navigation initialization', async () => {
  const deniedLocation = accessFixture({ getPermission: async () => ({ granted: false }), requestPermission: async () => ({ granted: false }) });
  await assert.rejects(prepareNavigationAccess(deniedLocation.steps), /Allow location/);
  assert.ok(!deniedLocation.calls.includes('check terms'));
  const deniedTerms = accessFixture({ termsAccepted: async () => false, showTerms: async () => false });
  await assert.rejects(prepareNavigationAccess(deniedTerms.steps), /Accept Google/);
});

test('leaving the app during a prompt cannot continue startup', async () => {
  let active = true;
  const { steps } = accessFixture({
    getPermission: async () => ({ granted: false }),
    prompt: async (action) => { const result = await action(); active = false; return result; },
    assertActive: () => { if (!active) throw new Error('Navigation cancelled'); },
  });
  await assert.rejects(prepareNavigationAccess(steps), /cancelled/);
});

test('guidance attaches its native UI before enabling the following camera', async () => {
  const calls = [];
  await attachGuidanceView({
    setNavigationUIEnabled: async (enabled) => { calls.push(['UI', enabled]); },
    setFollowingPerspective: async (perspective) => { calls.push(['camera', perspective]); },
  }, 0);
  assert.deepEqual(calls, [['UI', true], ['camera', 0]]);
});

test('a missing map or failed UI attachment cannot pretend to start following', async () => {
  await assert.rejects(attachGuidanceView(null, 0), /Map is not ready/);
  let followed = false;
  await assert.rejects(attachGuidanceView({
    setNavigationUIEnabled: async () => { throw new Error('View released'); },
    setFollowingPerspective: async () => { followed = true; },
  }, 0));
  assert.equal(followed, false);
});

test('a cancelled run stays disposed when pending preparation eventually completes', async () => {
  let finish;
  let authorized = false;
  const run = createNavigationRun({
    prepare: () => new Promise((resolve) => { finish = resolve; }),
    authorize: async () => { authorized = true; },
    setDestination: async () => {}, guide: async () => {}, cleanup: async () => {},
  });
  const start = run.start();
  const stop = run.dispose();
  assert.equal(run.disposed, true);
  finish(); await Promise.all([start, stop]);
  assert.equal(authorized, false);
  assert.equal(run.disposed, true);
});

test('expanding a trip map selects its active stop without putting geometry in URLs', () => {
  const stops = [{ name: 'A', lat: -1, lng: 37 }, { name: 'B / 2', lat: -2, lng: 38 }];
  assert.equal(navigationMapPath({ tripName: 'TRIP / 1', stops, activeStop: 'B / 2' }, '7'),
    '/trips/TRIP%20%2F%201/navigation/B%20%2F%202?mapId=7&overview=1');
  assert.equal(navigationMapPath({ navigationTripName: 'TRIP', stops: [stops[0]] }, '8'),
    '/trips/TRIP/navigation/A?mapId=8&overview=0');
  assert.equal(navigationMapPath({ stops }, '9'), null);
  assert.equal(navigationMapPath({ tripName: 'TRIP', stops: [{ name: 'invalid', lat: null, lng: 37 }] }, '10'), null);
});

test('navigation view exists before starting, stays focused, and uses explicit native camera following', () => {
  const source = read('src/features/trips/native_navigation.tsx');
  assert.match(source, /focused \? <NavigationView/);
  assert.doesNotMatch(source, /phase === 'guiding' \? <NavigationView/);
  assert.match(source, /initialCameraPosition=/);
  assert.match(source, /onMapReady=\{\(\) => setMapReady\(true\)\}/);
  assert.match(source, /attachGuidanceView\(navigationView.current, CameraPerspective.TILTED\)/);
  assert.ok(source.indexOf('await attachGuidanceView') < source.indexOf('await controller.startGuidance()'));
  assert.match(source, /headerEnabled=\{phase === 'guiding'\} footerEnabled=\{phase === 'guiding'\}/);
  assert.equal((source.match(/controller.setDestinations\(/g) || []).length, 1);
  assert.ok(source.indexOf('const start = async') < source.indexOf('controller.init()'));
  assert.match(source, /onPress=\{\(\) => void start\(\)\}/);
});

test('fullscreen map uses safe areas, one header and no duplicated footer or placeholder page', () => {
  const screen = read('src/features/trips/navigation_screen.tsx');
  assert.match(screen, /edges=\{\['top', 'bottom', 'left', 'right'\]\}/);
  assert.doesNotMatch(screen, /<ScreenHeader|styles.footer|Back to stop<\/Text>/);
  assert.match(screen, /previewRoute=\{loadedRoute\}/);
  const source = read('src/features/trips/native_navigation.tsx');
  assert.doesNotMatch(source, /Navigate to this stop|styles.placeholder/);
  assert.match(source, /previewRoute\?\.segments/);
  const google = read('src/features/trips/google_trip_map.tsx');
  assert.match(google, /navigationMapPath\(props, id\)/);
  assert.doesNotMatch(google, /controller.init\(|startGuidance\(|getNavigationDestination\(/);
});
