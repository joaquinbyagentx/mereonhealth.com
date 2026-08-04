import test from 'node:test';
import assert from 'node:assert/strict';

import { SHIPPING_OPTIONS, calculateCheckoutTotals, normalizeCart, updateQuantity } from '../pricing.js';
import catalog from '../data/catalog.json' with { type: 'json' };
import { paymentAdapter } from '../payment-adapter.js';

const isSellable = (product) => product.purchaseEnabled === true && product.stockQuantity > 0;

const EXPECTED_RESEARCH_COPY = {
  'T-10': ['Identidad de catálogo sin ampliar', 'Referencia conservada con el nombre exacto del pedido y del catálogo público de la fuente. Mereon no atribuye una identidad química adicional sin evidencia pública verificable.'],
  'BPC-157': ['Reparación de tejidos', 'Investigado en modelos preclínicos para entender cómo responden los tejidos después de un daño y cómo se organizan durante su reparación, con especial interés en tejidos digestivos, musculares y conectivos.'],
  'TB-500': ['Movimiento celular y reparación de tejidos', 'Péptido relacionado con thymosin beta-4, investigado en modelos preclínicos para entender cómo se desplazan y organizan las células durante la respuesta de músculos, tendones y otros tejidos ante un daño.'],
  'MOTS-C': ['Energía celular y metabolismo', 'Péptido derivado de una secuencia mitocondrial, investigado para entender cómo las células utilizan la energía y responden ante cambios metabólicos y situaciones de estrés celular.'],
  'GHK-Cu': ['Piel, colágeno y tejido conectivo', 'Tripéptido capaz de unirse al cobre, investigado para entender su participación en la formación de colágeno y en la respuesta de la piel y otros tejidos conectivos durante procesos de renovación y reparación.'],
  'CJC-1295 No-DAC + Ipamorelin': ['Señales hormonales y metabolismo', 'Mezcla de dos péptidos investigada para entender las señales que regulan la liberación de hormona de crecimiento y su relación con el metabolismo, el uso de energía y el mantenimiento de los tejidos.'],
  Ipamorelin: ['Señales hormonales', 'Pentapéptido investigado para entender la señalización del receptor de grelina y su relación experimental con la liberación de hormona de crecimiento.'],
  'Thymosin Alpha 1': ['Respuesta inmunológica', 'Investigado para entender cómo se comunican y coordinan las células del sistema inmunológico ante distintas señales y condiciones experimentales.'],
  Tesamorelin: ['Regulación hormonal', 'Análogo peptídico investigado para entender cómo se regula la liberación de hormona de crecimiento y cómo estas señales se relacionan con diferentes procesos metabólicos.'],
  Epithalon: ['Envejecimiento celular y telómeros', 'Tetrapéptido investigado en modelos preclínicos para entender los cambios que ocurren en las células con el paso del tiempo y el papel de los telómeros en el mantenimiento celular.'],
  KPV: ['Respuesta inflamatoria', 'Tripéptido investigado para entender cómo responden las células ante señales inflamatorias, especialmente en modelos relacionados con la piel y los tejidos del sistema digestivo.'],
  GLOW: ['Piel, colágeno y reparación de tejidos', 'Combina GHK-Cu, BPC-157 y TB-500, péptidos investigados en modelos preclínicos para entender la formación de colágeno, la organización celular y la respuesta de la piel y otros tejidos durante su reparación.'],
  KLOW: ['Reparación de tejidos y respuesta inflamatoria', 'Combina GHK-Cu, BPC-157, TB-500 y KPV. Se investiga en modelos preclínicos para entender cómo se organizan los tejidos durante su reparación y cómo responden las células ante señales inflamatorias.'],
  'Wolverine Stack': ['Músculos, tendones y tejido conectivo', 'Combina BPC-157 y TB-500, dos péptidos investigados en modelos preclínicos para entender la respuesta de músculos, tendones y tejido conectivo después de una lesión, daño o esfuerzo.']
};

test('browser catalog preserves public FX provenance without exposing supplier economics', () => {
  assert.equal(catalog.pricingAssumptions.fxSourceDate, '2026-08-03');
  assert.equal(catalog.pricingAssumptions.fxSourceUrl, 'https://www.dof.gob.mx/indicadores.php');
  assert.equal(catalog.pricingAssumptions.fxMxnTenThousandthsPerUsd, 173_288);
  assert.equal(catalog.pricingAssumptions.ivaIncludedBasisPoints, 1600);
  for (const privateKey of ['supplierOrderNumber', 'supplierOrderDate', 'landedUpliftBasisPoints', 'targetProfitMarkupBasisPoints', 'acceptedEffectiveMarkupRangeBasisPoints']) {
    assert.equal(privateKey in catalog.pricingAssumptions, false, privateKey);
  }
  assert.doesNotMatch(catalog.pricingAssumptions.rule, /supplier|cost|markup|uplift/i);
});

