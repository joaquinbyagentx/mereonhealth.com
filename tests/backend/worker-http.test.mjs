import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../../worker/src/index.js';
import { signStripePayload } from '../../worker/src/security.js';

function envWith(stub) {
  return {
    STRIPE_WEBHOOK_SECRET: 'whsec_test_only',
    STRIPE_SECRET_KEY: 'stripe_test_only',
    AGENTMAIL_API_KEY: 'agentmail_test_only',
    RATE_LIMIT_SALT: 'rate_test_only',
    INVENTORY_COORDINATOR: { idFromName: () => 'id', get: () => stub }
  };
}
const ctx = { waitUntil() {} };

test('health and API fail closed until every encrypted secret is configured', async () => {
  const env = { INVENTORY_COORDINATOR: { idFromName: () => 'id', get: () => ({ fetch: async () => Response.json({}) }) } };
  assert.equal((await worker.fetch(new Request('https://api.mereonhealth.com/health'), env, ctx)).status, 503);
  assert.equal((await worker.fetch(new Request('https://api.mereonhealth.com/v1/catalog', { headers: { Origin: 'https://mereonhealth.com' } }), env, ctx)).status, 503);
});

test('scheduled reconciliation invokes private maintenance on the singleton coordinator', async () => {
  let request;
  const stub = { fetch(value, init) { request = new Request(value, init); return Promise.resolve(new Response('{}')); } };
  let pending;
  await worker.scheduled({}, envWith(stub), { waitUntil(value) { pending = value; } });
  await pending;
  assert.equal(request.method, 'POST');
  assert.equal(new URL(request.url).pathname, '/internal/maintenance');
});

test('strict CORS preflight allows only the Mereon production origin', async () => {
  const stub = { fetch: async () => new Response('{}') };
  const allowed = await worker.fetch(new Request('https://api.mereonhealth.com/v1/checkout', { method: 'OPTIONS', headers: { Origin: 'https://mereonhealth.com', 'Access-Control-Request-Method': 'POST' } }), envWith(stub), ctx);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://mereonhealth.com');
  const denied = await worker.fetch(new Request('https://api.mereonhealth.com/v1/checkout', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), envWith(stub), ctx);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('checkout enforces JSON and request size before forwarding without exposing internals', async () => {
  let calls = 0;
  const stub = { fetch: async () => { calls += 1; return Response.json({ url: 'https://checkout.stripe.com/test' }); } };
  const wrongType = await worker.fetch(new Request('https://api.mereonhealth.com/v1/checkout', { method: 'POST', headers: { Origin: 'https://mereonhealth.com', 'Content-Type': 'text/plain' }, body: 'x' }), envWith(stub), ctx);
  assert.equal(wrongType.status, 415);
  const tooLarge = await worker.fetch(new Request('https://api.mereonhealth.com/v1/checkout', { method: 'POST', headers: { Origin: 'https://mereonhealth.com', 'Content-Type': 'application/json', 'Content-Length': '20000' }, body: '{}' }), envWith(stub), ctx);
  assert.equal(tooLarge.status, 413);
  assert.equal(calls, 0);
});

test('webhook rejects unsigned and non-live events and forwards signed live events once', async () => {
  let calls = 0;
  const stub = { fetch: async () => { calls += 1; return Response.json({ received: true }); } };
  const unsigned = await worker.fetch(new Request('https://api.mereonhealth.com/v1/stripe/webhook', { method: 'POST', body: '{}' }), envWith(stub), ctx);
  assert.equal(unsigned.status, 400);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonliveBody = JSON.stringify({ id: 'evt_test', livemode: false, type: 'checkout.session.expired', data: { object: {} } });
  const nonliveSig = `t=${timestamp},v1=${await signStripePayload(nonliveBody, 'whsec_test_only', timestamp)}`;
  const nonlive = await worker.fetch(new Request('https://api.mereonhealth.com/v1/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': nonliveSig }, body: nonliveBody }), envWith(stub), ctx);
  assert.equal(nonlive.status, 200);
  assert.equal(calls, 0);
  const liveBody = JSON.stringify({ id: 'evt_live', livemode: true, type: 'checkout.session.expired', data: { object: { id: 'cs_live_x' } } });
  const liveSig = `t=${timestamp},v1=${await signStripePayload(liveBody, 'whsec_test_only', timestamp)}`;
  const live = await worker.fetch(new Request('https://api.mereonhealth.com/v1/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': liveSig }, body: liveBody }), envWith(stub), ctx);
  assert.equal(live.status, 200);
  assert.equal(calls, 1);
});

test('unknown routes and public status use generic responses', async () => {
  const stub = { fetch: async () => Response.json({ status: 'paid', orderNumber: 'MEO-1' }) };
  assert.equal((await worker.fetch(new Request('https://api.mereonhealth.com/nope'), envWith(stub), ctx)).status, 404);
  const status = await worker.fetch(new Request('https://api.mereonhealth.com/v1/orders/status', { method: 'POST', headers: { Origin: 'https://mereonhealth.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'a'.repeat(64) }) }), envWith(stub), ctx);
  assert.equal(status.status, 200);
  assert.equal(status.headers.get('access-control-allow-origin'), 'https://mereonhealth.com');
});
