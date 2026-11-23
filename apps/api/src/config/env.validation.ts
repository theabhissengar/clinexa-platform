import { z } from 'zod';

/**
 * Validates process environment at Nest boot (NFR-125 / DEV-100).
 * Throws with a field-level summary when required configuration is missing or invalid.
 */
const durationSchema = z
  .string()
  .regex(/^\d+(s|m|h)$/i, 'Use formats like 15m, 12h, or 900s');

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  API_PREFIX: z.string().default(''),
  CORS_ORIGINS: z.string().min(1).default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SWAGGER_PATH: z.string().min(1).default('api/docs'),
  /** Optional override for OpenAPI document version (set by CI/CD). */
  SWAGGER_VERSION: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).optional(),
  LOG_HEALTH_REQUESTS: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => val === true || val === 'true' || val === '1'),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: durationSchema.default('15m'),
  AUTH_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),
  AUTH_ABSOLUTE_TIMEOUT_HOURS: z.coerce.number().int().positive().default(12),
  AUTH_REFRESH_COOKIE_NAME: z.string().min(1).default('clinexa_refresh'),
  AUTH_COOKIE_SECURE: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (val === undefined) {
        return undefined;
      }
      return val === true || val === 'true' || val === '1';
    }),
  ARGON2_MEMORY_COST: z.coerce.number().int().positive().optional(),
  ARGON2_TIME_COST: z.coerce.number().int().positive().optional(),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().optional(),

  STORAGE_PROVIDER: z
    .enum(['local', 's3', 'r2', 'azure', 'gcs'])
    .default('local'),
  STORAGE_LOCAL_ROOT: z.string().min(1).optional(),
  STORAGE_PUBLIC_BASE_URL: z.string().url().optional(),
  STORAGE_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().optional(),
  STORAGE_UPLOAD_SESSION_TTL_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .optional(),

  /** Payments — simulated (CI default) or stripe test-mode (Phase 6C). */
  PAYMENTS_PROVIDER: z.enum(['simulated', 'stripe']).default('simulated'),
  /**
   * When NODE_ENV=production and PAYMENTS_PROVIDER=simulated, must be true.
   * Internal/non-customer deploys only — never imply real PSP confirmation.
   */
  PAYMENTS_ALLOW_SIMULATED: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => val === true || val === 'true' || val === '1'),
  PAYMENTS_WEBHOOK_SECRET: z
    .string()
    .min(16)
    .default('dev-payments-webhook-secret'),
  /** Optional simulated force-fail for tests: decline | timeout */
  PAYMENTS_SIMULATED_FORCE: z.enum(['decline', 'timeout']).optional(),
  /** Simulated authorization hold window (hours) — test config only. */
  PAYMENTS_SIMULATED_AUTH_HOLD_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .default(168),
  /** Webhook claim lease TTL (seconds). */
  PAYMENTS_WEBHOOK_LEASE_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(45),
  /**
   * Renewal attempt worker lease TTL (seconds). Must cover provider HTTP
   * timeout + buffer; heartbeat extends while a gateway call is in flight.
   */
  PAYMENTS_RENEWAL_LEASE_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(120),
  /** Max authorize a{n} allocations per billing period (product-tunable). */
  PAYMENTS_RENEWAL_MAX_AUTHORIZE_ATTEMPTS: z.coerce
    .number()
    .int()
    .positive()
    .default(5),
  /** Minimum seconds between confirmed failed authorize retries. */
  PAYMENTS_RENEWAL_MIN_RETRY_DELAY_SECONDS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(3600),
  PAYMENTS_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  PAYMENTS_WEBHOOK_PUBLIC_BASE: z.string().url().optional(),
  /** Stripe test-mode secret — required when PAYMENTS_PROVIDER=stripe. */
  STRIPE_SECRET_KEY: z.string().optional(),
  /** Stripe webhook signing secret (whsec_…) — required when provider=stripe. */
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  /** Safe window to retry same Stripe create idempotency key (hours). */
  STRIPE_IDEMPOTENCY_WINDOW_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .default(24),
  /** Max PaymentIntent/Customer Search attempts on unknown create. */
  STRIPE_SEARCH_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),

  /** AUTH-015 worker shared secret for Internal job routes. */
  WORKER_SHARED_SECRET: z.string().min(16).default('dev-worker-shared-secret'),
  RENEWAL_CRON_ENABLED: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => val === true || val === 'true' || val === '1'),
  RENEWAL_CRON_EXPR: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');

    throw new Error(
      `Environment validation failed. Fix the following and restart:\n${details}`,
    );
  }

  const data = result.data;
  const errors: string[] = [];

  if (data.NODE_ENV === 'production') {
    const defaultWorker = 'dev-worker-shared-secret';
    const defaultWebhook = 'dev-payments-webhook-secret';
    if (
      !data.WORKER_SHARED_SECRET ||
      data.WORKER_SHARED_SECRET === defaultWorker
    ) {
      errors.push(
        '  - WORKER_SHARED_SECRET: must be set to a non-default value in production',
      );
    }
    if (
      !data.PAYMENTS_WEBHOOK_SECRET ||
      data.PAYMENTS_WEBHOOK_SECRET === defaultWebhook
    ) {
      errors.push(
        '  - PAYMENTS_WEBHOOK_SECRET: must be set to a non-default value in production',
      );
    }
    if (
      data.PAYMENTS_PROVIDER === 'simulated' &&
      !data.PAYMENTS_ALLOW_SIMULATED
    ) {
      errors.push(
        '  - PAYMENTS_PROVIDER: simulated is forbidden in production unless PAYMENTS_ALLOW_SIMULATED=true (internal deploys only)',
      );
    }
  }

  if (data.PAYMENTS_PROVIDER === 'stripe') {
    if (data.PAYMENTS_MODE !== 'sandbox') {
      errors.push(
        '  - PAYMENTS_MODE: stripe provider requires sandbox (live blocked in Phase 6C)',
      );
    }
    const secret = data.STRIPE_SECRET_KEY?.trim() ?? '';
    if (!secret) {
      errors.push(
        '  - STRIPE_SECRET_KEY: required when PAYMENTS_PROVIDER=stripe',
      );
    } else if (!secret.startsWith('sk_test_')) {
      errors.push(
        '  - STRIPE_SECRET_KEY: must be a test key (sk_test_…); live keys are rejected',
      );
    }
    if (secret.startsWith('sk_live_')) {
      errors.push('  - STRIPE_SECRET_KEY: live keys are forbidden in Phase 6C');
    }
    const whsec = data.STRIPE_WEBHOOK_SECRET?.trim() ?? '';
    if (!whsec) {
      errors.push(
        '  - STRIPE_WEBHOOK_SECRET: required when PAYMENTS_PROVIDER=stripe',
      );
    } else if (!whsec.startsWith('whsec_')) {
      errors.push(
        '  - STRIPE_WEBHOOK_SECRET: must be a Stripe signing secret (whsec_…)',
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed. Fix the following and restart:\n${errors.join('\n')}`,
    );
  }

  return data;
}
