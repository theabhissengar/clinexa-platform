import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

import { PrismaClient, UserStatus } from '../generated/prisma';

/**
 * Development seed: creates a staff user when SEED_ADMIN_EMAIL and
 * SEED_ADMIN_PASSWORD are set. Never hardcodes credentials.
 */
async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      'Seed skipped: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create a local staff user.',
    );
    return;
  }

  if (password.length < 12) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be at least 12 characters (AUTH-034).',
    );
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run the seed.');
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: parseInt(process.env.ARGON2_MEMORY_COST ?? '65536', 10),
      timeCost: parseInt(process.env.ARGON2_TIME_COST ?? '3', 10),
      parallelism: parseInt(process.env.ARGON2_PARALLELISM ?? '4', 10),
    });

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
      update: {
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });

    console.log(`Seeded staff user: ${user.email} (${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
