import { verifyStripeWebhook } from './security.js';

const ALLOWED_ORIGIN = 'https://mereonhealth.com';
const MAX_BODY_BYTES = 16 * 1024;
const MAX_WEBHOOK_BYTES = 256 * 1024;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const EXPOSED_PATHS = new Set(['/v1/catalog', '/v1/checkout', '/v1/orders/status', '/v1/orders/cancel']);
const configured = (env) => ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'AGENTMAIL_API_KEY', 'RATE_LIMIT_SALT'].every((name) => typeof env[name] === 'string' && env[name].length >= 8);

function json(body, status = 200, cors = false) {
  const headers = new Headers(JSON_HEADERS);
  if (cors) {
    headers.set('access-control-allow-origin', ALLOWED_ORIGIN);
    headers.set('vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function genericError(status, code, cors = false) {
  return json({ error: code }, status, cors);
}

function hasAllowedOrigin(request) {
  return request.headers.get('origin') === ALLOWED_ORIGIN;
}

function coordinator(env) {
  const id = env.INVENTORY_COORDINATOR.idFromName('mereon-production');
  return env.INVENTORY_COORDINATOR.get(id);
}

async function readBoundedBody(request, maximum = MAX_BODY_BYTES) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maximum) throw Object.assign(new Error('too_large'), { status: 413 });
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > maximum) throw Object.assign(new Error('too_large'), { status: 413 });
  return new Uint8Array(buffer);
}

async function forward(request, env, internalPath, body) {
  const headers = new Headers({ 'content-type': request.headers.get('content-type') || 'application/json' });
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) headers.set('x-mereon-client-ip', ip);
  return coordinator(env).fetch(new Request(`https://coordinator${internalPath}`, {
    method: request.method,
    headers,
    body: body && request.method !== 'GET' ? body : undefined
  }));
}

async function publicRoute(request, env, url) {
  const cors = true;
  if (!hasAllowedOrigin(request)) return genericError(403, 'origin_not_allowed');

  if (request.method === 'POST') {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return genericError(415, 'json_required', cors);
    }
  }

  let body;
  try {
    body = request.method === 'POST' ? await readBoundedBody(request) : undefined;
  } catch (error) {
    return genericError(error.status || 400, 'request_too_large', cors);
  }

  const internalPath = url.pathname;
  if (url.pathname === '/v1/orders/status') {
    let statusBody;
    try { statusBody = JSON.parse(new TextDecoder().decode(body)); }
    catch { return genericError(400, 'invalid_request', cors); }
    if (typeof statusBody?.token !== 'string' || statusBody.token.length !== 64) return genericError(400, 'invalid_request', cors);
  }

  try {
    const result = await forward(request, env, internalPath, body);
    const responseBody = await result.text();
    const headers = new Headers(JSON_HEADERS);
    headers.set('access-control-allow-origin', ALLOWED_ORIGIN);
    headers.set('vary', 'Origin');
    if (result.headers.get('retry-after')) headers.set('retry-after', result.headers.get('retry-after'));
    return new Response(responseBody, { status: result.status, headers });
  } catch {
    return genericError(503, 'service_unavailable', cors);
  }
}

async function webhook(request, env) {
  if (request.method !== 'POST') return genericError(405, 'method_not_allowed');
  let bodyBytes;
  try {
    bodyBytes = await readBoundedBody(request, MAX_WEBHOOK_BYTES);
  } catch {
    return genericError(413, 'request_too_large');
  }
  const raw = new TextDecoder().decode(bodyBytes);
  const valid = await verifyStripeWebhook(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return genericError(400, 'invalid_signature');
  let event;
  try { event = JSON.parse(raw); } catch { return genericError(400, 'invalid_payload'); }
  if (!event || typeof event.id !== 'string' || event.livemode !== true) return json({ received: true, ignored: true });
  try {
    const result = await coordinator(env).fetch(new Request('https://coordinator/internal/stripe-event', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: raw
    }));
    if (!result.ok) return genericError(500, 'webhook_processing_failed');
    return json({ received: true });
  } catch {
    return genericError(500, 'webhook_processing_failed');
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && EXPOSED_PATHS.has(url.pathname)) {
      if (!hasAllowedOrigin(request)) return genericError(403, 'origin_not_allowed');
      const requestedMethod = request.headers.get('access-control-request-method');
      const expectedMethod = url.pathname === '/v1/catalog' ? 'GET' : 'POST';
      if (requestedMethod !== expectedMethod) return genericError(405, 'method_not_allowed', true);
      const headers = new Headers({
        'access-control-allow-origin': ALLOWED_ORIGIN,
        'access-control-allow-methods': requestedMethod,
        'access-control-allow-headers': 'Content-Type',
        'access-control-max-age': '600',
        'vary': 'Origin',
        'cache-control': 'no-store'
      });
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      const ready = configured(env);
      return json({ ok: ready, service: 'mereon-checkout' }, ready ? 200 : 503);
    }
    if (!configured(env)) return genericError(503, 'service_unavailable');
    if (url.pathname === '/v1/stripe/webhook') return webhook(request, env);
    if (EXPOSED_PATHS.has(url.pathname)) {
      const expected = url.pathname === '/v1/catalog' ? 'GET' : 'POST';
      if (request.method !== expected) return genericError(405, 'method_not_allowed', hasAllowedOrigin(request));
      return publicRoute(request, env, url);
    }
    return genericError(404, 'not_found');
  },

  async scheduled(_controller, env, ctx) {
    if (!configured(env)) return;
    const stub = coordinator(env);
    ctx.waitUntil(stub.fetch('https://internal/internal/maintenance', { method: 'POST' }));
  }
};

export { InventoryCoordinator } from './inventory-coordinator.js';
