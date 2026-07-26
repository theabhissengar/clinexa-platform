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

  return result.data;
}
