import { validateEnv } from './env.validation';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  JWT_REFRESH_SECRET: 'y'.repeat(32),
};

describe('validateEnv (Phase 6G S4)', () => {
  it('allows simulated defaults in development', () => {
    const cfg = validateEnv({
      ...base,
      NODE_ENV: 'development',
      PAYMENTS_PROVIDER: 'simulated',
    });
    expect(cfg.PAYMENTS_PROVIDER).toBe('simulated');
  });

  it('rejects default worker secret in production', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        PAYMENTS_PROVIDER: 'stripe',
        PAYMENTS_MODE: 'sandbox',
        STRIPE_SECRET_KEY: 'sk_test_abc',
        STRIPE_WEBHOOK_SECRET: 'whsec_abc',
        WORKER_SHARED_SECRET: 'dev-worker-shared-secret',
        PAYMENTS_WEBHOOK_SECRET: 'production-webhook-secret-ok',
      }),
    ).toThrow(/WORKER_SHARED_SECRET/);
  });

  it('rejects simulated in production without PAYMENTS_ALLOW_SIMULATED', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        PAYMENTS_PROVIDER: 'simulated',
        WORKER_SHARED_SECRET: 'prod-worker-secret-value',
        PAYMENTS_WEBHOOK_SECRET: 'prod-webhook-secret-value',
      }),
    ).toThrow(/PAYMENTS_ALLOW_SIMULATED/);
  });

  it('allows simulated in production with PAYMENTS_ALLOW_SIMULATED=true', () => {
    const cfg = validateEnv({
      ...base,
      NODE_ENV: 'production',
      PAYMENTS_PROVIDER: 'simulated',
      PAYMENTS_ALLOW_SIMULATED: 'true',
      WORKER_SHARED_SECRET: 'prod-worker-secret-value',
      PAYMENTS_WEBHOOK_SECRET: 'prod-webhook-secret-value',
    });
    expect(cfg.PAYMENTS_ALLOW_SIMULATED).toBe(true);
  });

  it('does not require Stripe secrets when provider is simulated', () => {
    const cfg = validateEnv({
      ...base,
      NODE_ENV: 'test',
      PAYMENTS_PROVIDER: 'simulated',
    });
    expect(cfg.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it('does not echo secret values in validation errors', () => {
    try {
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        PAYMENTS_PROVIDER: 'simulated',
        WORKER_SHARED_SECRET: 'super-secret-value-xyz',
        PAYMENTS_WEBHOOK_SECRET: 'another-secret-value-xyz',
      });
      fail('expected throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('super-secret-value-xyz');
      expect(message).not.toContain('another-secret-value-xyz');
      expect(message).toContain('PAYMENTS_ALLOW_SIMULATED');
    }
  });
});
