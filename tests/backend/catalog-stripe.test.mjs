import test from 'node:test';
import assert from 'node:assert/strict';

import { CATALOG, SHIPPING, calculateCanonicalOrder } from '../../worker/src/catalog.js';
import { buildStripeCheckoutParams } from '../../worker/src/stripe.js';

const customer = {
  fullName: 'María López', email: 'maria@example.test', phone: '+525512345678',
  address1: 'Av. Reforma 123', interior: '', colonia: 'Juárez', municipality: 'Cuauhtémoc',
  city: 'Ciudad de México', state: 'CMX', postalCode: '06600', country: 'MX', notes: ''
};

test('canonical catalog matches launch stock and prices independently of the browser payload', () => {
  assert.equal(CATALOG['T-10'].unitAmount, 155000);
  assert.equal(CATALOG['T-10'].initialStock, 3);
  assert.equal(CATALOG['SEMAX-10'].unitAmount, 180000);
  assert.equal(CATALOG['SEMAX-10'].initialStock, 3);
  assert.equal(CATALOG['SERMORELIN-5'].unitAmount, 170000);
  assert.equal(CATALOG['SERMORELIN-5'].initialStock, 0);
  assert.notEqual(CATALOG['SERMORELIN-5'].unitAmount, 155000);
  assert.deepEqual(
    {
      GLP2: [CATALOG['GLP2-15'].unitAmount, CATALOG['GLP2-15'].initialStock],
      Ipamorelin10: [CATALOG['IPAMORELIN-10'].unitAmount, CATALOG['IPAMORELIN-10'].initialStock],
      KLOW: [CATALOG['KLOW-80'].unitAmount, CATALOG['KLOW-80'].initialStock]
    },
    { GLP2: [335000, 4], Ipamorelin10: [210000, 4], KLOW: [405000, 2] }
  );
  assert.equal(CATALOG['IPAMORELIN-5'].presentation, '5 mg');
  assert.equal(CATALOG['IPAMORELIN-10'].presentation, '10 mg');
  assert.equal(SHIPPING.standard.unitAmount, 25000);
  assert.equal(SHIPPING.express.unitAmount, 34900);
});

test('one-item and multi-item totals are exact subtotal plus shipping with IVA extracted only', () => {
  assert.deepEqual(calculateCanonicalOrder([{ code: 'T-10', quantity: 1 }], 'standard').totals, {
    subtotal: 155000, shipping: 25000, total: 180000, includedIva: 24828, taxableBase: 155172
  });
  const multi = calculateCanonicalOrder([{ code: 'T-10', quantity: 2 }, { code: 'IPAMORELIN-5', quantity: 1 }], 'express');
  assert.equal(multi.totals.subtotal, 460000);
  assert.equal(multi.totals.total, 494900);
  assert.equal(multi.totals.total, multi.totals.subtotal + multi.totals.shipping);
  assert.equal(multi.totals.includedIva, 68262);
});

test('Stripe payload uses only canonical amounts, Mereon labels, MXN, isolated metadata and no added tax', () => {
  const order = calculateCanonicalOrder([{ code: 'T-10', quantity: 1 }], 'standard');
  const params = buildStripeCheckoutParams({ order, customer, orderId: 'ord_internal', orderNumber: 'MEO-260803-ABCD', publicToken: 'opaque', origin: 'https://mereonhealth.com' });
  assert.equal(params.get('mode'), 'payment');
  assert.equal(params.get('line_items[0][price_data][currency]'), 'mxn');
  assert.equal(params.has('currency'), false, 'Checkout infers currency from canonical line items');
  assert.equal(params.get('customer_email'), customer.email);
  assert.equal(params.get('payment_intent_data[shipping][address][country]'), 'MX');
  assert.equal([...params.keys()].some((key) => key.startsWith('customer_details')), false, 'response-only Stripe fields must not be sent');
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '155000');
  assert.equal(params.get('line_items[1][price_data][unit_amount]'), '25000');
  assert.equal(params.get('metadata[mereon_order_id]'), 'ord_internal');
  assert.equal(params.get('payment_intent_data[statement_descriptor_suffix]'), 'MEREON');
  assert.equal(params.get('success_url'), 'https://mereonhealth.com/checkout-success.html#token=opaque');
  assert.equal(params.get('cancel_url'), 'https://mereonhealth.com/checkout-cancel.html#token=opaque');
  assert.equal([...params.keys()].some((key) => /tax_rate|automatic_tax/.test(key)), false);
});
