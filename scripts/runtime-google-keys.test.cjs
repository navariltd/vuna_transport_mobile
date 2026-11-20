const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const read = (file) => readFileSync(path.join(__dirname, '..', file), 'utf8');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(read('src/features/trips/google_maps_runtime.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleObject, exports: moduleObject.exports, URL });
const { prepareCustomerGoogle } = moduleObject.exports;
const session = { siteUrl: 'https://customer.example', user: 'driver', sid: 'session', mapConfig: { provider: 'google' } };
const key = 'customer_mobile_key_123456789';
function fixture() {
  const calls = [];
  const dependencies = {
    platform: 'android', development: false, current: async () => session,
    load: async () => ({ version: 1, platform: 'android', api_key: key }),
    configure: async (site, value) => { calls.push([site, value]); return 'ready'; },
  };
  return { calls, dependencies };
}

test('only an authenticated current site key configures the native SDK; session is unchanged', async () => {
  const { calls, dependencies } = fixture();
  const before = JSON.stringify(session);
  await prepareCustomerGoogle(session, dependencies);
  assert.deepEqual(calls, [['https://customer.example', key]]);
  assert.equal(JSON.stringify(session), before);
  assert.ok(!JSON.stringify(session).includes(key));
});

test('late responses from a former login or provider cannot configure Google', async () => {
  for (const next of [null, { ...session, sid: 'new' }, { ...session, siteUrl: 'https://another.example' }, { ...session, mapConfig: { provider: 'openstreetmap' } }]) {
    const { calls, dependencies } = fixture();
    let current = session;
    dependencies.current = async () => current;
    dependencies.load = async () => { current = next; return { version: 1, platform: 'android', api_key: key }; };
    await assert.rejects(prepareCustomerGoogle(session, dependencies), /account changed/);
    assert.equal(calls.length, 0);
  }
});

test('missing keys, wrong platform and invalid contracts never fall back to vendor credentials', async () => {
  for (const value of [null, {}, { version: 1, platform: 'ios', api_key: key }, { version: 1, platform: 'android', api_key: '' }]) {
    const { calls, dependencies } = fixture();
    dependencies.load = async () => value;
    await assert.rejects(prepareCustomerGoogle(session, dependencies), /administrator/);
    assert.equal(calls.length, 0);
  }
});

test('HTTP release connections and disabled Google never fetch credentials', async () => {
  for (const value of [{ ...session, siteUrl: 'http://customer.example' }, { ...session, mapConfig: { provider: 'openstreetmap' } }]) {
    const { dependencies } = fixture();
    dependencies.load = async () => { assert.fail('Must not request credentials'); };
    await assert.rejects(prepareCustomerGoogle(value, dependencies));
  }
});

test('process owner/key changes require a full restart instead of cross-customer billing', async () => {
  const { dependencies } = fixture();
  dependencies.configure = async () => 'restart_required';
  await assert.rejects(prepareCustomerGoogle(session, dependencies), /Fully close the app/);
});

test('reverse-proxied sites on the same host keep distinct native ownership', async () => {
  const { calls, dependencies } = fixture();
  const proxied = { ...session, siteUrl: 'https://customer.example/site-one/' };
  dependencies.current = async () => proxied;
  await prepareCustomerGoogle(proxied, dependencies);
  assert.equal(calls[0][0], 'https://customer.example/site-one');
});

test('native initialization errors never echo keys', async () => {
  const { dependencies } = fixture();
  dependencies.configure = async () => { throw new Error(key); };
  await assert.rejects(prepareCustomerGoogle(session, dependencies), (error) => !error.message.includes(key));
});

test('all native Google surfaces are gated, including direct navigation and fullscreen entry', () => {
  for (const file of ['trip_map.tsx', 'navigation_screen.tsx', 'fullscreen_map_screen.tsx']) {
    const source = read(`src/features/trips/${file}`);
    assert.match(source, /<CustomerGoogleMaps>/);
    assert.doesNotMatch(source, /googleAndroidConfigured|googleIosConfigured/);
  }
  const source = read('modules/transport-maps/android/src/main/java/ke/navari/transport/maps/TransportMapsModule.kt');
  assert.match(source, /companion object/);
  assert.match(source, /NavigationApi.setApiKey\(apiKey\)/);
  assert.match(source, /owner == site && fingerprint == digest/);
  assert.doesNotMatch(source, /getSharedPreferences|Log\.|println|api_key/);
});

test('prebuild removes prior manifest keys and generated launch-time Google initialization', () => {
  const { removeManifestKeys, removeLaunchKey } = require('../plugins/with-runtime-google-maps');
  const manifest = { application: [{ 'meta-data': [
    { $: { 'android:name': 'com.google.android.geo.API_KEY', 'android:value': key } },
    { $: { 'android:name': 'keep', 'android:value': 'value' } },
  ] }] };
  removeManifestKeys(manifest);
  assert.equal(manifest.application[0]['meta-data'].length, 1);
  assert.ok(!JSON.stringify(manifest).includes(key));
  const swift = `import Expo\n// @generated begin react-native-navigation-sdk-api-key\nGMSServices.provideAPIKey("${key}")\n// @generated end react-native-navigation-sdk-api-key\nkeep()`;
  assert.equal(removeLaunchKey(swift), 'import Expo\nkeep()');
  assert.equal(removeLaunchKey(removeLaunchKey(swift)), removeLaunchKey(swift));
});
