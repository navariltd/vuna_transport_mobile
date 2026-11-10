const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(path.join(__dirname, '../src/features/trips/trip_search.ts'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exportsUnderTest = {};
vm.runInNewContext(code, { exports: exportsUnderTest });
const { searchAssignedTrips } = exportsUnderTest;

function trip(name, status, vehicle, departure_time) {
  return Object.freeze({ name, status, vehicle, departure_time, stop_count: 1, completed_stop_count: 0, stops: [] });
}
const trips = Object.freeze([
  trip('MAT-DT-2026-00001', 'Scheduled', 'KDT 900Y'),
  trip('MAT-DT-2026-00002', 'In Transit', 'KDZ 234K'),
  trip('MAT-DT-2026-00003', 'Completed', 'KDT 900Y', '2026-11-09 10:00:00'),
  trip('MAT-DT-2026-00004', 'Completed', 'ABC 123D', '2026-11-10 10:00:00'),
  trip('MAT-DT-2026-00005', 'Cancelled', 'KDT 900Y'),
  trip('MAT-DT-2026-00006', 'Draft'),
]);
const names = rows => Array.from(rows, row => row.name);

test('blank search preserves status groups, priority and completed-trip ordering', () => {
  for (const query of ['', '   ']) {
    const result = searchAssignedTrips(trips, query);
    assert.equal(result.isSearching, false);
    assert.deepEqual(names(result.activeTrips), [trips[1].name, trips[0].name, trips[5].name]);
    assert.deepEqual(names(result.completedTrips), [trips[3].name, trips[2].name]);
  }
});

test('trip numbers support partial and case-insensitive searches', () => {
  const result = searchAssignedTrips(trips, ' mat-dt-2026-00002 ');
  assert.equal(result.isSearching, true);
  assert.deepEqual(names(result.activeTrips), [trips[1].name]);
  assert.equal(result.completedTrips.length, 0);
  assert.deepEqual(names(searchAssignedTrips(trips, '00003').completedTrips), [trips[2].name]);
});

test('vehicle searches tolerate omitted spaces and punctuation across active and completed trips', () => {
  for (const query of ['kdt', ' KDT900Y ', 'kdt-900y']) {
    const result = searchAssignedTrips(trips, query);
    assert.deepEqual(names(result.activeTrips), [trips[0].name]);
    assert.deepEqual(names(result.completedTrips), [trips[2].name]);
  }
});

test('completed-only matches remain separate and cancelled trips stay hidden', () => {
  const completed = searchAssignedTrips(trips, 'abc123d');
  assert.equal(completed.activeTrips.length, 0);
  assert.deepEqual(names(completed.completedTrips), [trips[3].name]);
  const cancelled = searchAssignedTrips(trips, '00005');
  assert.equal(cancelled.activeTrips.length + cancelled.completedTrips.length, 0);
});

test('no matches, absent vehicles and an empty cached list are safe', () => {
  const result = searchAssignedTrips(trips, 'not-found');
  assert.equal(result.isSearching, true);
  assert.equal(result.activeTrips.length + result.completedTrips.length, 0);
  assert.deepEqual(names(searchAssignedTrips(trips, '00006').activeTrips), [trips[5].name]);
  assert.equal(searchAssignedTrips([], 'kdt').activeTrips.length, 0);
});

test('clearing a search restores the full list without mutating cached trips', () => {
  const originalOrder = names(trips);
  searchAssignedTrips(trips, 'kdt');
  const restored = searchAssignedTrips(trips, '');
  assert.equal(restored.activeTrips.length + restored.completedTrips.length, 5);
  assert.deepEqual(names(trips), originalOrder);
});

test('current query is applied to refreshed trips without combining unrelated fields', () => {
  const updated = [...trips, trip('MAT-DT-2026-00007', 'Scheduled', 'KDT 900Y')];
  assert.deepEqual(names(searchAssignedTrips(updated, 'kdt900y').activeTrips), [trips[0].name, updated[6].name]);
  const combined = searchAssignedTrips(trips, '00001KDT');
  assert.equal(combined.activeTrips.length + combined.completedTrips.length, 0);
});
