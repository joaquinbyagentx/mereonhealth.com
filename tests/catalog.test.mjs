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

test('pricing configuration preserves the requested 35 percent profit markup', () => {
  assert.equal(PRICING_CONFIG.fxMxnCentavosPerUsd, 1750);
  assert.equal(PRICING_CONFIG.landedUpliftBasisPoints, 1300);
  assert.equal(PRICING_CONFIG.targetProfitMarkupBasisPoints, 3500);
  assert.equal(PRICING_CONFIG.cleanPriceIncrementCentavos, 1000);
});

test('every available SKU uses clean integer-centavo pricing within the 34.5–35.5% profit-markup range', () => {
  const available = catalog.products.filter((product) => product.status === 'available');
  assert.ok(available.length > 0);
  for (const product of available) {
    const price = calculateBasePriceCentavos(product.sourceUsdCents);
    assert.equal(price, product.basePriceCentavos, product.code);
    assert.equal(price % 1000, 0, product.code);
    const profitMarkup = calculateProfitMarkupBasisPoints(product.sourceUsdCents, price);
    assert.equal(profitMarkup, product.profitMarkupBasisPoints, product.code);
    assert.ok(profitMarkup >= 3450 && profitMarkup <= 3550, `${product.code}: ${profitMarkup}`);
  }
});

test('clean-price rounding uses integer arithmetic and rounds midpoint upward', () => {
  assert.equal(calculateBasePriceCentavos(6500), 174000);
  assert.equal(Number.isInteger(calculateBasePriceCentavos(6501)), true);
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

test('payment adapter fails closed without transmitting an order', async () => {
  assert.equal(paymentAdapter.available, false);
  assert.deepEqual(await paymentAdapter.createOrder(), {
    ok: false,
    code: 'PAYMENT_UNAVAILABLE',
    message: 'Pedido no enviado. Pago seguro próximamente.'
  });
});
