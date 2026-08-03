import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRICING_CONFIG,
  SHIPPING_OPTIONS,
  calculateBasePriceCentavos,
  calculateCheckoutTotals,
  calculateProfitMarkupBasisPoints,
  normalizeCart,
  updateQuantity
} from '../pricing.js';
import catalog from '../data/catalog.json' with { type: 'json' };
import { paymentAdapter } from '../payment-adapter.js';

test('pricing configuration preserves the exact landed-cost formula and adds no extra IVA multiplier', () => {
  assert.equal(PRICING_CONFIG.fxMxnTenThousandthsPerUsd, 173_207);
  assert.equal(PRICING_CONFIG.landedUpliftBasisPoints, 1300);
  assert.equal(PRICING_CONFIG.targetProfitMarkupBasisPoints, 4000);
  assert.equal(PRICING_CONFIG.cleanPriceIncrementCentavos, 5000);
  assert.equal(catalog.pricingAssumptions.fxSourceDate, '2026-08-03');
  assert.equal(catalog.pricingAssumptions.fxSourceUrl, 'https://api.frankfurter.app/latest?from=USD&to=MXN');
  assert.match(catalog.pricingAssumptions.rule, /No separate IVA multiplier is added/);
});

test('catalog has 12 unique Ascension SKUs and every price derives from the exact formula', () => {
  assert.equal(catalog.products.length, 12);
  assert.equal(new Set(catalog.products.map((product) => product.code)).size, 12);
  for (const product of catalog.products) {
    assert.equal(product.brandSupplier.brand, 'Ascension Peptides');
    assert.match(product.source.productUrl, /^https:\/\/ascensionpeptides\.com\/product\//);
    assert.match(product.source.priceEvidenceUrl, /^https:\/\/ascensionpeptides\.com\/product\//);
    assert.match(product.image.sourceUrl, /^https:\/\/ascensionpeptides\.com\/wp-content\/uploads\//);
    const price = calculateBasePriceCentavos(product.sourceUsdCents);
    assert.equal(price, product.basePriceCentavos, product.code);
    assert.equal(price % 5000, 0, product.code);
    const profitMarkup = calculateProfitMarkupBasisPoints(product.sourceUsdCents, price);
    assert.equal(profitMarkup, product.profitMarkupBasisPoints, product.code);
    assert.ok(profitMarkup >= 3700 && profitMarkup <= 4300, `${product.code}: ${profitMarkup}`);
  }
});

test('clean-price rounding uses overflow-safe integer arithmetic at MXN 50 increments', () => {
  assert.equal(calculateBasePriceCentavos(6500), 180000);
  assert.equal(Number.isInteger(calculateBasePriceCentavos(6501)), true);
  assert.equal(calculateBasePriceCentavos(0), 0);
});

test('shipping configuration exposes exactly the two taxable launch estimates', () => {
  assert.deepEqual(SHIPPING_OPTIONS, [
    { id: 'standard', label: 'Estándar nacional', priceCentavos: 25000 },
    { id: 'express', label: 'Express nacional', priceCentavos: 34900 }
  ]);
});

test('checkout totals treat product and shipping prices as IVA-included final amounts', () => {
  assert.deepEqual(calculateCheckoutTotals([{ unitPriceCentavos: 174000, quantity: 2 }], 25000), {
    productSubtotalCentavos: 348000,
    shippingCentavos: 25000,
    taxableBaseCentavos: 321552,
    ivaCentavos: 51448,
    finalTotalCentavos: 373000
  });
});

test('included IVA rounds to the nearest centavo without floating-point money', () => {
  assert.equal(calculateCheckoutTotals([{ unitPriceCentavos: 1, quantity: 1 }], 2).ivaCentavos, 0);
  assert.equal(calculateCheckoutTotals([{ unitPriceCentavos: 4, quantity: 1 }], 0).ivaCentavos, 1);
});

test('quantities are positive bounded integers and unknown products are removed', () => {
  const ids = new Set(catalog.products.filter((product) => product.status === 'available').map((product) => product.code));
  assert.deepEqual(normalizeCart([
    { code: 'unknown', quantity: 2 },
    { code: [...ids][0], quantity: '3' },
    { code: [...ids][1], quantity: -2 },
    { code: [...ids][2], quantity: 500 }
  ], ids), [
    { code: [...ids][0], quantity: 3 },
    { code: [...ids][2], quantity: 20 }
  ]);
});

test('quantity updates support increment, decrement, and removal deterministically', () => {
  const cart = [{ code: 'BPC-157-10', quantity: 1 }];
  assert.deepEqual(updateQuantity(cart, 'BPC-157-10', 2), [{ code: 'BPC-157-10', quantity: 2 }]);
  assert.deepEqual(updateQuantity(cart, 'BPC-157-10', 0), []);
  assert.deepEqual(updateQuantity([], 'BPC-157-10', 1), [{ code: 'BPC-157-10', quantity: 1 }]);
});

test('payment adapter fails closed with a concise neutral status', async () => {
  assert.equal(paymentAdapter.available, false);
  assert.deepEqual(await paymentAdapter.createOrder(), {
    ok: false,
    code: 'PAYMENT_UNAVAILABLE',
    message: 'Pago no disponible.'
  });
});
