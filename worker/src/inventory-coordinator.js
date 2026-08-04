import { validateCheckoutRequest } from './validation.js';
import { CATALOG, calculateCanonicalOrder } from './catalog.js';
import { buildStripeCheckoutParams, createStripeSession } from './stripe.js';
import { sendAgentMail } from './email.js';

const enc = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { 'cache-control': 'no-store', ...headers } });

async function sha256(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function orderNumber(epoch) {
  const date = new Date(epoch * 1000).toISOString().slice(2, 10).replaceAll('-', '');
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `MEO-${date}-${[...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')}`;
}
function safeJson(text) { try { return JSON.parse(text); } catch { return null; } }

export function reconciliationAction(session) {
  const paymentIntentStatus = typeof session?.payment_intent === 'object' ? session.payment_intent.status : null;
  if (session?.payment_status === 'paid' || paymentIntentStatus === 'succeeded') return 'paid';
  if (['processing', 'requires_action', 'requires_confirmation'].includes(paymentIntentStatus)) return 'defer';
  if (session?.status === 'expired' || ['canceled', 'requires_payment_method'].includes(paymentIntentStatus)) return 'release';
  return 'defer';
}

export function reconciledPaidSession(session) {
  return {
    ...session,
    payment_status: 'paid',
    payment_intent: typeof session.payment_intent === 'object' ? session.payment_intent.id : session.payment_intent
  };
}

export class InventoryCoordinator {
  constructor(state, env) { this.state = state; this.env = env; this.db = env.DB; this.queue = Promise.resolve(); this.lastRateCleanup = 0; }

  async fetch(request) {
    return this.exclusive(() => this.route(request));
  }

  async exclusive(operation) {
    const previous = this.queue;
    let release;
    this.queue = new Promise((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }

  async route(request) {
    const url = new URL(request.url);
    try {
      const ip = request.headers.get('x-mereon-client-ip');
      if (url.pathname === '/v1/checkout' && request.method === 'POST') {
        await this.rateLimit(ip, 'checkout', 10);
        return this.checkout(request);
      }
      if (url.pathname === '/v1/orders/status' && request.method === 'POST') {
        await this.rateLimit(ip, 'status', 120);
        const body = await request.json().catch(() => null);
        return this.status(body?.token);
      }
      if (url.pathname === '/v1/orders/cancel' && request.method === 'POST') {
        await this.rateLimit(ip, 'cancel', 20);
        return this.cancel(request);
      }
      if (url.pathname === '/v1/catalog' && request.method === 'GET') {
        await this.rateLimit(ip, 'catalog', 120);
        return this.catalog();
      }
      if (url.pathname === '/internal/stripe-event' && request.method === 'POST') return this.stripeEvent(await request.json());
      if (url.pathname === '/internal/maintenance' && request.method === 'POST') {
        await this.processAlarm();
        return json({ ok: true });
      }
      return json({ error: 'not_found' }, 404);
    } catch (error) {
      const status = Number(error?.status) || 500;
      if (status >= 500) return json({ error: 'service_unavailable' }, status);
      return json({ error: error?.code || 'invalid_request' }, status);
    }
  }

  async rateLimit(ip, bucket, limit) {
    const epoch = now();
    if (epoch - this.lastRateCleanup >= 3600) {
      await this.db.prepare('DELETE FROM rate_limits WHERE window_started_at < ?').bind(epoch - 86400).run();
      this.lastRateCleanup = epoch;
    }
    const key = await sha256(`${this.env.RATE_LIMIT_SALT || 'mereon'}:${bucket}:${ip || 'unknown'}`);
    const row = await this.db.prepare('SELECT window_started_at, count FROM rate_limits WHERE key_hash = ?').bind(key).first();
    if (!row || epoch - row.window_started_at >= 600) {
      await this.db.prepare('INSERT INTO rate_limits(key_hash, window_started_at, count) VALUES(?, ?, 1) ON CONFLICT(key_hash) DO UPDATE SET window_started_at=excluded.window_started_at, count=1').bind(key, epoch).run();
      return;
    }
    if (row.count >= limit) throw Object.assign(new Error('rate_limited'), { status: 429, code: 'rate_limited' });
    await this.db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key_hash = ?').bind(key).run();
  }

  async checkout(request) {
    const raw = await request.json().catch(() => null);
    let parsed;
    try { parsed = validateCheckoutRequest(raw); }
    catch { return json({ error: 'invalid_request' }, 400); }
    let canonical;
    try { canonical = calculateCanonicalOrder(parsed.lines, parsed.shippingId); }
    catch { return json({ error: 'invalid_cart' }, 400); }

    const inventory = await this.db.prepare(`SELECT code, on_hand, reserved FROM inventory WHERE code IN (${canonical.lines.map(() => '?').join(',')})`).bind(...canonical.lines.map((line) => line.code)).all();
    const rows = new Map((inventory.results || []).map((row) => [row.code, row]));
    if (canonical.lines.some((line) => !rows.has(line.code) || rows.get(line.code).on_hand - rows.get(line.code).reserved < line.quantity)) {
      return json({ error: 'insufficient_stock' }, 409);
    }

    const epoch = now();
    const id = `ord_${crypto.randomUUID().replaceAll('-', '')}`;
    const number = orderNumber(epoch);
    const publicToken = token();
    const tokenHash = await sha256(publicToken);
    // Hold the reservation one minute beyond Stripe's 31-minute Session
    // expiry so a payment at the boundary cannot race local release.
    const expires = epoch + 1920;
    const customer = parsed.customer;
    const statements = [
      this.db.prepare(`INSERT INTO orders(id, order_number, public_token_hash, status, currency, lines_json, subtotal, shipping_id, shipping_label, shipping_amount, total, included_iva, customer_json, ruo_accepted_at, reservation_expires_at, reserved_at, created_at, updated_at) VALUES(?, ?, ?, 'reserved', 'mxn', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, number, tokenHash, JSON.stringify(canonical.lines), canonical.totals.subtotal, canonical.shipping.id, canonical.shipping.label, canonical.totals.shipping, canonical.totals.total, canonical.totals.includedIva, JSON.stringify(customer), epoch, expires, epoch, epoch, epoch)
    ];
    for (const line of canonical.lines) {
      statements.push(this.db.prepare('UPDATE inventory SET reserved = reserved + ?, updated_at = ? WHERE code = ? AND on_hand - reserved >= ?').bind(line.quantity, epoch, line.code, line.quantity));
      statements.push(this.db.prepare('INSERT INTO order_reservations(order_id, code, quantity) VALUES(?, ?, ?)').bind(id, line.code, line.quantity));
    }
    await this.db.batch(statements);

    const params = buildStripeCheckoutParams({ order: canonical, customer, orderId: id, orderNumber: number, publicToken, origin: 'https://mereonhealth.com' });
    let session;
    let lastError;
    for (let attempt = 0; attempt < 3 && !session; attempt += 1) {
      try {
        session = await createStripeSession(this.env.STRIPE_SECRET_KEY, params, fetch, `mereon-checkout-${id}`, this.env.STRIPE_API_BASE);
      } catch (error) {
        lastError = error;
        const definiteRejection = error.stripeStatus >= 400 && error.stripeStatus < 500 && error.stripeStatus !== 429;
        if (definiteRejection) break;
      }
    }
    if (!session) {
      const definiteRejection = lastError?.stripeStatus >= 400 && lastError.stripeStatus < 500 && lastError.stripeStatus !== 429;
      if (definiteRejection) {
        await this.releaseOrder(id, 'creation_failed');
      } else {
        // A timeout/5xx can mean Stripe created a Session. Retain the
        // reservation for Stripe's full webhook retry horizon; a scheduled
        // reconciliation is the fail-closed path for an untracked Session.
        const reconcileAt = now() + 604800;
        await this.db.prepare("UPDATE orders SET status='awaiting_payment', reservation_expires_at=?, updated_at=? WHERE id=? AND status='reserved'").bind(reconcileAt, now(), id).run();
        await this.scheduleAlarm(reconcileAt);
      }
      return json({ error: 'checkout_unavailable' }, 503);
    }
    await this.db.prepare("UPDATE orders SET stripe_session_id=?, reservation_expires_at=?, status='awaiting_payment', updated_at=? WHERE id=? AND status='reserved'").bind(session.id, session.expiresAt || expires, now(), id).run();
    await this.scheduleAlarm(session.expiresAt || expires);
    return json({ checkoutUrl: session.url, orderNumber: number, token: publicToken });
  }

  async releaseOrder(id, outcome = 'released') {
    const order = await this.db.prepare('SELECT status FROM orders WHERE id=?').bind(id).first();
    if (!order || !['reserved', 'awaiting_payment'].includes(order.status)) return false;
    const reservations = await this.db.prepare('SELECT code, quantity FROM order_reservations WHERE order_id=?').bind(id).all();
    const epoch = now();
    const statements = (reservations.results || []).map((line) => this.db.prepare('UPDATE inventory SET reserved=reserved-?, updated_at=? WHERE code=? AND reserved>=?').bind(line.quantity, epoch, line.code, line.quantity));
    statements.push(this.db.prepare("UPDATE orders SET status=?, released_at=?, updated_at=? WHERE id=? AND status IN ('reserved','awaiting_payment')").bind(outcome, epoch, epoch, id));
    await this.db.batch(statements);
    return true;
  }

  async status(publicToken) {
    if (typeof publicToken !== 'string' || publicToken.length !== 64) return json({ error: 'invalid_request' }, 400);
    const hash = await sha256(publicToken);
    const row = await this.db.prepare('SELECT order_number, status, lines_json, subtotal, shipping_label, shipping_amount, total, included_iva FROM orders WHERE public_token_hash=?').bind(hash).first();
    if (!row) return json({ error: 'not_found' }, 404);
    const status = row.status === 'paid' ? 'paid' : ['released', 'cancelled'].includes(row.status) ? 'cancelled' : 'pending';
    return json({ orderNumber: row.order_number, status, currency: 'MXN', lines: safeJson(row.lines_json)?.map(({ name, presentation, quantity, lineTotal }) => ({ name, presentation, quantity, lineTotal })) || [], subtotal: row.subtotal, shipping: { label: row.shipping_label, amount: row.shipping_amount }, total: row.total, includedIva: row.included_iva });
  }

  async cancel(request) {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.token !== 'string' || body.token.length !== 64) return json({ error: 'invalid_request' }, 400);
    const hash = await sha256(body.token);
    const order = await this.db.prepare('SELECT id, status, stripe_session_id FROM orders WHERE public_token_hash=?').bind(hash).first();
    if (!order) return json({ error: 'not_found' }, 404);
    if (['released', 'cancelled'].includes(order.status)) return json({ cancelled: true });
    if (order.status === 'paid') return json({ error: 'already_paid' }, 409);
    if (order.stripe_session_id) {
      const apiBase = this.env.STRIPE_API_BASE || 'https://api.stripe.com/v1';
      const response = await fetch(`${apiBase}/checkout/sessions/${encodeURIComponent(order.stripe_session_id)}/expire`, { method: 'POST', headers: { Authorization: `Bearer ${this.env.STRIPE_SECRET_KEY}`, 'Stripe-Version': '2024-06-20' } });
      if (!response.ok) return json({ error: 'cancellation_pending' }, 409);
    }
    await this.releaseOrder(order.id, 'cancelled');
    return json({ cancelled: true });
  }

  async catalog() {
    const rows = await this.db.prepare('SELECT code, on_hand - reserved AS available FROM inventory').all();
    const available = Object.fromEntries((rows.results || []).map((row) => [row.code, Math.max(0, row.available)]));
    return json({ currency: 'MXN', products: Object.values(CATALOG).map(({ code, name, presentation, unitAmount }) => ({ code, name, presentation, unitAmount, available: available[code] ?? 0 })) });
  }

  async stripeEvent(event) {
    if (!event || typeof event.id !== 'string' || event.livemode !== true || !event.data?.object) return json({ received: true });
    const existing = await this.db.prepare('SELECT order_id,outcome FROM stripe_events WHERE event_id=?').bind(event.id).first();
    if (existing) {
      if (existing.outcome === 'paid' && existing.order_id) await this.sendConfirmation(existing.order_id);
      return json({ received: true, duplicate: true });
    }
    const session = event.data.object;
    const id = session.metadata?.mereon_order_id || session.client_reference_id;
    const order = typeof id === 'string' ? await this.db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first() : null;
    if (!order || (order.stripe_session_id && session.id !== order.stripe_session_id)) {
      await this.recordEvent(event, id, 'ignored'); return json({ received: true });
    }

    if (event.type === 'checkout.session.completed' && session.payment_status !== 'paid') {
      await this.db.batch([
        this.db.prepare("UPDATE orders SET status='awaiting_payment', reservation_expires_at=?, updated_at=? WHERE id=? AND status IN ('reserved','awaiting_payment')").bind(now() + 604800, now(), id),
        this.eventStatement(event, id, 'awaiting_payment')
      ]);
      // Covers delayed methods such as OXXO without releasing stock before
      // Stripe can emit async_payment_succeeded (OXXO vouchers expire sooner).
      await this.scheduleAlarm(now() + 604800);
      return json({ received: true });
    }
    const isPaid = (event.type === 'checkout.session.completed' && session.payment_status === 'paid') || event.type === 'checkout.session.async_payment_succeeded';
    if (isPaid) {
      if (session.currency !== 'mxn' || session.amount_total !== order.total) {
        await this.recordEvent(event, id, 'ignored'); return json({ received: true });
      }
      if (['released', 'cancelled', 'creation_failed'].includes(order.status)) {
        const epoch = now();
        await this.db.batch([
          this.db.prepare("UPDATE orders SET status='paid_review', stripe_payment_intent_id=?, paid_at=?, updated_at=? WHERE id=? AND status IN ('released','cancelled','creation_failed')").bind(session.payment_intent || null, epoch, epoch, id),
          this.eventStatement(event, id, 'paid_after_release')
        ]);
        return json({ received: true });
      }
      if (!['reserved', 'awaiting_payment'].includes(order.status)) {
        await this.recordEvent(event, id, 'ignored'); return json({ received: true });
      }
      const reservations = await this.db.prepare('SELECT code, quantity FROM order_reservations WHERE order_id=?').bind(id).all();
      const epoch = now();
      const statements = (reservations.results || []).map((line) => this.db.prepare('UPDATE inventory SET reserved=reserved-?, on_hand=on_hand-?, sold=sold+?, updated_at=? WHERE code=? AND reserved>=? AND on_hand>=?').bind(line.quantity, line.quantity, line.quantity, epoch, line.code, line.quantity, line.quantity));
      statements.push(this.db.prepare("UPDATE orders SET status='paid', stripe_payment_intent_id=?, paid_at=?, updated_at=? WHERE id=? AND status IN ('reserved','awaiting_payment')").bind(session.payment_intent || null, epoch, epoch, id));
      statements.push(this.eventStatement(event, id, 'paid'));
      await this.db.batch(statements);
      await this.sendConfirmation(id);
      return json({ received: true });
    }
    if (['checkout.session.expired', 'checkout.session.async_payment_failed'].includes(event.type)) {
      await this.releaseOrder(id, 'released');
      await this.recordEvent(event, id, 'released');
      return json({ received: true });
    }
    await this.recordEvent(event, id, 'ignored');
    return json({ received: true });
  }

  eventStatement(event, orderId, outcome) {
    return this.db.prepare('INSERT INTO stripe_events(event_id,event_type,stripe_created_at,order_id,outcome,received_at) VALUES(?,?,?,?,?,?)').bind(event.id, event.type, event.created || null, orderId || null, outcome, now());
  }
  async recordEvent(event, orderId, outcome) { await this.eventStatement(event, orderId, outcome).run(); }

  async sendConfirmation(id) {
    const epoch = now();
    const claim = await this.db.prepare("UPDATE orders SET email_status='sending', email_claimed_at=?, email_attempts=email_attempts+1, updated_at=? WHERE id=? AND status='paid' AND email_status IN ('pending','failed')").bind(epoch, epoch, id).run();
    if (!claim.meta?.changes) return;
    await this.scheduleAlarm(epoch + 600);
    const row = await this.db.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
    const order = {
      orderNumber: row.order_number, lines: safeJson(row.lines_json), customer: safeJson(row.customer_json),
      shipping: { id: row.shipping_id, label: row.shipping_label, unitAmount: row.shipping_amount },
      totals: { subtotal: row.subtotal, shipping: row.shipping_amount, total: row.total, includedIva: row.included_iva },
      stripePaymentIntentId: row.stripe_payment_intent_id
    };
    try {
      const messageId = await sendAgentMail(this.env.AGENTMAIL_API_KEY, order, fetch, this.env.AGENTMAIL_API_BASE);
      await this.db.prepare("UPDATE orders SET email_status='sent', email_message_id=?, email_last_error=NULL, email_next_attempt_at=NULL, updated_at=? WHERE id=? AND email_status='sending'").bind(messageId, now(), id).run();
    } catch (error) {
      const delay = Math.min(3600, 60 * (2 ** Math.min(row.email_attempts || 0, 5)));
      const next = now() + delay;
      await this.db.prepare("UPDATE orders SET email_status='failed', email_last_error='provider_error', email_next_attempt_at=?, updated_at=? WHERE id=? AND email_status='sending'").bind(next, now(), id).run();
      await this.scheduleAlarm(next);
    }
  }

  async scheduleAlarm(epoch) {
    const existing = await this.state.storage.getAlarm();
    const target = epoch * 1000;
    if (existing === null || target < existing) await this.state.storage.setAlarm(target);
  }

  async alarm() { return this.exclusive(() => this.processAlarm()); }

  async processAlarm() {
    const epoch = now();
    await this.db.prepare('DELETE FROM rate_limits WHERE window_started_at < ?').bind(epoch - 86400).run();
    await this.db.prepare("UPDATE orders SET email_status='failed', email_last_error='delivery_unknown', email_next_attempt_at=?, updated_at=? WHERE status='paid' AND email_status='sending' AND email_claimed_at<=?").bind(epoch, epoch, epoch - 600).run();
    const expired = await this.db.prepare("SELECT id,stripe_session_id FROM orders WHERE status IN ('reserved','awaiting_payment') AND reservation_expires_at<=? LIMIT 100").bind(epoch).all();
    for (const order of expired.results || []) {
      if (!order.stripe_session_id) {
        await this.releaseOrder(order.id, 'released');
        continue;
      }
      try {
        const response = await fetch(`${this.env.STRIPE_API_BASE || 'https://api.stripe.com/v1'}/checkout/sessions/${encodeURIComponent(order.stripe_session_id)}?expand%5B%5D=payment_intent`, {
          headers: { Authorization: `Bearer ${this.env.STRIPE_SECRET_KEY}`, 'Stripe-Version': '2024-06-20' }
        });
        const session = await response.json().catch(() => ({}));
        if (!response.ok || session.id !== order.stripe_session_id) throw new Error('stripe_reconciliation_failed');
        const action = reconciliationAction(session);
        if (action === 'paid') {
          await this.stripeEvent({ id: `reconcile_${session.id}_paid`, type: 'checkout.session.completed', livemode: true, created: epoch, data: { object: reconciledPaidSession(session) } });
        } else if (action === 'release') {
          await this.releaseOrder(order.id, 'released');
        } else {
          await this.deferReconciliation(order.id, epoch);
        }
      } catch {
        await this.deferReconciliation(order.id, epoch);
      }
    }
    const retries = await this.db.prepare("SELECT id FROM orders WHERE status='paid' AND (email_status='pending' OR (email_status='failed' AND email_next_attempt_at<=?)) LIMIT 20").bind(epoch).all();
    for (const order of retries.results || []) await this.sendConfirmation(order.id);
    const nextOrder = await this.db.prepare("SELECT MIN(reservation_expires_at) AS at FROM orders WHERE status IN ('reserved','awaiting_payment')").first();
    const nextEmail = await this.db.prepare("SELECT MIN(email_next_attempt_at) AS at FROM orders WHERE status='paid' AND email_status='failed'").first();
    const next = [nextOrder?.at, nextEmail?.at].filter(Number.isFinite).sort((a, b) => a - b)[0];
    if (next) await this.state.storage.setAlarm(next * 1000);
  }

  async deferReconciliation(id, epoch) {
    const next = epoch + 300;
    await this.db.prepare("UPDATE orders SET reservation_expires_at=?, updated_at=? WHERE id=? AND status IN ('reserved','awaiting_payment')").bind(next, epoch, id).run();
    await this.scheduleAlarm(next);
  }
}
