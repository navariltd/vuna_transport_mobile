const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(filename) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports });
  return exports;
}
const model = load('src/features/proof-of-delivery/form_model.ts');
const tasks = load('src/features/trips/task_model.ts');
function proof(type = 'Supplier Pickup') {
  return { task_type: type, capture_identity: type === 'Supplier Pickup', reference_name: 'PO-1', items: [{ source_row: 'POI-1', item_code: 'PACK', planned_qty: 2, qty: 2, uom: 'Carton', has_batch_no: true }] };
}

test('supplier collections use the common pickup form and PO reference', () => {
  const draft = model.transportForm(proof(), 'Supplier');
  assert.equal(draft.mode, 'pickup');
  assert.equal(draft.reference, 'PO-1');
  assert.equal(draft.items[0].uom, 'Carton');
  assert.equal(draft.items[0].captureBatch, true);
  assert.equal(draft.items[0].captureSerials, false);
});
test('supplier collection tasks have a collection action rather than a depot-delivery label', () => {
  assert.equal(tasks.taskTitle({ task_type: 'Supplier Pickup' }), 'Supplier collection');
  assert.equal(tasks.taskActionLabel({ task_type: 'Supplier Pickup' }), 'Confirm collection');
});
test('collection quantity, batch and serial capture are sent without changing UOM or source row', () => {
  const original = proof();
  const draft = model.transportForm(original, 'Supplier');
  draft.items[0].accepted = '1';
  draft.items[0].batch = 'BATCH-1';
  draft.items[0].serials = 'SERIAL-1';
  draft.receivedBy = 'Supplier clerk';
  draft.remarks = 'Only one carton released';
  const payload = model.transportPayload(original, draft, 'request-one');
  assert.equal(payload.items[0].source_row, 'POI-1');
  assert.equal(payload.items[0].batch_no, 'BATCH-1');
  assert.equal(payload.items[0].serial_no, 'SERIAL-1');
  assert.equal(payload.items[0].delivered_qty, 1);
  assert.equal(payload.items[0].rejected_qty, 0);
  assert.equal(Object.keys(model.validatePODForm(draft)).length, 0);
});
test('partial collections require remarks and a release person', () => {
  const draft = model.transportForm(proof(), 'Supplier');
  draft.items[0].accepted = '1';
  assert.ok(model.validatePODForm(draft).remarks);
  assert.ok(model.validatePODForm(draft).receivedBy);
});
test('return pickups keep authoritative batch identity rather than allowing it to be overwritten', () => {
  const original = proof('Return Pickup');
  original.items[0].batch_no = 'RETURN-BATCH';
  const draft = model.transportForm(original, 'Customer');
  draft.items[0].batch = 'OTHER';
  assert.equal(model.transportPayload(original, draft, 'request-two').items[0].batch_no, 'RETURN-BATCH');
  assert.equal(draft.mode, 'pickup');
});
