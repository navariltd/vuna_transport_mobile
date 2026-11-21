const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const read = (file) => readFileSync(path.join(__dirname, '..', file), 'utf8');
function load(file, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: (name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return module.exports;
}

test('the saved-work guard blocks every unsynced status and uses the explicit site, not a login scope', async () => {
  for (const status of ['Pending', 'Syncing', 'Failed', 'Needs Attention']) {
    const calls = [];
    const { assertSiteWorkSynced } = load('src/offline/site_work.ts', {
      './database': { getOfflineDatabase: async () => ({ getFirstAsync: async (...args) => { calls.push(args); return { count: 1 }; } }) },
    });
    await assert.rejects(assertSiteWorkSynced('https://customer.test'), /Sync saved work/);
    assert.match(calls[0][0], /substr\(scope, 1, length\(\?\)\) = \? AND status != 'Completed'/);
    assert.deepEqual(calls[0].slice(1), ['https://customer.test|', 'https://customer.test|']);
    assert.ok(status);
  }
});

test('a site with no pending work can switch, but unreadable storage fails closed', async () => {
  for (const row of [{ count: 0 }, null, { count: NaN }]) {
    const { assertSiteWorkSynced } = load('src/offline/site_work.ts', {
      './database': { getOfflineDatabase: async () => ({ getFirstAsync: async () => row }) },
    });
    if (row?.count === 0) await assertSiteWorkSynced('https://customer.test');
    else await assert.rejects(assertSiteWorkSynced('https://customer.test'), /could not be checked/);
  }
});

test('switching preserves the installation ID and original URL until replacement setup succeeds', async () => {
  const storage = new Map();
  const api = load('src/storage/onboarding.ts', {
    'react-native': { Platform: { OS: 'android' } },
    'expo-application': { getAndroidId: () => 'phone' },
    'expo-crypto': { randomUUID: () => 'installation' },
    'expo-device': {},
    'expo-secure-store': {
      getItemAsync: async (key) => storage.get(key) || null,
      setItemAsync: async (key, value) => storage.set(key, value),
    },
  });
  await api.saveOnboardingRecord('https://old.test');
  await api.markSiteSetupRequired('https://old.test');
  assert.equal((await api.getOnboardingRecord()).requiresSiteSetup, true);
  assert.equal((await api.getOnboardingRecord()).siteUrl, 'https://old.test');
  await assert.rejects(api.markSiteSetupRequired('https://other.test'));
  await api.saveOnboardingRecord('https://new.test');
  const record = await api.getOnboardingRecord();
  assert.equal(record.requiresSiteSetup, undefined);
  assert.equal(record.siteUrl, 'https://new.test');
  assert.equal(record.installationId, 'installation');
  assert.equal(record.deviceIdentifier, 'phone');
});

test('site changing invokes guarded sign-out without deleting caches, outbox records or devices', async () => {
  const calls = [];
  const { changeSite } = load('src/auth/change_site.ts', {
    './session': { clearSessionForSiteChange: async (site, check, mark) => { calls.push(site); await check(); await mark(); } },
    '../offline/site_work': { assertSiteWorkSynced: async () => calls.push('check') },
    '../storage/onboarding': { getOnboardingRecord: async () => ({ siteUrl: 'https://old.test' }), markSiteSetupRequired: async () => calls.push('setup') },
  });
  await changeSite('https://old.test');
  assert.deepEqual(calls, ['https://old.test', 'check', 'setup']);
  await assert.rejects(changeSite('https://new.test'));
});

test('Profile and login expose a confirmed Change Site action without displaying the URL', () => {
  for (const file of ['src/app/(tabs)/profile.tsx', 'src/app/login.tsx']) {
    assert.match(read(file), /<ChangeSite siteUrl=\{siteUrl\}/);
  }
  const component = read('src/features/settings/ChangeSite.tsx');
  assert.match(component, /Alert.alert\('Change connected site\?'/);
  assert.match(component, /text: 'Cancel'/);
  assert.match(component, /fully close and reopen the app/);
  assert.match(component, /router.replace\('\/'\)/);
  assert.doesNotMatch(component, /Connected site|>\{siteUrl\}</);
  assert.match(component, /fontSize: 13/);
  assert.match(component, /minHeight: 44/);
  assert.match(read('src/app/index.tsx'), /record && !record.requiresSiteSetup/);
  assert.match(read('src/app/login.tsx'), /record.requiresSiteSetup/);
});

test('manual update checks stay compact while ready-to-install updates remain prominent', () => {
  const source = read('src/features/appUpdates/AppUpdateCard.tsx');
  assert.match(source, /status === 'ready' \? styles.button : styles.checkButton/);
  assert.match(source, /checkButton: \{ minHeight: 44, alignSelf: 'stretch'/);
  assert.match(source, /checkText: \{[^\n]*fontSize: 13/);
  assert.match(source, /card: \{ marginTop: 24, paddingTop: 16, gap: 4,/);
});

test('compact settings actions have neutral dividers without filled button backgrounds', () => {
  const updates = read('src/features/appUpdates/AppUpdateCard.tsx');
  const changeSite = read('src/features/settings/ChangeSite.tsx');
  assert.match(updates, /borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border/);
  for (const [source, style] of [[updates, 'checkButton'], [changeSite, 'button']]) {
    const row = source.match(new RegExp(`${style}: \\{([^\\n]+)\\}`))[1];
    assert.match(row, /borderBottomWidth: StyleSheet.hairlineWidth/);
    assert.match(row, /borderBottomColor: colors.border/);
    assert.doesNotMatch(row, /backgroundColor/);
  }
});
