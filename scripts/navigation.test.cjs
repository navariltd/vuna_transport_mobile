const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const moduleObject = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(path.join(__dirname, '../src/features/trips/navigation_model.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleObject, exports: moduleObject.exports });
const { createNavigationRun, parseNavigationDestination } = moduleObject.exports;
const destination = { version: 1, trip_name: 'TRIP', stop_name: 'STOP', title: 'Depot', latitude: -1, longitude: 37 };

test('only the requested stop and exact numeric coordinates may be navigated', () => {
  assert.equal(parseNavigationDestination(destination, 'TRIP', 'STOP'), destination);
  for (const change of [{ trip_name: 'OTHER' }, { stop_name: 'OTHER' }, { latitude: null }, { latitude: '1' }, { latitude: 91 }, { longitude: NaN }, { latitude: 0, longitude: 0 }, { title: '' }]) {
    assert.throws(() => parseNavigationDestination({ ...destination, ...change }, 'TRIP', 'STOP'));
  }
});

function fixture(overrides = {}) {
  const calls = [];
  const steps = Object.fromEntries(['prepare', 'authorize', 'setDestination', 'guide', 'cleanup'].map((name) => [name, async () => { calls.push(name); return destination; }]));
  return { calls, run: createNavigationRun({ ...steps, ...overrides }) };
}

test('one explicit start makes one request, with no automatic retry', async () => {
  const { calls, run } = fixture();
  await Promise.all([run.start(), run.start()]);
  assert.deepEqual(calls, ['prepare', 'authorize', 'setDestination', 'guide']);
  await run.dispose(); await run.dispose();
  assert.equal(calls.filter((call) => call === 'cleanup').length, 1);
});

test('terms, GPS, quota and SDK failures clean up without proceeding or retrying', async () => {
  for (const failure of ['prepare', 'authorize', 'setDestination', 'guide']) {
    const { calls, run } = fixture({ [failure]: async () => { throw new Error(failure); } });
    await assert.rejects(run.start());
    await run.dispose();
    assert.equal(calls.at(-1), 'cleanup');
    assert.equal(calls.filter((call) => call === 'cleanup').length, 1);
    if (failure === 'prepare' || failure === 'authorize') assert.ok(!calls.includes('setDestination'));
  }
});

test('leaving or changing session during authorization prevents a billed native request', async () => {
  let release;
  const { calls, run } = fixture({ authorize: () => new Promise((resolve) => { release = resolve; }) });
  const starting = run.start();
  await new Promise((resolve) => setImmediate(resolve));
  const disposing = run.dispose();
  release(destination);
  await Promise.all([starting, disposing]);
  assert.deepEqual(calls, ['prepare', 'cleanup']);
});

test('leaving during native initialization waits, then cleans up without authorization', async () => {
  let release;
  const { calls, run } = fixture({ prepare: () => new Promise((resolve) => { release = resolve; }) });
  const starting = run.start(); const disposing = run.dispose();
  release(); await Promise.all([starting, disposing]);
  assert.deepEqual(calls, ['cleanup']);
});

test('a disposed screen cannot start navigation', async () => {
  const { calls, run } = fixture();
  await run.dispose(); await run.start();
  assert.deepEqual(calls, ['cleanup']);
});
