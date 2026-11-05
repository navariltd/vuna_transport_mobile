const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function fixture({ disconnected = false, refreshFails = false, evidence = false, alreadySubmitted = false, uploadFails = false } = {}) {
  const payload = { tripName: 'TRIP-1', stopName: 'STOP-1', taskName: 'TASK-1', proof: {
    request_id: 'stable-request-id', received_by: 'Depot clerk', items: [
      { source_row: 'RRI-1', batch_no: 'B1', delivered_qty: 2, serial_no: 'S1\nS2' },
    ],
  } };
  if (evidence) Object.assign(payload, { signatureSvg: '<svg/>', photoUri: 'file:///evidence.jpg', photoFilename: 'evidence.jpg' });
  const operation = { operationId: 'OP-1', operationType: 'submit_transport_pod', payload, status: 'Pending' };
  const calls = [];
  const uploads = [];
  const removed = [];
  const preparations = [];
  const cache = new Map([
    ['delivery-trip:TRIP-1', { trip: { name: 'TRIP-1', stops: [] } }],
    ['transport-proof:TASK-1', { task: 'TASK-1', docstatus: 0, items: [{ source_row: 'RRI-1', batch_no: 'B1', qty: 10, planned_qty: 10 }] }],
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
      prepareTransferProof: async (task, saveDraft) => { preparations.push({ task, saveDraft }); return { task: 'TASK-1', name: 'POD-1', docstatus: saveDraft && !alreadySubmitted ? 0 : 1 }; },
      uploadPODAttachment: async (...args) => {
        uploads.push(args);
        if (uploadFails) throw Object.assign(new Error('Upload disconnected'), { network: true });
        return { file_url: '/private/files/proof', fieldname: args[3] };
      },
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
    './connectivity': {}, './files': { readPODPhotoBase64: async () => 'photo-base64', removePODPhoto: (uri) => { if (uri) removed.push(uri); } }, react: {},
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/offline/sync.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => {
    assert.ok(framework[name], `Unexpected dependency ${name}`);
    return framework[name];
  } });
  return { operation, calls, cache, uploads, removed, preparations, synchronize: () => exports.synchronizeOfflineOperation('OP-1') };
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
  assert.equal(context.cache.get('transport-proof:TASK-1').items[0].qty, 2);
  assert.equal(context.cache.get('transport-proof:TASK-1').received_by, 'Depot clerk');
  assert.equal(context.calls.length, 1);
});

test('depot evidence uses a private persisted POD draft before submitting the unchanged payload', async () => {
  const context = fixture({ evidence: true });
  await context.synchronize();
  assert.equal(context.preparations[0].saveDraft, true);
  assert.equal(context.operation.payload.serverPodName, 'POD-1');
  assert.equal(context.uploads.length, 2);
  assert.deepEqual(context.uploads[0].slice(0, 4), ['TRIP-1', 'STOP-1', 'POD-1', 'signature']);
  assert.equal(context.uploads[1][3], 'delivery_photo');
  assert.equal(context.uploads[1][4], 'photo-base64');
  assert.equal(context.calls[0].proof.request_id, 'stable-request-id');
  assert.equal(context.operation.status, 'Completed');
  assert.deepEqual(context.removed, ['file:///evidence.jpg']);
});

test('interrupted evidence upload keeps the original evidence and prevents stock submission', async () => {
  const context = fixture({ evidence: true, uploadFails: true });
  await assert.rejects(context.synchronize(), /disconnected/);
  assert.equal(context.operation.status, 'Failed');
  assert.equal(context.calls.length, 0);
  assert.equal(context.removed.length, 0);
  assert.equal(context.operation.payload.signatureSvg, '<svg/>');
  assert.equal(context.operation.payload.proof.request_id, 'stable-request-id');
});

test('retry after a lost submission response never uploads to an already submitted proof', async () => {
  const context = fixture({ evidence: true, alreadySubmitted: true });
  await context.synchronize();
  assert.equal(context.uploads.length, 0);
  assert.equal(context.calls[0].proof.request_id, 'stable-request-id');
  assert.equal(context.operation.status, 'Completed');
});

test('foreground submit and background sync share one in-flight evidence operation', async () => {
  const context = fixture({ evidence: true });
  await Promise.all([context.synchronize(), context.synchronize()]);
  assert.equal(context.uploads.length, 2);
  assert.equal(context.calls.length, 1);
});
