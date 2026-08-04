import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const api = process.env.MEREON_API || 'http://127.0.0.1:8787';
const providers = process.env.MEREON_PROVIDER_MOCK || 'http://127.0.0.1:8788';
const webhookSecret = process.env.MEREON_WEBHOOK_SECRET || 'whsec_synthetic';
const origin = 'https://mereonhealth.com';
const customer = {
  fullName: 'Verificación Interna Mereon', email: 'partnerships@mereonhealth.com', phone: '+52 55 1234 5678',
  address1: 'Av. Verificación 123', interior: '4B', colonia: 'Centro', municipality: 'Cuauhtémoc',
  city: 'Ciudad de México', state: 'CMX', postalCode: '06000', country: 'MX', notes: 'Prueba local; no enviar'
};

async function jsonFetch(path, init = {}) {
  const response = await fetch(`${api}${path}`, { ...init, headers: { Origin: origin, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } });
  const body = await response.json();
  return { response, body };
}
async function checkout(lines, shippingId = 'standard') {
  return jsonFetch('/v1/checkout', { method: 'POST', body: JSON.stringify({ currency: 'mxn', shippingId, lines, customer, ruoAccepted: true }) });
}
async function cancel(token) {
  return jsonFetch('/v1/orders/cancel', { method: 'POST', body: JSON.stringify({ token }) });
}
async function status(token) {
  return jsonFetch('/v1/orders/status', { method: 'POST', body: JSON.stringify({ token }) });
}
async function sendEvent(event) {
  const raw = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', webhookSecret).update(`${timestamp}.${raw}`).digest('hex');
  const response = await fetch(`${api}/v1/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${timestamp},v1=${signature}` }, body: raw });
  return { response, body: await response.json() };
}
function stripeContext(last) {
  const params = new URLSearchParams(last.body);
  let total = 0;
  for (let i = 0; params.has(`line_items[${i}][quantity]`); i += 1) total += Number(params.get(`line_items[${i}][quantity]`)) * Number(params.get(`line_items[${i}][price_data][unit_amount]`));
  return { params, total, orderId: params.get('metadata[mereon_order_id]'), sessionId: `cs_live_synthetic_${last.created}` };
}

const health = await fetch(`${api}/health`).then((response) => response.json());
assert.equal(health.ok, true);
const preflight = await fetch(`${api}/v1/checkout`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
const unsigned = await fetch(`${api}/v1/stripe/webhook`, { method: 'POST', body: '{}' });
assert.equal(unsigned.status, 400);

const paidCheckout = await checkout([{ code: 'T-10', quantity: 1 }]);
assert.equal(paidCheckout.response.status, 200, JSON.stringify(paidCheckout.body));
const last = await fetch(`${providers}/last-stripe`).then((response) => response.json());
const stripe = stripeContext(last);
assert.equal(stripe.params.get('currency'), null);
assert.equal(stripe.params.get('customer_email'), customer.email);
assert.equal(stripe.total, 180000, 'one-item total is product subtotal plus standard shipping, with no extra IVA');
const paidEvent = { id: 'evt_live_local_paid', type: 'checkout.session.completed', livemode: true, created: Math.floor(Date.now() / 1000), data: { object: { id: stripe.sessionId, client_reference_id: stripe.orderId, metadata: { mereon_order_id: stripe.orderId }, payment_status: 'paid', currency: 'mxn', amount_total: stripe.total, payment_intent: 'pi_live_synthetic' } } };
assert.equal((await sendEvent(paidEvent)).response.status, 200);
assert.equal((await sendEvent(paidEvent)).response.status, 200);
const paidStatus = await status(paidCheckout.body.token);
assert.equal(paidStatus.body.status, 'paid');
assert.equal(paidStatus.body.total, stripe.total);
const emails = await fetch(`${providers}/emails`).then((response) => response.json());
assert.equal(emails.length, 1, 'webhook retry must not duplicate email');
assert.deepEqual(emails[0].to, [customer.email]);
assert.match(emails[0].subject, new RegExp(paidCheckout.body.orderNumber));

const multi = await checkout([{ code: 'BPC-157-10', quantity: 1 }, { code: 'KLOW-80', quantity: 1 }], 'express');
assert.equal(multi.response.status, 200);
const multiStripe = stripeContext(await fetch(`${providers}/last-stripe`).then((response) => response.json()));
assert.equal(multiStripe.total, 514900, 'multi-item total is product subtotal plus express shipping, with no extra IVA');
assert.equal((await cancel(multi.body.token)).response.status, 200);
assert.equal((await status(multi.body.token)).body.status, 'cancelled');

const late = await checkout([{ code: 'TA1-10', quantity: 1 }]);
assert.equal(late.response.status, 200);
const lateStripe = stripeContext(await fetch(`${providers}/last-stripe`).then((response) => response.json()));
assert.equal((await sendEvent({ id: 'evt_live_local_expired_first', type: 'checkout.session.expired', livemode: true, created: Math.floor(Date.now() / 1000), data: { object: { id: lateStripe.sessionId, metadata: { mereon_order_id: lateStripe.orderId } } } })).response.status, 200);
assert.equal((await sendEvent({ id: 'evt_live_local_paid_late', type: 'checkout.session.completed', livemode: true, created: Math.floor(Date.now() / 1000), data: { object: { id: lateStripe.sessionId, metadata: { mereon_order_id: lateStripe.orderId }, payment_status: 'paid', currency: 'mxn', amount_total: lateStripe.total, payment_intent: 'pi_live_late_synthetic' } } })).response.status, 200);
assert.equal((await status(late.body.token)).body.status, 'pending', 'a paid-after-release exception is retained for review and never falsely confirmed');

const race = await Promise.all([checkout([{ code: 'CJCIPA-5-5', quantity: 1 }]), checkout([{ code: 'CJCIPA-5-5', quantity: 1 }])]);
assert.deepEqual(race.map(({ response }) => response.status).sort(), [200, 409], 'only one concurrent scarce-stock reservation succeeds');
const winner = race.find(({ response }) => response.status === 200);
assert.equal((await cancel(winner.body.token)).response.status, 200);
const catalog = await jsonFetch('/v1/catalog');
assert.equal(catalog.body.products.find(({ code }) => code === 'CJCIPA-5-5').available, 1, 'cancel releases the reservation');
assert.equal(catalog.body.products.find(({ code }) => code === 'T-10').available, 2, 'paid order decrements stock exactly once');

console.log(JSON.stringify({ checks: 24, paidOrder: paidCheckout.body.orderNumber, syntheticEmailCount: emails.length, oneItemTotal: stripe.total, multiItemTotal: multiStripe.total, raceStatuses: race.map(({ response }) => response.status).sort() }));
