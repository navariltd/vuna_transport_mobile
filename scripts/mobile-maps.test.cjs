const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const modelFile = path.join(__dirname, '../src/features/trips/map_model.ts');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(modelFile, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleObject, exports: moduleObject.exports });
const model = moduleObject.exports;

const routeModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(path.join(__dirname, '../src/features/trips/road_route_model.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: routeModule, exports: routeModule.exports });
const route = routeModule.exports;

test('road route decoder returns Google coordinates in latitude/longitude order', () => {
  const result = route.decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.equal(JSON.stringify(result), JSON.stringify([
    { latitude: 38.5, longitude: -120.2 }, { latitude: 40.7, longitude: -120.95 }, { latitude: 43.252, longitude: -126.453 },
  ]));
});

test('truncated, excessive and out-of-range road geometry fails safely', () => {
  for (const line of ['', 'x', '??', '~'.repeat(10), '??\nAA', '?'.repeat(200001), '~~~~~~?', '~~~~~F??AA']) assert.throws(() => route.decodePolyline(line));
});

test('route contract keeps separate segments and validates trip and every stop identity', () => {
  const value = { version: 1, provider: 'google', trip_name: 'TRIP', stop_order: ['A', 'B'], return_to_start: false, origin: { latitude: -1, longitude: 37 }, encoded_polylines: ['??AA', 'AA??'] };
  const result = route.parseRoadRoute(value, 'TRIP', ['A', 'B']);
  assert.equal(result.segments.length, 2);
  assert.equal(result.segments[0].length, 2);
  for (const change of [{ trip_name: 'OTHER' }, { stop_order: ['B', 'A'] }, { stop_order: ['A'] }, { provider: 'openstreetmap' }, { origin: { latitude: null, longitude: 37 } }, { encoded_polylines: [] }]) assert.throws(() => route.parseRoadRoute({ ...value, ...change }, 'TRIP', ['A', 'B']));
});

test('coordinates reject absent and invalid values without rejecting the equator', () => {
  for (const point of [{}, { lat: null, lng: 37 }, { lat: '', lng: 37 }, { lat: ' ', lng: 37 }, { lat: true, lng: 37 }, { lat: 91, lng: 37 }, { lat: 1, lng: 181 }, { lat: NaN, lng: 37 }, { lat: 0, lng: 0 }]) {
    assert.equal(model.stopCoordinate(point), null);
  }
  assert.equal(JSON.stringify(model.stopCoordinate({ lat: 0, lng: '37.5' })), '[37.5,0]');
});

test('co-located stops retain identity, original order and numbering', () => {
  const rows = model.mappedStops([{ name: 'missing', idx: 1 }, { name: 'customer', idx: 2, lat: -1, lng: 37 }, { name: 'depot', idx: 3, lat: -1, lng: 37 }]);
  assert.equal(JSON.stringify(rows.map((row) => [row.stop.name, row.number])), '[["customer",2],["depot",3]]');
});

test('depot names are used in stop labels', () => {
  assert.equal(model.stopLabel({ vuna_depot_names: 'Ruiru Depot', address_details: { city: 'Ruiru' } }), 'Ruiru Depot · Ruiru');
});

test('native config keeps app identity and exposes only key-presence flags publicly', () => {
  const configure = require('../app.config.js');
  const androidName = 'VUNA_TRANSPORT_GOOGLE_MAPS_ANDROID_API_KEY';
  const iosName = 'VUNA_TRANSPORT_GOOGLE_MAPS_IOS_API_KEY';
  const oldAndroid = process.env[androidName];
  const oldIos = process.env[iosName];
  try {
    delete process.env[androidName];
    delete process.env[iosName];
    const base = { version: '1.2.3', android: { package: 'ke.navari.vunatransport' }, extra: { router: {} }, plugins: ['expo-router'] };
    const noKeys = configure({ config: base });
    assert.deepEqual(noKeys.extra.mobileMaps, { googleAndroidConfigured: false, googleIosConfigured: false });
    process.env[androidName] = 'android-test-key';
    process.env[iosName] = 'ios-test-key';
    const withKeys = configure({ config: base });
    assert.equal(withKeys.android.package, base.android.package);
    assert.equal(withKeys.version, base.version);
    assert.equal(withKeys.plugins.find((plugin) => plugin[0] === 'react-native-maps')[1].androidGoogleMapsApiKey, 'android-test-key');
    assert.deepEqual(withKeys.extra.mobileMaps, { googleAndroidConfigured: true, googleIosConfigured: true });
    assert.ok(!JSON.stringify(withKeys.extra).includes('test-key'));
    assert.equal(withKeys.plugins.filter((plugin) => plugin[0] === 'expo-location').length, 1);
    assert.ok(!JSON.stringify(withKeys).includes('isAndroidBackgroundLocationEnabled'));
  } finally {
    if (oldAndroid === undefined) delete process.env[androidName]; else process.env[androidName] = oldAndroid;
    if (oldIos === undefined) delete process.env[iosName]; else process.env[iosName] = oldIos;
  }
});
