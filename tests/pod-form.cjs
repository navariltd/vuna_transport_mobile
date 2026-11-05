const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/features/proof-of-delivery/form_model.ts'), 'utf8');
const model = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: model });
const customer = { customer: 'Customer', delivery_note: 'DN', received_by: 'Jane', rejection_reasons: ['Damage'], items: [{ name: 'DNI', item_code: 'MILK', ordered_qty: 20, delivered_qty: 20, uom: 'Carton' }] };
const depot = { task: 'TASK', task_type: 'Transfer Receipt', received_by: 'Jane', reference_name: 'STE', rejection_reasons: ['Damage'], items: [{ source_row: 'SED', item_code: 'MILK', planned_qty: 20, qty: 20, uom: 'Carton', batch_no: 'B1', serial_no: 'S1\nS2' }] };

test('customer and depot use identical accepted/rejected arithmetic and reason validation', () => {
  for (const draft of [model.customerForm(customer), model.transportForm(depot, 'Depot')]) {
    draft.items[0].accepted = '15';
    assert.equal(model.rejectedQuantity(draft.items[0], draft.mode), 5);
    assert.ok(model.validatePODForm(draft)['rejection.0'] || model.validatePODForm(draft)['rejection.DNI']);
    draft.items[0].reason = 'Damage';
    assert.equal(Object.keys(model.validatePODForm(draft)).length, 0);
  }
});
test('zero is valid but empty, nonfinite and over-planned quantities are not', () => {
  const draft = model.customerForm(customer);
  draft.items[0].reason = 'Damage';
  for (const value of ['', 'NaN', 'Infinity', '-1', '21']) {
    draft.items[0].accepted = value;
    assert.ok(model.validatePODForm(draft)['quantity.DNI']);
  }
  draft.items[0].accepted = '0';
  assert.equal(Object.keys(model.validatePODForm(draft)).length, 0);
});
test('only depot shortage mode separates rejected from missing, with mandatory remarks', () => {
  const draft = model.transportForm(depot, 'Depot');
  Object.assign(draft.items[0], { accepted: '10', rejected: '5', recordMissing: true, reason: 'Damage' });
  assert.equal(model.rejectedQuantity(draft.items[0], 'depot'), 5);
  assert.ok(model.validatePODForm(draft).remarks);
  draft.remarks = 'Five cartons missing';
  assert.equal(Object.keys(model.validatePODForm(draft)).length, 0);
});
test('partial pickup is uncollected, not rejected or a new return request', () => {
  const draft = model.transportForm({ ...depot, task_type: 'Return Pickup' }, 'Depot');
  draft.items[0].accepted = '15';
  assert.equal(model.rejectedQuantity(draft.items[0], 'pickup'), 0);
  assert.ok(model.validatePODForm(draft).remarks);
  draft.remarks = 'Only fifteen released';
  const payload = model.transportPayload(depot, draft, 'stable');
  assert.equal(payload.items[0].rejected_qty, 0);
  assert.equal(payload.items[0].delivered_qty, 15);
});
test('transport adapter preserves batch, serial subsets, transaction UOM and custody split', () => {
  const draft = model.transportForm(depot, 'Depot');
  Object.assign(draft.items[0], { accepted: '10', reason: 'Damage', serials: 'S1', rejectedSerials: 'S2', custody: 'Split between depot and vehicle', depotRejected: '4', depotSerials: 'S2' });
  const row = model.transportPayload(depot, draft, 'stable').items[0];
  assert.equal(row.source_row, 'SED'); assert.equal(row.batch_no, 'B1');
  assert.equal(row.serial_no, 'S1'); assert.equal(row.rejected_serial_no, 'S2');
  assert.equal(row.depot_received_rejected_qty, 4); assert.equal(row.rejected_qty, 10);
  assert.equal(draft.items[0].uom, 'Carton');
  draft.items[0].depotRejected = '11';
  assert.ok(model.validatePODForm(draft)['custody.0']);
});
test('customer adapter preserves original row identity and receiver details', () => {
  const draft = model.customerForm(customer);
  Object.assign(draft, { receivedBy: ' John ', phone: ' 0712345678 ' });
  Object.assign(draft.items[0], { accepted: '15', reason: 'Damage' });
  const saved = model.applyCustomerForm(customer, draft);
  assert.equal(saved.items[0].name, 'DNI'); assert.equal(saved.items[0].delivered_qty, 15);
  assert.equal(saved.items[0].rejected_qty, 5); assert.equal(saved.receiver_phone, '0712345678');
  assert.equal(saved.received_by, 'John');
});
test('both confirmation adapters render the same shared PODForm, not separate form layouts', () => {
  for (const file of ['features/proof-of-delivery/customer_confirmation.tsx', 'features/trips/transport_confirmation.tsx']) {
    const screen = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
    assert.match(screen, /<PODForm /);
    assert.doesNotMatch(screen, /<TextInput|<SignaturePad/);
  }
});
