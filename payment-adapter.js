// Deliberately fail-closed until a verified Mereon backend and payment processor exist.
// This adapter accepts no customer or order payload, performs no network requests,
// and provides a stable boundary for a future credentials-free client integration.
export const paymentAdapter = Object.freeze({
  available: false,
  async createOrder() {
    return Object.freeze({
      ok: false,
      code: 'PAYMENT_UNAVAILABLE',
      message: 'Pedido no enviado. Pago seguro próximamente.'
    });
  }
});