test('catalog keeps 14 unique references without exposing order costs', () => {
  assert.equal(catalog.products.length, 14);
  assert.equal(new Set(catalog.products.map((product) => product.code)).size, 14);
  for (const product of catalog.products) {
    assert.equal(product.brandSupplier.brand, 'Ascension Peptides');
    assert.match(product.source.productUrl, /^https:\/\/ascensionpeptides\.com\/product\//);
    assert.match(product.source.priceEvidenceUrl, /^https:\/\/ascensionpeptides\.com\/product\//);
    assert.match(product.image.sourceUrl, /^https:\/\/ascensionpeptides\.com\/wp-content\/uploads\//);
    assert.ok(Number.isInteger(product.stockQuantity) && product.stockQuantity >= 0, product.code);
    assert.equal(typeof product.purchaseEnabled, 'boolean', `${product.code}: canonical purchaseEnabled flag`);
    assert.equal('sourceUsdCents' in product, false, `${product.code}: supplier cost must not ship to browsers`);
    assert.equal('profitMarkupBasisPoints' in product, false, `${product.code}: supplier economics must remain internal`);
    if (product.stockQuantity > 0) assert.equal(product.basePriceCentavos % 5000, 0, product.code);
  }
});

test('every positive-stock purchase-enabled SKU receives the Mereon designation independently of COA state', () => {
  const sellable = catalog.products.filter(isSellable);
  assert.ok(sellable.some((product) => product.status === 'available'), 'coverage includes a sellable SKU with a published source COA');
  assert.ok(sellable.some((product) => product.status === 'coa_pending'), 'coverage includes a sellable SKU with COA pending');
  assert.deepEqual(
    sellable.map((product) => product.code).sort(),
    catalog.products.filter((product) => product.stockQuantity > 0).map((product) => product.code).sort()
  );
});

test('the reviewed order is the only sellable inventory and exposes only approved clean prices', () => {
  const expected = {
    'T-10': [3, 135000], 'BPC-157-10': [1, 135000],
    'KLOW-80': [1, 345000], 'CJCIPA-5-5': [1, 190000],
    'TA1-10': [1, 195000], 'IPAMORELIN-5': [1, 120000],
    'TESA-5': [1, 135000], 'GHKCU-100-10ML': [1, 205000]
  };
  const products = new Map(catalog.products.map((product) => [product.code, product]));
  assert.deepEqual(new Set(catalog.products.filter(isSellable).map((product) => product.code)), new Set(Object.keys(expected)));
  for (const [code, [stock, price]] of Object.entries(expected)) {
    const product = products.get(code);
    assert.equal(product.stockQuantity, stock, code);
    assert.equal(product.basePriceCentavos, price, code);
  }
  assert.equal(products.get('GHKCU-100-10ML').presentation, '100 mg · 10 mL');
  assert.equal(products.has('GHKCU-100-3ML'), false);
});

test('all 14 products have the approved exact research areas and descriptions', () => {
  assert.equal(Object.keys(EXPECTED_RESEARCH_COPY).length, 14);
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


test('shipping configuration exposes exactly the two taxable launch estimates', () => {
  assert.deepEqual(SHIPPING_OPTIONS, [
    { id: 'standard', label: 'Estándar nacional', priceCentavos: 25000 },
    { id: 'express', label: 'Express nacional', priceCentavos: 34900 }
  ]);
});

test('checkout totals treat product and shipping prices as IVA-included final amounts', () => {
  assert.deepEqual(calculateCheckoutTotals([{ unitPriceCentavos: 135000, quantity: 2 }], 25000), {
    productSubtotalCentavos: 270000,
    shippingCentavos: 25000,
    taxableBaseCentavos: 254310,
    ivaCentavos: 40690,
    finalTotalCentavos: 295000
  });
});

test('included IVA rounds to the nearest centavo without floating-point money', () => {
  assert.equal(calculateCheckoutTotals([{ unitPriceCentavos: 1, quantity: 1 }], 2).ivaCentavos, 0);
  assert.equal(calculateCheckoutTotals([{ unitPriceCentavos: 4, quantity: 1 }], 0).ivaCentavos, 1);
});

test('stored carts are merged and clamped to current per-product stock', () => {
  const stock = new Map(catalog.products.map((product) => [product.code, product.stockQuantity]));
  assert.deepEqual(normalizeCart([
    { code: 'unknown', quantity: 2 },
    { code: 'T-10', quantity: '2' },
    { code: 'T-10', quantity: 5 },
    { code: 'BPC-157-10', quantity: 500 },
    { code: 'TB500-5', quantity: 1 }
  ], stock), [
    { code: 'T-10', quantity: 3 },
    { code: 'BPC-157-10', quantity: 1 }
  ]);
});

test('quantity updates enforce stock and remove unavailable products', () => {
  const cart = [{ code: 'BPC-157-10', quantity: 1 }];
  const stock = new Map([['BPC-157-10', 1], ['T-10', 3], ['TB500-5', 0]]);
  assert.deepEqual(updateQuantity(cart, 'BPC-157-10', 2, stock), [{ code: 'BPC-157-10', quantity: 1 }]);
  assert.deepEqual(updateQuantity(cart, 'BPC-157-10', 0, stock), []);
  assert.deepEqual(updateQuantity([], 'T-10', 9, stock), [{ code: 'T-10', quantity: 3 }]);
  assert.deepEqual(updateQuantity([], 'TB500-5', 1, stock), []);
});

test('payment adapter fails closed on API failure and validates the Stripe redirect boundary', async () => {
  assert.equal(paymentAdapter.available, true);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network'); };
  try {
    assert.deepEqual(await paymentAdapter.createOrder({}), { ok: false, code: 'CHECKOUT_FAILED', message: 'No pudimos iniciar el pago. Intenta nuevamente.' });
    globalThis.fetch = async () => new Response(JSON.stringify({ checkoutUrl: 'https://evil.example/cs_live_bad' }), { status: 201, headers: { 'content-type': 'application/json' } });
    assert.deepEqual(await paymentAdapter.createOrder({}), { ok: false, code: 'INVALID_CHECKOUT_URL', message: 'No pudimos iniciar el pago. Intenta nuevamente.' });
    globalThis.fetch = async () => new Response(JSON.stringify({ checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_live_synthetic_123#fidkdWxOYHwnPyd1blppbHNgWjA0' }), { status: 201, headers: { 'content-type': 'application/json' } });
    assert.deepEqual(await paymentAdapter.createOrder({}), { ok: true, checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_live_synthetic_123#fidkdWxOYHwnPyd1blppbHNgWjA0' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
