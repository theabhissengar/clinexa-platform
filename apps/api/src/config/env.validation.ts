import { z } from 'zod';

/**
 * Validates process environment at Nest boot (NFR-125 / DEV-100).
 * Throws with a field-level summary when required configuration is missing or invalid.
 */
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
