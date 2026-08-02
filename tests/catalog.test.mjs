import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRICING_CONFIG,
  SHIPPING_OPTIONS,
  calculateBasePriceCentavos,
  calculateCheckoutTotals,
  calculateGrossMarginBasisPoints,
  normalizeCart,
  updateQuantity
} from '../pricing.js';
import catalog from '../data/catalog.json' with { type: 'json' };
import { paymentAdapter } from '../payment-adapter.js';

test('pricing configuration preserves the requested 45 percent target', () => {
  assert.equal(PRICING_CONFIG.fxMxnCentavosPerUsd, 1750);
  assert.equal(PRICING_CONFIG.landedUpliftBasisPoints, 1300);
  assert.equal(PRICING_CONFIG.targetMarginBasisPoints, 4500);
  assert.equal(PRICING_CONFIG.cleanPriceIncrementCentavos, 5000);
});

test('every available SKU uses clean integer-centavo pricing within the 40–50% margin range', () => {
  const available = catalog.products.filter((product) => product.status === 'available');
  assert.ok(available.length > 0);
  for (const product of available) {
    const price = calculateBasePriceCentavos(product.sourceUsdCents);
    assert.equal(price, product.basePriceCentavos, product.code);
    assert.equal(price % 5000, 0, product.code);
    const margin = calculateGrossMarginBasisPoints(product.sourceUsdCents, price);
    assert.ok(margin >= 4000 && margin <= 5000, `${product.code}: ${margin}`);
  }
});

test('clean-price rounding uses integer arithmetic and rounds midpoint upward', () => {
  assert.equal(calculateBasePriceCentavos(6500), 235000);
  assert.equal(Number.isInteger(calculateBasePriceCentavos(6501)), true);
});

test('shipping configuration exposes exactly the two taxable launch estimates', () => {
  assert.deepEqual(SHIPPING_OPTIONS, [
    { id: 'standard', label: 'Estándar nacional', priceCentavos: 19900 },
    { id: 'express', label: 'Express nacional', priceCentavos: 34900 }
  ]);
});

test('checkout totals tax products and shipping at 16 percent in separate lines', () => {
  assert.deepEqual(calculateCheckoutTotals([{ unitPriceCentavos: 235000, quantity: 2 }], 19900), {
    productSubtotalCentavos: 470000,
    shippingCentavos: 19900,
    taxableBaseCentavos: 489900,
    ivaCentavos: 78384,
    finalTotalCentavos: 568284
  });
});

test('IVA rounds to the nearest centavo without floating-point money', () => {
  assert.equal(calculateCheckoutTotals([{ unitPriceCentavos: 1, quantity: 1 }], 2).ivaCentavos, 0);
  assert.equal(calculateCheckoutTotals([{ unitPriceCentavos: 2, quantity: 1 }], 2).ivaCentavos, 1);
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

test('payment adapter fails closed without transmitting an order', async () => {
  assert.equal(paymentAdapter.available, false);
  assert.deepEqual(await paymentAdapter.createOrder(), {
    ok: false,
    code: 'PAYMENT_UNAVAILABLE',
    message: 'Pedido no enviado. Pago seguro próximamente.'
  });
});
