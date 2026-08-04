const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const mxn = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(value / 100);
const addressText = (c) => [c.address1, c.interior && `Int. ${c.interior}`, c.colonia, c.municipality, c.city, c.state, `C.P. ${c.postalCode}`, 'México'].filter(Boolean).join(', ');

export function renderPaidOrderEmail(order) {
  const rows = order.lines.map((line) => `<tr><td style="padding:10px 0;border-bottom:1px solid #dfe7e1"><strong>${esc(line.name)}</strong><br><small>${esc(line.presentation)}</small></td><td style="padding:10px;text-align:center;border-bottom:1px solid #dfe7e1">${line.quantity}</td><td style="padding:10px 0;text-align:right;border-bottom:1px solid #dfe7e1">${esc(mxn(line.lineTotal))}</td></tr>`).join('');
  const plainLines = order.lines.map((line) => `- ${line.name} (${line.presentation}) × ${line.quantity}: ${mxn(line.lineTotal)}`).join('\n');
  const address = addressText(order.customer);
  const subject = `Pago confirmado · Pedido Mereon ${order.orderNumber}`;
  const text = `Hola ${order.customer.fullName},\n\nConfirmamos tu pago del pedido ${order.orderNumber}.\n\n${plainLines}\n\nSubtotal de productos: ${mxn(order.totals.subtotal)}\nEnvío (${order.shipping.label}): ${mxn(order.totals.shipping)}\nTotal cobrado: ${mxn(order.totals.total)}\nIVA incluido en el total (no agregado): ${mxn(order.totals.includedIva)}\n\nEnvío a: ${address}\nContacto: ${order.customer.email} · ${order.customer.phone}\nReferencia de pago: ${order.stripePaymentIntentId}\n\nPrepararemos tu pedido y te contactaremos con la actualización de envío. Exclusivamente para investigación y referencia analítica.\n\n¿Necesitas ayuda? Responde a este correo o escribe a pedidos@mereonhealth.com.\n\nMereon Health`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f3;color:#26362c;font-family:Arial,sans-serif"><div style="max-width:640px;margin:auto;padding:28px"><div style="background:#fff;border-radius:16px;padding:30px"><p style="color:#55705e;letter-spacing:.08em">MEREON HEALTH</p><h1 style="font-size:26px">Pago confirmado</h1><p>Hola ${esc(order.customer.fullName)}, confirmamos tu pedido <strong>${esc(order.orderNumber)}</strong>.</p><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Producto</th><th>Cant.</th><th style="text-align:right">Importe</th></tr></thead><tbody>${rows}</tbody></table><p style="text-align:right">Subtotal: <strong>${esc(mxn(order.totals.subtotal))}</strong><br>Envío (${esc(order.shipping.label)}): <strong>${esc(mxn(order.totals.shipping))}</strong><br><span style="font-size:13px">IVA incluido (no agregado): ${esc(mxn(order.totals.includedIva))}</span></p><p style="font-size:20px;text-align:right">Total cobrado: <strong>${esc(mxn(order.totals.total))}</strong></p><h2 style="font-size:17px">Entrega</h2><p>${esc(address)}</p><p>${esc(order.customer.email)} · ${esc(order.customer.phone)}</p><p>Prepararemos tu pedido y te contactaremos con la actualización de envío. Exclusivamente para investigación y referencia analítica.</p><p style="font-size:13px">Referencia de pago: ${esc(order.stripePaymentIntentId)}</p><p>¿Necesitas ayuda? Responde a este correo o escribe a <a href="mailto:pedidos@mereonhealth.com">pedidos@mereonhealth.com</a>.</p></div></div></body></html>`;
  return { subject, text, html };
}

export async function sendAgentMail(apiKey, order, fetcher = fetch, apiBase = 'https://api.agentmail.to/v0') {
  const email = renderPaidOrderEmail(order);
  const response = await fetcher(`${apiBase}/inboxes/pedidos%40mereonhealth.com/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `mereon-order-${order.orderNumber}-paid-confirmation-v1`
    },
    body: JSON.stringify({ to: [order.customer.email], subject: email.subject, text: email.text, html: email.html, reply_to: 'pedidos@mereonhealth.com', headers: { 'Message-ID': `<mereon-${order.orderNumber}@mereonhealth.com>`, 'X-Mereon-Order': order.orderNumber } })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`AgentMail HTTP ${response.status}`);
  return body.message_id || body.id || 'accepted';
}
