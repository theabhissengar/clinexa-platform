import { registerAs } from '@nestjs/config';

export default registerAs('payments', () => ({
  provider: (process.env.PAYMENTS_PROVIDER ?? 'simulated').toLowerCase(),
  webhookSecret:
    process.env.PAYMENTS_WEBHOOK_SECRET ?? 'dev-payments-webhook-secret',
  simulatedForce: process.env.PAYMENTS_SIMULATED_FORCE ?? null,
  workerSharedSecret:
    process.env.WORKER_SHARED_SECRET ?? 'dev-worker-shared-secret',
  renewalCronEnabled:
    process.env.RENEWAL_CRON_ENABLED === 'true' ||
    process.env.RENEWAL_CRON_ENABLED === '1',
  renewalCronExpr: process.env.RENEWAL_CRON_EXPR ?? '*/5 * * * *',
}));
