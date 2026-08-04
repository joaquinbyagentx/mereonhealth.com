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
  assert.equal(CATALOG['T-10'].unitAmount, 135000);
  assert.equal(CATALOG['T-10'].initialStock, 3);
  assert.equal(SHIPPING.standard.unitAmount, 25000);
  assert.equal(SHIPPING.express.unitAmount, 34900);
});

test('one-item and multi-item totals are exact subtotal plus shipping with IVA extracted only', () => {
  assert.deepEqual(calculateCanonicalOrder([{ code: 'T-10', quantity: 1 }], 'standard').totals, {
    subtotal: 135000, shipping: 25000, total: 160000, includedIva: 22069, taxableBase: 137931
  });
  const multi = calculateCanonicalOrder([{ code: 'T-10', quantity: 2 }, { code: 'IPAMORELIN-5', quantity: 1 }], 'express');
  assert.equal(multi.totals.subtotal, 390000);
  assert.equal(multi.totals.total, 424900);
  assert.equal(multi.totals.total, multi.totals.subtotal + multi.totals.shipping);
  assert.equal(multi.totals.includedIva, 58607);
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
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '135000');
  assert.equal(params.get('line_items[1][price_data][unit_amount]'), '25000');
  assert.equal(params.get('metadata[mereon_order_id]'), 'ord_internal');
  assert.equal(params.get('payment_intent_data[statement_descriptor_suffix]'), 'MEREON');
  assert.equal(params.get('success_url'), 'https://mereonhealth.com/checkout-success.html#token=opaque');
  assert.equal(params.get('cancel_url'), 'https://mereonhealth.com/checkout-cancel.html#token=opaque');
  assert.equal([...params.keys()].some((key) => /tax_rate|automatic_tax/.test(key)), false);
});
