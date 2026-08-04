const API_BASE = 'https://api.mereonhealth.com';
const CHECKOUT_HOST = 'checkout.stripe.com';

async function parseJson(response) {
  try { return await response.json(); } catch { return {}; }
}

export const paymentAdapter = Object.freeze({
  available: true,
  apiBase: API_BASE,

  async getAvailability() {
    try {
      const response = await fetch(`${API_BASE}/v1/catalog`, { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'strict-origin-when-cross-origin' });
      const body = await parseJson(response);
      if (!response.ok || !Array.isArray(body.products)) throw new Error('invalid_catalog');
      return { ok: true, products: body.products };
    } catch {
      return { ok: false, code: 'AVAILABILITY_UNAVAILABLE' };
    }
  },

  async createOrder(payload) {
    try {
      const response = await fetch(`${API_BASE}/v1/checkout`, {
        method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error',
        referrerPolicy: 'strict-origin-when-cross-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const body = await parseJson(response);
      if (!response.ok) return { ok: false, code: body.error || 'CHECKOUT_FAILED', message: 'No pudimos iniciar el pago. Intenta nuevamente.' };
      const url = new URL(body.checkoutUrl);
      const sessionSegment = url.pathname.split('/').find((segment) => /^cs_live_[A-Za-z0-9_]+$/.test(segment));
      if (url.protocol !== 'https:' || url.hostname !== CHECKOUT_HOST || url.port || !sessionSegment) {
        return { ok: false, code: 'INVALID_CHECKOUT_URL', message: 'No pudimos iniciar el pago. Intenta nuevamente.' };
      }
      return { ok: true, checkoutUrl: url.href };
    } catch {
      return { ok: false, code: 'CHECKOUT_FAILED', message: 'No pudimos iniciar el pago. Intenta nuevamente.' };
    }
  }
});
