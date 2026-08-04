import test from 'node:test';
import assert from 'node:assert/strict';

import { signStripePayload, verifyStripeWebhook } from '../../worker/src/security.js';

const secret = 'whsec_test_only_not_a_live_secret';
const payload = '{"id":"evt_test"}';

test('Stripe signatures are verified with a bounded timestamp', async () => {
  const now = 2_000_000_000;
  const signature = await signStripePayload(payload, secret, now);
  assert.equal(await verifyStripeWebhook(payload, `t=${now},v1=${signature}`, secret, now), true);
  assert.equal(await verifyStripeWebhook(payload, `t=${now - 301},v1=${await signStripePayload(payload, secret, now - 301)}`, secret, now), false);
});

test('rejects missing, malformed and forged signatures', async () => {
  assert.equal(await verifyStripeWebhook(payload, '', secret, 2_000_000_000), false);
  assert.equal(await verifyStripeWebhook(payload, 't=abc,v1=nope', secret, 2_000_000_000), false);
  assert.equal(await verifyStripeWebhook(payload + 'x', `t=2000000000,v1=${await signStripePayload(payload, secret, 2_000_000_000)}`, secret, 2_000_000_000), false);
});
