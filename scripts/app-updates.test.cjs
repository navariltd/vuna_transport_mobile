const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const server = 'https://releases.example.test';
const source = readFileSync(path.join(__dirname, '../src/features/appUpdates/appUpdateApi.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleUnderTest = { exports: {} };
vm.runInNewContext(code, {
  module: moduleUnderTest, exports: moduleUnderTest.exports,
  require: () => ({ appUpdateConfig: { serverUrl: server, channel: 'Production' } }),
  URL, URLSearchParams, setTimeout, clearTimeout, AbortController, Error,
});
const { checkForAppUpdate } = moduleUnderTest.exports;
const release = { update_available: true, release: 'REL-1', version_name: '1.0.1', version_code: 1000001, file_size: 1024, sha256: 'a'.repeat(64), download_url: `${server}/files/app.apk`, release_notes: 'Fixes', mandatory: false };
const input = { applicationId: 'ke.navari.vunatransport', versionCode: 1000000 };
const reply = (message) => async () => ({ ok: true, json: async () => ({ message }) });

test('guest update discovery sends no ERP session and uses the installed package and version', async () => {
  const result = await checkForAppUpdate({ ...input, fetcher: async (url, options) => {
    const request = new URL(url);
    assert.equal(request.origin, server);
    assert.equal(request.searchParams.get('application_id'), input.applicationId);
    assert.equal(request.searchParams.get('version_code'), String(input.versionCode));
    assert.equal(request.searchParams.get('channel'), 'Production');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.headers.Authorization, undefined);
    return reply(release)();
  } });
  assert.equal(result.versionName, '1.0.1');
});
test('no published update is a normal result', async () => {
  assert.equal(await checkForAppUpdate({ ...input, fetcher: reply({ update_available: false }) }), null);
});

const policySource = readFileSync(path.join(__dirname, '../src/features/appUpdates/updatePolicy.ts'), 'utf8');
const policyModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: policyModule, exports: policyModule.exports });
test('installation prompts do not interrupt delivery, evidence, requests, or login', () => {
  const { isSafeUpdateScreen } = policyModule.exports;
  assert.equal(isSafeUpdateScreen('/dashboard'), true);
  assert.equal(isSafeUpdateScreen('/profile'), true);
  for (const route of ['/login', '/sync-center', '/trips/TRIP-1', '/trips/TRIP-1/stops/STOP-1/pod', '/trips/TRIP-1/requests/material-request']) {
    assert.equal(isSafeUpdateScreen(route), false);
  }
});
test('any unsynced or attention-required work blocks installation', () => {
  const { hasUnsyncedWork } = policyModule.exports;
  assert.equal(hasUnsyncedWork([]), false);
  assert.equal(hasUnsyncedWork([{ status: 'Completed' }]), false);
  for (const status of ['Pending', 'Syncing', 'Failed', 'Needs Attention']) {
    assert.equal(hasUnsyncedWork([{ status: 'Completed' }, { status }]), true);
  }
});
for (const [label, changes] of [
  ['non-increasing version', { version_code: 1000000 }],
  ['fractional version', { version_code: 1000001.5 }],
  ['invalid digest', { sha256: 'bad' }],
  ['invalid size', { file_size: -1 }],
  ['another host', { download_url: 'https://evil.test/files/app.apk' }],
  ['private attachment', { download_url: `${server}/private/files/app.apk` }],
  ['insecure APK', { download_url: `${server.replace('https:', 'http:')}/files/app.apk` }],
]) {
  test(`rejects ${label}`, async () => {
    await assert.rejects(checkForAppUpdate({ ...input, fetcher: reply({ ...release, ...changes }) }));
  });
}
test('update service failures leave normal app work independent', async () => {
  await assert.rejects(checkForAppUpdate({ ...input, fetcher: async () => { throw new Error('offline'); } }), /Could not reach/);
  await assert.rejects(checkForAppUpdate({ ...input, serverUrl: 'http://releases.test', fetcher: reply(release) }), /HTTPS/);
  await assert.rejects(checkForAppUpdate({ ...input, timeoutMs: 1, fetcher: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))) }), /timed out/);
});
