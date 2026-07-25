import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration (Prisma 7+).
 *
 * Use `process.env.DATABASE_URL` (not `env('DATABASE_URL')`) so commands that
 * do not need a live database — especially `prisma generate` during
 * `postinstall` / CI — can run when DATABASE_URL is unset.
 *
 * Commands that require a real database (migrate, db push, studio) still need
 * DATABASE_URL to be set in the environment or apps/api/.env.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
