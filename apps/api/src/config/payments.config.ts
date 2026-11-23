import { registerAs } from '@nestjs/config';

export default registerAs('payments', () => ({
  provider: (process.env.PAYMENTS_PROVIDER ?? 'simulated').toLowerCase(),
  mode: (process.env.PAYMENTS_MODE ?? 'sandbox').toLowerCase(),
  webhookPublicBase:
    process.env.PAYMENTS_WEBHOOK_PUBLIC_BASE ??
    `http://localhost:${process.env.PORT ?? '3001'}`,
  webhookSecret:
    process.env.PAYMENTS_WEBHOOK_SECRET ?? 'dev-payments-webhook-secret',
  simulatedForce: process.env.PAYMENTS_SIMULATED_FORCE ?? null,
  simulatedAuthHoldHours: Number(
    process.env.PAYMENTS_SIMULATED_AUTH_HOLD_HOURS ?? '168',
  ),
  webhookLeaseSeconds: Number(
    process.env.PAYMENTS_WEBHOOK_LEASE_SECONDS ?? '45',
  ),
  renewalLeaseSeconds: Number(
    process.env.PAYMENTS_RENEWAL_LEASE_SECONDS ?? '120',
  ),
  renewalMaxAuthorizeAttempts: Number(
    process.env.PAYMENTS_RENEWAL_MAX_AUTHORIZE_ATTEMPTS ?? '5',
  ),
  renewalMinRetryDelaySeconds: Number(
    process.env.PAYMENTS_RENEWAL_MIN_RETRY_DELAY_SECONDS ?? '3600',
  ),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? null,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? null,
  stripeIdempotencyWindowHours: Number(
    process.env.STRIPE_IDEMPOTENCY_WINDOW_HOURS ?? '24',
  ),
  stripeSearchMaxAttempts: Number(
    process.env.STRIPE_SEARCH_MAX_ATTEMPTS ?? '3',
  ),
  workerSharedSecret:
    process.env.WORKER_SHARED_SECRET ?? 'dev-worker-shared-secret',
  renewalCronEnabled:
    process.env.RENEWAL_CRON_ENABLED === 'true' ||
    process.env.RENEWAL_CRON_ENABLED === '1',
  renewalCronExpr: process.env.RENEWAL_CRON_EXPR ?? '*/5 * * * *',
}));
