function setAddress(params, prefix, customer) {
  params.set(`${prefix}[name]`, customer.fullName);
  params.set(`${prefix}[phone]`, customer.phone);
  params.set(`${prefix}[address][line1]`, customer.address1);
  params.set(`${prefix}[address][line2]`, [customer.interior && `Int. ${customer.interior}`, `Col. ${customer.colonia}`, customer.municipality].filter(Boolean).join(', '));
  params.set(`${prefix}[address][city]`, customer.city);
  params.set(`${prefix}[address][state]`, customer.state);
  params.set(`${prefix}[address][postal_code]`, customer.postalCode);
  params.set(`${prefix}[address][country]`, 'MX');
}

export function buildStripeCheckoutParams({ order, customer, orderId, orderNumber, publicToken, origin }) {
  const params = new URLSearchParams();
  params.set('mode', 'payment');

  params.set('customer_email', customer.email);
  params.set('client_reference_id', orderId);
  params.set('success_url', `${origin}/checkout-success.html#token=${publicToken}`);
  params.set('cancel_url', `${origin}/checkout-cancel.html#token=${publicToken}`);
  params.set('expires_at', String(Math.floor(Date.now() / 1000) + 1860));
  params.set('metadata[mereon_order_id]', orderId);
  params.set('metadata[mereon_order_number]', orderNumber);
  params.set('metadata[brand]', 'Mereon Health');
  params.set('payment_intent_data[metadata][mereon_order_id]', orderId);
  params.set('payment_intent_data[metadata][mereon_order_number]', orderNumber);
  params.set('payment_intent_data[description]', `Mereon Health ${orderNumber}`);
  params.set('payment_intent_data[statement_descriptor_suffix]', 'MEREON');
  params.set('phone_number_collection[enabled]', 'false');
  params.set('billing_address_collection', 'auto');
  setAddress(params, 'payment_intent_data[shipping]', customer);
  order.lines.forEach((line, index) => {
    params.set(`line_items[${index}][quantity]`, String(line.quantity));
    params.set(`line_items[${index}][price_data][currency]`, 'mxn');
    params.set(`line_items[${index}][price_data][unit_amount]`, String(line.unitAmount));
    params.set(`line_items[${index}][price_data][product_data][name]`, `Mereon Health · ${line.name}`);
    params.set(`line_items[${index}][price_data][product_data][description]`, `${line.presentation} · Exclusivamente para investigación`);
    params.set(`line_items[${index}][price_data][product_data][metadata][mereon_code]`, line.code);
  });
  const index = order.lines.length;
  params.set(`line_items[${index}][quantity]`, '1');
  params.set(`line_items[${index}][price_data][currency]`, 'mxn');
  params.set(`line_items[${index}][price_data][unit_amount]`, String(order.shipping.unitAmount));
  params.set(`line_items[${index}][price_data][product_data][name]`, `Mereon Health · ${order.shipping.label}`);
  return params;
}

export async function createStripeSession(secret, params, fetcher = fetch, idempotencyKey = undefined, apiBase = 'https://api.stripe.com/v1') {
  const headers = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetcher(`${apiBase}/checkout/sessions`, { method: 'POST', headers, body: params });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.id !== 'string' || !/^cs_live_/.test(body.id) || typeof body.url !== 'string') {
    const error = new Error('No fue posible iniciar Stripe Checkout');
    error.stripeStatus = response.status;
    throw error;
  }
  return { id: body.id, url: body.url, expiresAt: body.expires_at };
}
