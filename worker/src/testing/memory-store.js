export class MemoryOrderStore {
  #inventory; #orders = new Map(); #events = new Set(); #lock = Promise.resolve();
  constructor(stock) { this.#inventory = new Map(Object.entries(stock).map(([code, onHand]) => [code, { onHand, reserved: 0, sold: 0 }])); }
  #serial(fn) { const next = this.#lock.then(fn, fn); this.#lock = next.catch(() => {}); return next; }
  inventory(code) { const row = this.#inventory.get(code); return { ...row, available: row.onHand - row.reserved }; }
  reserve(request) { return this.#serial(() => {
    for (const line of request.lines) { const row = this.#inventory.get(line.code); if (!row || row.onHand - row.reserved < line.quantity) throw new Error('Sin existencias'); }
    for (const line of request.lines) this.#inventory.get(line.code).reserved += line.quantity;
    this.#orders.set(request.id, { ...request, status: 'reserved', emailStatus: 'pending', emailClaimedAt: null });
    return request;
  }); }
  applyEvent(eventId, orderId, action) { return this.#serial(() => {
    if (this.#events.has(eventId)) return { transition: 'duplicate' };
    this.#events.add(eventId);
    const order = this.#orders.get(orderId);
    if (!order) return { transition: 'ignored' };
    if (action === 'paid' && order.status === 'reserved') {
      for (const line of order.lines) { const row = this.#inventory.get(line.code); row.reserved -= line.quantity; row.onHand -= line.quantity; row.sold += line.quantity; }
      order.status = 'paid'; return { transition: 'paid' };
    }
    if (['expired', 'failed'].includes(action) && order.status === 'reserved') {
      for (const line of order.lines) this.#inventory.get(line.code).reserved -= line.quantity;
      order.status = 'released'; return { transition: 'released' };
    }
    return { transition: 'ignored' };
  }); }
  releaseExpired(now) { return this.#serial(() => {
    const released = [];
    for (const order of this.#orders.values()) if (order.status === 'reserved' && order.expiresAt <= now) {
      for (const line of order.lines) this.#inventory.get(line.code).reserved -= line.quantity;
      order.status = 'released'; released.push(order.id);
    }
    return released;
  }); }
  claimEmail(id, now) { return this.#serial(() => { const o = this.#orders.get(id); if (!o || o.status !== 'paid' || o.emailStatus === 'sent' || (o.emailStatus === 'sending' && now - o.emailClaimedAt < 300)) return false; o.emailStatus = 'sending'; o.emailClaimedAt = now; return true; }); }
  failEmail(id, error, now) { return this.#serial(() => { const o = this.#orders.get(id); o.emailStatus = 'failed'; o.emailError = error; o.emailClaimedAt = now; }); }
  completeEmail(id, messageId, now) { return this.#serial(() => { const o = this.#orders.get(id); o.emailStatus = 'sent'; o.emailMessageId = messageId; o.emailSentAt = now; }); }
}
