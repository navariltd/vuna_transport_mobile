const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const filename = path.join(__dirname, '../src/features/trips/collection_uom.ts');
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const model = {};
vm.runInNewContext(code, { exports: model });
const item = { uom: 'Carton', stock_uom: 'Pcs', qty: 2, stock_qty: 24, conversion_factor: 12, uoms: ['Carton', 'Pcs', 'Pack'], uom_factors: { Carton: 12, Pcs: 1, Pack: 6 }, whole_number_uoms: ['Carton', 'Pcs', 'Pack'] };

test('two cartons offer twenty-four pieces, not two pieces', () => {
  assert.equal(model.collectionLimit(item, 'Pcs'), 24);
  assert.equal(model.collectionLimit(item, 'Pack'), 4);
  assert.equal(model.validateCollectionQuantity(item, '5', 'Pcs'), null);
  assert.ok(model.validateCollectionQuantity(item, '25', 'Pcs'));
});
test('switching units preserves the physical quantity and blank input', () => {
  assert.equal(model.convertCollectionQuantity(item, '2', 'Carton', 'Pcs'), '24');
  assert.equal(model.convertCollectionQuantity(item, '24', 'Pcs', 'Carton'), '2');
  assert.equal(model.convertCollectionQuantity(item, '', 'Carton', 'Pcs'), '');
  assert.equal(model.convertCollectionQuantity(item, '.', 'Carton', 'Pcs'), '.');
});
test('whole units, invalid quantities and unknown units are rejected', () => {
  for (const qty of ['0', '-1', 'NaN', 'Infinity', '']) assert.ok(model.validateCollectionQuantity(item, qty, 'Pcs'));
  assert.ok(model.validateCollectionQuantity(item, '0.5', 'Pcs'));
  assert.ok(model.validateCollectionQuantity(item, '1', 'Unknown'));
  assert.equal(model.collectionUomFactor(item, 'Unknown'), null);
});
test('older sites remain source-unit only until the backend is updated', () => {
  const old = { uom: 'Carton', stock_uom: 'Pcs', qty: 2, conversion_factor: 12, uoms: ['Carton'] };
  assert.equal(model.collectionUoms(old).join(','), 'Carton');
  assert.equal(model.collectionLimit(old, 'Carton'), 2);
  assert.equal(model.collectionUomFactor(old, 'Pcs'), null);
});
test('explicit server exclusions are not bypassed by the original unit fallback', () => {
  const options = { ...item, uom_factors: { Pcs: 1 } };
  assert.equal(model.collectionUomFactor(options, 'Carton'), null);
  assert.equal(model.collectionUoms(options).join(','), 'Pcs');
});
test('only the unplanned collection screen offers unit selection', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../src/app/trips/[tripName]/collections/[stopName].tsx'), 'utf8');
  assert.match(screen, /convertCollectionQuantity\(line\.item!/);
  assert.match(screen, /validateCollectionQuantity\(line\.item/);
  assert.match(screen, /uom: line\.uom/);
  const planned = fs.readFileSync(path.join(__dirname, '../src/features/proof-of-delivery/pod_form.tsx'), 'utf8');
  assert.doesNotMatch(planned, /convertCollectionQuantity|collectionUoms/);
});
