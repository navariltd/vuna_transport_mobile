const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/features/trips/task_model.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const model = {};
vm.runInNewContext(compiled, { exports: model, Set });
const pickup = { name: 'PICKUP', task_type: 'Return Pickup', status: 'Ready', can_record_proof: true };
const delivery = { name: 'DELIVERY', task_type: 'Transfer Receipt', status: 'Ready', can_record_proof: true };

test('mixed customer and pickup work stays at one physical stop', () => {
  const stop = { name: 'STOP', delivery_note: 'DN', tasks: [pickup], can_complete_delivery: true };
  const actions = model.stopActions(stop);
  assert.equal(actions.length, 2);
  assert.equal(actions[0].task_type, 'Customer Delivery');
  assert.equal(stop.tasks.length, 1, 'presentation must not create persisted tasks');
  assert.equal(model.nextStopAction(stop, 'customer:DN').name, 'PICKUP');
});

test('customer POD, not whole-stop visited flag, determines customer completion', () => {
  const stop = { name: 'STOP', visited: 0, delivery_note: 'DN', tasks: [pickup], proof_of_delivery: { docstatus: 1 } };
  assert.equal(model.stopActions(stop).find((task) => task.task_type === 'Customer Delivery').status, 'Completed');
  assert.equal(model.stopActions({ ...stop, visited: 1, proof_of_delivery: undefined }).find((task) => task.task_type === 'Customer Delivery').status, 'Ready');
});

test('queued and dependent tasks are not offered as the next action', () => {
  const blocked = { name: 'BLOCKED', task_type: 'Transfer Receipt', status: 'Ready', blocked_reason: 'Pickup required' };
  const stop = { tasks: [delivery, pickup, blocked] };
  const queued = model.stopActions(stop, { PICKUP: 'Pending' }).find((task) => task.name === 'PICKUP');
  assert.equal(queued.status, 'Awaiting Sync');
  assert.equal(model.taskFinished(queued), false);
  assert.equal(model.nextStopAction(stop, 'DELIVERY', { PICKUP: 'Pending' }), undefined);
  assert.equal(model.stopActions(stop, { PICKUP: 'Needs Attention' }).find((task) => task.name === 'PICKUP').status, 'Needs Attention');
});

test('routes preserve task identity and existing customer delivery screen', () => {
  assert.equal(model.stopActionPath('TRIP', 'STOP', pickup), '/trips/TRIP/tasks/PICKUP?stopName=STOP');
  assert.equal(model.stopActionPath('TRIP', 'STOP', { task_type: 'Customer Delivery' }), '/trips/TRIP/stops/STOP');
  assert.equal(model.taskActionLabel(pickup), 'Confirm pickup');
  assert.equal(model.taskActionLabel(delivery), 'Complete delivery');
});

test('legacy loading, cancelled and finished work are never offered for another handover', () => {
  const stop = { tasks: [delivery, { ...pickup, status: 'Completed with Variance' }, { ...pickup, name: 'FAIL', status: 'Failed' }, { name: 'LOAD', task_type: 'Transfer Dispatch', status: 'Ready' }, { ...pickup, name: 'CANCEL', status: 'Cancelled' }] };
  assert.equal(model.stopActions(stop).length, 3);
  assert.equal(model.nextStopAction(stop, 'DELIVERY'), undefined);
});
