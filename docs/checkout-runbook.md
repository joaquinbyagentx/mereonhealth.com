# Mereon checkout deployment and operations

## Scope and isolation

This deploys only `mereon-checkout-api`, D1 `mereon-checkout-production`, the `api.mereonhealth.com` custom domain, and a new Mereon-only Stripe webhook. Never edit the existing ByAgentX endpoint, webhook, products, branding, statement descriptor, or account settings. Checkout Sessions use Mereon metadata, an internal order ID, an order number, description, and the permitted `MEREON` payment descriptor suffix.

No command in this runbook creates a charge. Prices already include IVA; the charge is canonical product subtotal plus configured shipping and the IVA field is only `total × 16 / 116` rounded in integer centavos.

## Prerequisites and secret custody

Authenticate Wrangler to the Cloudflare account that owns `mereonhealth.com` (`wrangler login` or a narrowly scoped API token). Canonical inputs:

- Stripe live secret: 1Password `shared/stripe/secret-live`
- AgentMail org key: 1Password `shared/agentmail/org-key`
- Cloudflare API access: 1Password `shared/cloudflare/api` or `shared/cloudflare/global-api-key`

Never place values in `.dev.vars`, `.env`, shell history, Git, tickets, logs, or this document. Save the new Mereon webhook signing secret in a dedicated 1Password item such as `shared/stripe/mereon-webhook-secret-live`, then put it in the Worker only with `wrangler secret put`.

Before production, verify the active Stripe account ID is exactly `acct_1TChi9CR3pnIAx9A`, charges and payouts are enabled, and currency is MXN. Stop if it differs.

## Provision once

1. Create D1:

   ```bash
   npx wrangler d1 create mereon-checkout-production
   ```

   Replace only `REPLACE_AFTER_PROVISIONING` in `wrangler.jsonc` with the returned database ID.

2. Apply schema and exact launch inventory:

   ```bash
   npm run worker:migrate:remote
   ```

3. Add Worker encrypted secrets, supplying each value from its canonical 1Password item without displaying it:

   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   npx wrangler secret put AGENTMAIL_API_KEY
   npx wrangler secret put RATE_LIMIT_SALT
   ```

   `RATE_LIMIT_SALT` must be a new random secret. Do not set `STRIPE_API_BASE` or `AGENTMAIL_API_BASE` in production; those names exist only for isolated local provider mocks.

4. Deploy:

   ```bash
   npm test
   npm run test:backend
   npm run test:browser
   npx wrangler deploy
   ```

   The custom-domain route in `wrangler.jsonc` creates/owns `api.mereonhealth.com`; verify it does not replace another DNS target.

5. In Stripe, create a **new** webhook endpoint at `https://api.mereonhealth.com/v1/stripe/webhook`, listening only for:

   - `checkout.session.completed`
   - `checkout.session.expired`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`

   Save its signing secret to the dedicated 1Password item and update only this Worker's `STRIPE_WEBHOOK_SECRET`. Do not reuse or edit webhook `we_1TiNzuCR3pnIAx9Af4kkRMl2`.

## Safe verification (no charge)

```bash
curl -fsS https://api.mereonhealth.com/health
curl -i -X OPTIONS https://api.mereonhealth.com/v1/checkout \
  -H 'Origin: https://mereonhealth.com' \
  -H 'Access-Control-Request-Method: POST'
curl -i -X POST https://api.mereonhealth.com/v1/stripe/webhook -d '{}'
```

Expected: health 200, preflight 204 with the single allowed origin, and unsigned webhook 400. A signed non-live Stripe event must return 200/ignored and cause no D1 mutation.

If live-session verification is required, use only `partnerships@mereonhealth.com`, create one Session through the public API, verify its amount without entering card data, then POST the returned public token to `/v1/orders/cancel`. Confirm Stripe says `expired` and D1 inventory `reserved` returned to its prior value. Never use a customer address or customer email. Never complete the Session.

AgentMail delivery verification is permitted only to `partnerships@mereonhealth.com`; the local smoke suite uses a fake provider and sends nothing.

## Reconciliation and recovery

Application logs contain no deliberate PII. Keep Cloudflare request logging disabled for this Worker unless an incident requires tightly controlled access. Public status exposes only order number, state, purchased lines, and totals behind a 256-bit token.

Useful aggregate checks (do not dump `customer_json`):

```bash
npx wrangler d1 execute mereon-checkout-production --remote --command \
 "SELECT code,on_hand,reserved,sold FROM inventory ORDER BY code"
npx wrangler d1 execute mereon-checkout-production --remote --command \
 "SELECT status,email_status,COUNT(*) AS count FROM orders GROUP BY status,email_status"
```

Invariants: all counters are non-negative; `reserved <= on_hand`; each normal paid order has one `paid` Stripe event; and every normal paid order eventually reaches `email_status='sent'`. A delayed paid event received after inventory release is never discarded: it moves the order to `paid_review` without sending a fulfillment confirmation, and requires immediate manual stock/refund reconciliation. Alarms release only Stripe-confirmed expired/failed reservations and retry provider failures with backoff; pending delayed-payment Sessions are rechecked against an expanded PaymentIntent and deferred while Stripe still reports an actionable/processing state. A five-minute Worker cron invokes the same private reconciliation path as a crash-recovery backstop, including paid orders whose confirmation outbox is still `pending`. A stale send lease becomes retryable after ten minutes; every retry reuses AgentMail's deterministic `Idempotency-Key` for the logical confirmation, with a deterministic RFC Message-ID as an additional reconciliation marker. If Stripe delivery was missed, resend the original event from the new Mereon webhook's Stripe dashboard; idempotency prevents re-finalization. If AgentMail was unavailable, the order remains paid and its mail retry is scheduled; never create another Checkout Session for that order.

To force a failed email retry after resolving the provider incident, set only that known order's `email_next_attempt_at` to `unixepoch()` and `email_status` to `failed`; do not alter payment or inventory fields. Confirm delivery in AgentMail and the D1 aggregate query.

## Rollback

A frontend rollback can hide/disable checkout without deleting paid order data. For backend incidents, remove the custom-domain route or deploy a health-only fail-closed Worker, while preserving D1 and the webhook for reconciliation. Never delete paid orders, edit stock manually without an approved inventory count, or point the Mereon webhook at ByAgentX infrastructure.
