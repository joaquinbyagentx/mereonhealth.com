import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryOrderStore } from '../../worker/src/testing/memory-store.js';
import { reconciliationAction, reconciledPaidSession } from '../../worker/src/inventory-coordinator.js';

function request(id, code = 'T-10', quantity = 1) { return { id, lines: [{ code, quantity }], expiresAt: 2000 }; }

test('Stripe reconciliation never releases actionable or processing delayed payments', () => {
  assert.equal(reconciliationAction({ status: 'complete', payment_status: 'unpaid', payment_intent: { status: 'requires_action' } }), 'defer');
  assert.equal(reconciliationAction({ status: 'complete', payment_status: 'unpaid', payment_intent: { status: 'processing' } }), 'defer');
  assert.equal(reconciliationAction({ status: 'expired', payment_status: 'unpaid', payment_intent: { status: 'processing' } }), 'defer');
  assert.equal(reconciliationAction({ status: 'complete', payment_status: 'unpaid', payment_intent: { status: 'requires_payment_method' } }), 'release');
  assert.equal(reconciliationAction({ status: 'expired', payment_status: 'unpaid' }), 'release');
  assert.equal(reconciliationAction({ status: 'complete', payment_status: 'paid', payment_intent: { status: 'succeeded' } }), 'paid');
});

test('succeeded PaymentIntent reconciliation normalizes the synthetic paid event', () => {
  const session = reconciledPaidSession({ id: 'cs_live_test', payment_status: 'unpaid', payment_intent: { id: 'pi_live_test', status: 'succeeded' } });
  assert.equal(session.payment_status, 'paid');
  assert.equal(session.payment_intent, 'pi_live_test');
});

test('concurrent reservations serialize and cannot oversell or create negative availability', async () => {
  const store = new MemoryOrderStore({ 'T-10': 1 });
  const results = await Promise.allSettled([store.reserve(request('a')), store.reserve(request('b'))]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(results.filter((x) => x.status === 'rejected').length, 1);
  assert.deepEqual(store.inventory('T-10'), { onHand: 1, reserved: 1, sold: 0, available: 0 });
});

test('paid event finalizes once and duplicate/out-of-order expiry cannot release sold stock', async () => {
  const store = new MemoryOrderStore({ 'T-10': 2 });
  await store.reserve(request('a'));
  assert.equal((await store.applyEvent('evt_paid', 'a', 'paid')).transition, 'paid');
  assert.equal((await store.applyEvent('evt_paid', 'a', 'paid')).transition, 'duplicate');
  assert.equal((await store.applyEvent('evt_expired_late', 'a', 'expired')).transition, 'ignored');
  assert.deepEqual(store.inventory('T-10'), { onHand: 1, reserved: 0, sold: 1, available: 1 });
});

test('expired and failed reservations release once, including timeout reconciliation', async () => {
  const store = new MemoryOrderStore({ 'T-10': 2 });
  await store.reserve(request('a'));
  assert.equal((await store.applyEvent('evt_exp', 'a', 'expired')).transition, 'released');
  assert.equal((await store.applyEvent('evt_exp_again', 'a', 'expired')).transition, 'ignored');
  await store.reserve({ ...request('b'), expiresAt: 10 });
  assert.deepEqual(await store.releaseExpired(11), ['b']);
  assert.deepEqual(store.inventory('T-10'), { onHand: 2, reserved: 0, sold: 0, available: 2 });
});

test('async success finalizes and email claims are retryable but only one sender owns a claim', async () => {
  const store = new MemoryOrderStore({ 'T-10': 1 });
  await store.reserve(request('a'));
  await store.applyEvent('evt_async', 'a', 'paid');
  assert.equal(await store.claimEmail('a', 100), true);
  assert.equal(await store.claimEmail('a', 101), false);
  await store.failEmail('a', 'retryable', 102);
  assert.equal(await store.claimEmail('a', 500), true);
  await store.completeEmail('a', 'msg_test', 501);
  assert.equal(await store.claimEmail('a', 999), false);
});
