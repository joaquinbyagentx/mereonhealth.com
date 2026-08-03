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

const EXPECTED_RESEARCH_COPY = {
  'BPC-157': ['Reparación de tejidos', 'Investigado en modelos preclínicos para entender cómo responden los tejidos después de un daño y cómo se organizan durante su reparación, con especial interés en tejidos digestivos, musculares y conectivos.'],
  'TB-500': ['Movimiento celular y reparación de tejidos', 'Péptido relacionado con thymosin beta-4, investigado en modelos preclínicos para entender cómo se desplazan y organizan las células durante la respuesta de músculos, tendones y otros tejidos ante un daño.'],
  'MOTS-C': ['Energía celular y metabolismo', 'Péptido derivado de una secuencia mitocondrial, investigado para entender cómo las células utilizan la energía y responden ante cambios metabólicos y situaciones de estrés celular.'],
  'GHK-Cu': ['Piel, colágeno y tejido conectivo', 'Tripéptido capaz de unirse al cobre, investigado para entender su participación en la formación de colágeno y en la respuesta de la piel y otros tejidos conectivos durante procesos de renovación y reparación.'],
  'CJC-1295 No-DAC + Ipamorelin': ['Señales hormonales y metabolismo', 'Mezcla de dos péptidos investigada para entender las señales que regulan la liberación de hormona de crecimiento y su relación con el metabolismo, el uso de energía y el mantenimiento de los tejidos.'],
  'Thymosin Alpha 1': ['Respuesta inmunológica', 'Investigado para entender cómo se comunican y coordinan las células del sistema inmunológico ante distintas señales y condiciones experimentales.'],
  Tesamorelin: ['Regulación hormonal', 'Análogo peptídico investigado para entender cómo se regula la liberación de hormona de crecimiento y cómo estas señales se relacionan con diferentes procesos metabólicos.'],
  Epithalon: ['Envejecimiento celular y telómeros', 'Tetrapéptido investigado en modelos preclínicos para entender los cambios que ocurren en las células con el paso del tiempo y el papel de los telómeros en el mantenimiento celular.'],
  KPV: ['Respuesta inflamatoria', 'Tripéptido investigado para entender cómo responden las células ante señales inflamatorias, especialmente en modelos relacionados con la piel y los tejidos del sistema digestivo.'],
  GLOW: ['Piel, colágeno y reparación de tejidos', 'Combina GHK-Cu, BPC-157 y TB-500, péptidos investigados en modelos preclínicos para entender la formación de colágeno, la organización celular y la respuesta de la piel y otros tejidos durante su reparación.'],
  KLOW: ['Reparación de tejidos y respuesta inflamatoria', 'Combina GHK-Cu, BPC-157, TB-500 y KPV. Se investiga en modelos preclínicos para entender cómo se organizan los tejidos durante su reparación y cómo responden las células ante señales inflamatorias.'],
  'Wolverine Stack': ['Músculos, tendones y tejido conectivo', 'Combina BPC-157 y TB-500, dos péptidos investigados en modelos preclínicos para entender la respuesta de músculos, tendones y tejido conectivo después de una lesión, daño o esfuerzo.']
};

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

test('all 12 products have the approved exact research areas and descriptions', () => {
  assert.equal(Object.keys(EXPECTED_RESEARCH_COPY).length, 12);
  assert.deepEqual(
    Object.fromEntries(catalog.products.map(({ name, researchArea, researchDescription }) => [
      name,
      [researchArea, researchDescription]
    ])),
    EXPECTED_RESEARCH_COPY
  );
  for (const product of catalog.products) {
    assert.equal('researchContext' in product, false, `${product.code} retains a stale description field`);
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
