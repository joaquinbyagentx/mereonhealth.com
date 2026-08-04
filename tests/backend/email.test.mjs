import test from 'node:test';
import assert from 'node:assert/strict';

import { renderPaidOrderEmail, sendAgentMail } from '../../worker/src/email.js';

const order = {
  orderNumber: 'MEO-260803-ABCD', stripePaymentIntentId: 'pi_test_ref',
  customer: { fullName: '<img src=x onerror=1>', email: 'customer@example.test', phone: '+525512345678', address1: 'Calle <Uno> 2', interior: '', colonia: 'Centro', municipality: 'Cuauhtémoc', city: 'CDMX', state: 'CMX', postalCode: '06000', country: 'MX' },
  lines: [{ name: 'T-10 <script>', presentation: '10 mg', quantity: 1, unitAmount: 135000, lineTotal: 135000 }],
  shipping: { label: 'Estándar nacional', unitAmount: 25000 },
  totals: { subtotal: 135000, shipping: 25000, total: 160000, includedIva: 22069 }
};

test('paid email has complete plain text and escaped HTML without therapeutic claims', () => {
  const email = renderPaidOrderEmail(order);
  assert.match(email.subject, /MEO-260803-ABCD/);
  for (const phrase of ['T-10', '$1,350.00', '$250.00', '$1,600.00', 'IVA incluido', 'Calle <Uno> 2', '+525512345678', 'pi_test_ref', 'pedidos@mereonhealth.com']) assert.match(email.text, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(email.html, /<script>|<img src=x/);
  assert.match(email.html, /&lt;script&gt;|T-10 &lt;script&gt;/);
  assert.match(email.html, /Calle &lt;Uno&gt; 2/);
});

test('AgentMail send uses the verified inbox, deterministic message identity and reply path', async () => {
  let observed;
  const result = await sendAgentMail('synthetic-key', order, async (url, options) => {
    observed = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ message_id: 'msg_synthetic' }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  assert.equal(result, 'msg_synthetic');
  assert.equal(observed.url, 'https://api.agentmail.to/v0/inboxes/pedidos%40mereonhealth.com/messages/send');
  assert.equal(observed.options.headers['Idempotency-Key'], 'mereon-order-MEO-260803-ABCD-paid-confirmation-v1');
  assert.deepEqual(observed.body.to, ['customer@example.test']);
  assert.equal(observed.body.reply_to, 'pedidos@mereonhealth.com');
  assert.equal(observed.body.headers['Message-ID'], '<mereon-MEO-260803-ABCD@mereonhealth.com>');
  assert.equal(observed.body.headers['X-Mereon-Order'], 'MEO-260803-ABCD');
});
