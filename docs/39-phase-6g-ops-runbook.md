# 39 — Phase 6G Payments Ops Runbook

| Field | Value |
| --- | --- |
| Document | Phase 6G payments ops checklist |
| Status | Active with Phase 6G |
| Related | [26](26-implementation-tracker.md), [38](38-phase-6a-payments-architecture-audit.md), [15](15-payment-flow.md) |

## 1. Production secrets (S4)

| Secret | Config | Production rule |
| --- | --- | --- |
| Worker shared secret | `WORKER_SHARED_SECRET` | Must be set; reject documented defaults (`dev-worker-shared-secret`) |
| Simulated webhook secret | `PAYMENTS_WEBHOOK_SECRET` | Must be set; reject documented defaults when provider=simulated |
| Stripe secrets | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Required only when `PAYMENTS_PROVIDER=stripe`; live keys rejected |
| Simulated in production | `PAYMENTS_ALLOW_SIMULATED=true` | Required for `PAYMENTS_PROVIDER=simulated` when `NODE_ENV=production` (internal deploys only) |

Rotate worker/webhook secrets by dual-writing the new value on the worker and API, then cut over clients; never log secret values.

## 2. Webhook redelivery

- Simulated: shared-secret header; invalid → 401 `PAY_WEBHOOK_INVALID`.
- Stripe: HMAC + raw body; invalid signature → 401 (no ingest).
- Applied events are true duplicates (ACK). Live lease → 409 so the PSP retries.
- Refund `failed` envelope alone does **not** release reservation; retrieve must confirm `CONFIRMED_FAILURE` and stamp allow-listed `Refund.errorCode`.

## 3. Capture recovery (R3)

Canonical keys (not stored on `Payment`):

- Order-scoped: `capture:{orderId}:{paymentId}`
- Renewal-period: `renewal:{subscriptionId}:{billingPeriodKey}:capture`

`CAPTURE_PENDING` → retrieve first; if still open auth, re-capture **only** with reconstructed canonical key. Never invent `webhook_capture:…` for recovery. Renewal batch reconcile remains retrieve-only.

## 4. Authorize exclusivity (R4)

`authorizeForOrder` takes `SELECT … FROM orders … FOR UPDATE`, checks open payments, inserts PENDING row, then calls the gateway **outside** the lock. Different idempotency keys cannot both hold open auths for one order.

## 5. Patient payment methods (deferred)

Guardian/CRM IDOR method routes under `PAY_MANAGE_METHODS` were removed. Staff use shell + resource permissions on canonical method controllers. **No** patient store `/me/payment-methods` in 6G (SetupIntent/Elements + detach-vs-subscription policy deferred to a later phase).

## 6. Ingress rate limiting (S6)

No in-app Nest throttler on money/webhook/job routes. Confirm edge/ingress rate limits cover:

- `POST /v1/webhooks/payments` and Stripe webhook path
- `POST /v1/internal/jobs/*`
- Checkout/pay endpoints

Add app-level RL only if ingress does not already cover these.

## 7. Test evidence classification

| Layer | What it proves |
| --- | --- |
| Unit (simulated) | State machine, R1–R4 paths, S4 validateEnv, S1–S3 permission metadata, T1 auth expiry, T2 HMAC 401, T4 journey |
| Controller metadata | PATIENT denied unscoped admin/crm payment/method APIs |
| Postgres int (`RUN_POSTGRES_INTEGRATION=1`) | Refund overlap; R1 fail-vs-reserve; R4 order-lock exclusivity — **not** claimed from unit mutexes |
| Stripe | Mocked SDK HMAC failure only — **not** live Stripe |

## 8. Phase 7 status

Phase 6G readiness gates (S1–S3, S4, R1, R3, R4) are satisfied on `feature/payments-architecture-audit`.

**Phase 7 delivered (staff API):** list filters; shared refundable reservation display; `POST /v1/admin/payments/:id/reconcile` (shell AND `ORD_EDIT`) reusing `PaymentsService.reconcilePaymentById` — same engine as `POST /v1/internal/jobs/payment-reconcile` (worker secret). Staff reconcile does not bypass renewal retrieve-only / claimToken fencing. Internal reconcile `error` maps to 5xx; pending/renewal/terminal map to 200 with allow-listed `outcome`. Retry the same reconcile route; never invent a new financial Idempotency-Key.

**Still deferred:** full Guardian Payments UI redesign; webhook ops/replay admin APIs; patient `/me` payment methods.
