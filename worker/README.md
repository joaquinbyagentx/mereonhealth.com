# Mereon checkout Worker

This directory contains the Mereon-owned payment API. It is isolated from all ByAgentX Stripe objects and infrastructure.

## Guarantees

- The browser sends only product codes/quantities, a configured shipping ID, and validated fulfillment data. Prices, currency, stock, IVA and email content come from backend-owned code.
- One global Durable Object serializes every stock mutation. D1 check constraints prevent negative counters, and Stripe webhooks finalize or release reservations idempotently.
- Checkout Session creation uses a Stripe idempotency key based on the internal order ID. No card data crosses Mereon.
- Paid order email state is leased and retried by the Durable Object alarm. Webhook retries cannot schedule a second send after `sent`.
- Public status lookup requires a 256-bit token and returns no contact or address.
- Full PII is never logged by application code.

See `docs/checkout-runbook.md` for provisioning, secrets, smoke tests and recovery.
