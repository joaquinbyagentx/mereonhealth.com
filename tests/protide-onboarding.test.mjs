import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import catalog from '../data/catalog.json' with { type: 'json' };
import { CATALOG as workerCatalog } from '../worker/src/catalog.js';

const BASELINE = '51b39d34b0711139d87feff2c42a834a3cffa120';
const expectedAffected = {
  'SERMORELIN-5': { price: 170000, stock: 0, enabled: false },
  'GLP2-15': { price: 335000, stock: 4, enabled: true },
  'IPAMORELIN-10': { price: 210000, stock: 4, enabled: true },
  'KLOW-80': { price: 405000, stock: 2, enabled: true }
};

const byCode = new Map(catalog.products.map((product) => [product.code, product]));

test('all affected variants have exact public prices and physical stock', () => {
  for (const [code, expected] of Object.entries(expectedAffected)) {
    const product = byCode.get(code);
    assert.ok(product, `${code} must exist`);
    assert.equal(product.basePriceCentavos, expected.price, code);
    assert.equal(product.stockQuantity, expected.stock, code);
    assert.equal(product.purchaseEnabled, expected.enabled, code);
  }
  assert.equal(byCode.get('GLP2-15').presentation, '15 mg · polvo liofilizado · vial de 3 mL');
  assert.equal(byCode.get('IPAMORELIN-10').presentation, '10 mg · polvo liofilizado · vial de 3 mL');
  assert.equal(byCode.get('IPAMORELIN-5').presentation, '5 mg');
});

test('worker mirrors every canonical backend SKU price and stock', () => {
  const expectedCodes = new Set([
    ...catalog.products.filter((product) => product.purchaseEnabled && product.stockQuantity > 0).map((product) => product.code),
    'SERMORELIN-5'
  ]);
  assert.deepEqual(new Set(Object.keys(workerCatalog)), expectedCodes);
  for (const code of expectedCodes) {
    const source = byCode.get(code);
    const backend = workerCatalog[code];
    assert.equal(backend.name, source.name, code);
    assert.equal(backend.unitAmount, source.basePriceCentavos, code);
    assert.equal(backend.initialStock, source.stockQuantity, code);
  }
});

test('unrelated baseline prices and stock remain unchanged', () => {
  const baseline = JSON.parse(execFileSync('git', ['show', `${BASELINE}:data/catalog.json`], { encoding: 'utf8' }));
  const affected = new Set(Object.keys(expectedAffected));
  const baselineByCode = new Map(baseline.products.map((product) => [product.code, product]));
  for (const product of catalog.products) {
    if (affected.has(product.code) || product.code === 'SERMORELIN-5') continue;
    const before = baselineByCode.get(product.code);
    assert.ok(before, `${product.code} must exist in baseline`);
    assert.equal(product.basePriceCentavos, before.basePriceCentavos, `${product.code} price`);
    assert.equal(product.stockQuantity, before.stockQuantity, `${product.code} stock`);
  }
});

test('numbered inventory migration is additive and safe to execute twice', () => {
  const migration = readFileSync(new URL('../worker/migrations/0005_protide_inventory.sql', import.meta.url), 'utf8');
  const script = String.raw`
import sqlite3, sys
sql = sys.stdin.read()
db = sqlite3.connect(':memory:')
db.executescript('CREATE TABLE inventory(code TEXT PRIMARY KEY, on_hand INTEGER NOT NULL, reserved INTEGER NOT NULL, sold INTEGER NOT NULL, updated_at INTEGER NOT NULL); INSERT INTO inventory VALUES ("KLOW-80",1,0,0,0);')
db.executescript(sql)
db.executescript(sql)
rows = dict(db.execute('SELECT code,on_hand FROM inventory'))
assert rows['KLOW-80'] == 2, rows
assert rows['GLP2-15'] == 4, rows
assert rows['IPAMORELIN-10'] == 4, rows
assert rows['SERMORELIN-5'] == 0, rows
`;
  execFileSync('python3', ['-c', script], { input: migration });
});

test('generated public surface contains no private procurement evidence', () => {
  const publicSurface = [catalog, readFileSync(new URL('../script.js', import.meta.url), 'utf8')]
    .map((value) => typeof value === 'string' ? value : JSON.stringify(value)).join('\n');
  assert.doesNotMatch(publicSurface, /USD unit cost|DOF FX|supplier cost|private order|order screenshot/i);
});
