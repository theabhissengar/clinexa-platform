import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma';

config({ path: resolve(process.cwd(), '.env') });

function envFlag(value: string | undefined): boolean {
  return ['1', 'true', 'yes'].includes((value ?? '').toLowerCase());
}

export function integrationDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const url = env.DATABASE_URL?.trim();
  return url ? url : undefined;
}

/**
 * Real Postgres concurrency specs need a reachable database.
 * GitHub Actions sets a placeholder DATABASE_URL for `prisma generate` and
 * does not start Postgres. Skip there unless RUN_POSTGRES_INTEGRATION is set.
 */
export function shouldRunPostgresIntegration(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (envFlag(env.CI) && !envFlag(env.RUN_POSTGRES_INTEGRATION)) {
    return false;
  }
  return Boolean(integrationDatabaseUrl(env));
}

export function createIntegrationPrisma(url: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
}
