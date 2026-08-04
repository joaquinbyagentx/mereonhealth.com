const API = 'https://api.mereonhealth.com';
const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
const mode = document.body.dataset.orderState;
const title = document.querySelector('[data-state-title]');
const message = document.querySelector('[data-state-message]');
const summary = document.querySelector('[data-order-summary]');
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function validToken(value) { return /^[A-Za-z0-9_-]{40,100}$/.test(value); }
function showError() { title.textContent = 'No pudimos consultar este pedido'; message.textContent = 'El enlace es inválido o venció. Escribe a pedidos@mereonhealth.com si necesitas ayuda.'; }

async function getStatus() {
  const response = await fetch(`${API}/v1/orders/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'omit',
    cache: 'no-store',
    body: JSON.stringify({ token })
  });
  if (!response.ok) throw new Error('status');
  return response.json();
}

function renderPaid(order) {
  title.textContent = 'Pago confirmado';
  message.textContent = `Gracias. Tu pedido ${order.orderNumber} fue pagado y recibimos tus datos de entrega. Enviaremos la confirmación por correo.`;
  summary.innerHTML = `<h2>${escapeHtml(order.orderNumber)}</h2><ul>${order.lines.map((line) => `<li><span>${escapeHtml(line.name)} · ${escapeHtml(line.presentation)} × ${line.quantity}</span><strong>${money.format(line.lineTotal / 100)}</strong></li>`).join('')}</ul><dl><div><dt>Subtotal</dt><dd>${money.format(order.subtotal / 100)}</dd></div><div><dt>Envío</dt><dd>${money.format(order.shipping.amount / 100)}</dd></div><div><dt>Total pagado</dt><dd>${money.format(order.total / 100)}</dd></div><div><dt>IVA incluido (informativo)</dt><dd>${money.format(order.includedIva / 100)}</dd></div></dl>`;
  summary.hidden = false;
  localStorage.removeItem('mereon-research-cart-v1');
}

async function success() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const order = await getStatus();
    if (order.status === 'paid') { renderPaid(order); return; }
    if (['released', 'email_failed'].includes(order.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  title.textContent = 'Pago pendiente de confirmación';
  message.textContent = 'No mostramos el pedido como pagado hasta recibir la confirmación de Stripe. Puedes cerrar esta página; si se confirma, recibirás un correo. No intentes pagar de nuevo de inmediato.';
}

async function cancel() {
  const response = await fetch(`${API}/v1/orders/cancel`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  if (!response.ok) throw new Error('cancel');
  title.textContent = 'Pago cancelado';
  message.textContent = 'No se realizó ningún cargo y liberamos la reservación. Tu carrito sigue disponible para que lo revises.';
}

if (!validToken(token)) showError();
else (mode === 'cancel' ? cancel() : success()).catch(showError);
