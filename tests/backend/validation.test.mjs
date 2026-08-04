import test from 'node:test';
import assert from 'node:assert/strict';

import { validateCheckoutRequest } from '../../worker/src/validation.js';

const valid = {
  currency: 'mxn', shippingId: 'standard',
  lines: [{ code: 'T-10', quantity: 1 }],
  customer: {
    fullName: 'María López', email: 'maria@example.test', phone: '+52 55 1234 5678',
    address1: 'Av. Reforma 123', interior: '4B', colonia: 'Juárez', municipality: 'Cuauhtémoc',
    city: 'Ciudad de México', state: 'CMX', postalCode: '06600', country: 'MX', notes: ''
  },
  ruoAccepted: true
};

test('accepts the minimum Mexico checkout data and normalizes it', () => {
  const result = validateCheckoutRequest(valid);
  assert.equal(result.customer.email, 'maria@example.test');
  assert.equal(result.customer.phone, '+525512345678');
  assert.equal(result.customer.country, 'MX');
});

test('rejects client monetary fields, unsupported shipping, non-MXN, and missing RUO acceptance', () => {
  for (const patch of [
    { total: 1 }, { currency: 'usd' }, { shippingId: 'overnight' }, { ruoAccepted: false }
  ]) assert.throws(() => validateCheckoutRequest({ ...valid, ...patch }), /inválid|acept/i);
});

test('rejects duplicate lines, excessive quantities, malformed email, phone, postal code and non-Mexico country', () => {
  const invalid = [
    { lines: [{ code: 'T-10', quantity: 1 }, { code: 'T-10', quantity: 1 }] },
    { lines: [{ code: 'T-10', quantity: 21 }] },
    { customer: { ...valid.customer, email: '<x>@bad' } },
    { customer: { ...valid.customer, phone: '123' } },
    { customer: { ...valid.customer, postalCode: 'ABC' } },
    { customer: { ...valid.customer, country: 'US' } }
  ];
  for (const patch of invalid) assert.throws(() => validateCheckoutRequest({ ...valid, ...patch }), /inválid|duplicad|México/i);
});
