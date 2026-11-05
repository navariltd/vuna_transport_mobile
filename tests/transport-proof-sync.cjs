const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function fixture({ disconnected = false, refreshFails = false } = {}) {
  const payload = { tripName: 'TRIP-1', stopName: 'STOP-1', taskName: 'TASK-1', proof: {
    request_id: 'stable-request-id', received_by: 'Depot clerk', items: [
      { source_row: 'RRI-1', batch_no: 'B1', delivered_qty: 2, serial_no: 'S1\nS2' },
    ],
  } };
  const operation = { operationId: 'OP-1', operationType: 'submit_transport_pod', payload, status: 'Pending' };
  const calls = [];
  const cache = new Map([
    ['delivery-trip:TRIP-1', { trip: { name: 'TRIP-1', stops: [] } }],
    ['transport-proof:TASK-1', { task: 'TASK-1', docstatus: 0, items: [] }],
  ]);
  const framework = {
    '../auth/session': { isConnectivityFailure: (error) => Boolean(error.network) },
    '../features/trips/api': {
      submitTransferProof: async (task, proof) => {
        calls.push({ task, proof: structuredClone(proof) });
        if (disconnected) throw Object.assign(new Error('Offline'), { network: true });
        return { name: 'POD-1', outcome: 'Completed' };
      },
      getTripDetails: async () => {
        if (refreshFails) throw new Error('Refresh failed');
        return { trip: { name: 'TRIP-1', stops: [] } };
      },
      prepareTransferProof: async () => ({ task: 'TASK-1', name: 'POD-1', docstatus: 1 }),
    },
    './cache': {
      getCachedValue: async (namespace, key) => ({ value: cache.get(`${namespace}:${key}`) }),
      setCachedValue: async (namespace, key, value) => cache.set(`${namespace}:${key}`, value),
    },
    './outbox': {
      getOfflineOperation: async () => operation,
      updateOfflineOperation: async (_id, values) => Object.assign(operation, values),
    },
    './trip_repository': { cacheSynchronizedTrip: async () => {} },
    './connectivity': {}, './files': {}, react: {},
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/offline/sync.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => {
    assert.ok(framework[name], `Unexpected dependency ${name}`);
    return framework[name];
  } });
  return { operation, calls, cache, synchronize: () => exports.synchronizeOfflineOperation('OP-1') };
}

test('queued handover preserves task, stable request ID and exact serial subset', async () => {
  const context = fixture();
  const result = await context.synchronize();
  assert.equal(result.name, 'POD-1');
  assert.equal(context.operation.status, 'Completed');
  assert.equal(context.calls[0].task, 'TASK-1');
  assert.equal(context.calls[0].proof.request_id, 'stable-request-id');
  assert.equal(context.calls[0].proof.items[0].serial_no, 'S1\nS2');
});

test('offline failure keeps evidence queued for retry, not completed', async () => {
  const context = fixture({ disconnected: true });
  await assert.rejects(context.synchronize(), /Offline/);
  assert.equal(context.operation.status, 'Failed');
  assert.equal(context.operation.payload.proof.request_id, 'stable-request-id');
  assert.equal(context.cache.get('transport-proof:TASK-1').docstatus, 0);
});

test('failed refresh after posting does not reopen stock posting', async () => {
  const context = fixture({ refreshFails: true });
  await context.synchronize();
  assert.equal(context.operation.status, 'Completed');
  assert.equal(context.cache.get('transport-proof:TASK-1').docstatus, 1);
  assert.equal(context.calls.length, 1);
});
