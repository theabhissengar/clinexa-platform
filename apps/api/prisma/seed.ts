import 'dotenv/config';

import { randomUUID } from 'crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

import { PrismaClient, UserStatus } from '../generated/prisma';
import {
  PERMISSION_DEFINITIONS,
  ROLE_PERMISSION_MATRIX,
  ROLE_SEED_ROWS,
  SEEDED_ROLE_CODES,
} from './data/rbac-catalog';
import { Roles, type RoleCode } from '../src/modules/rbac/constants/roles';

/**
 * Canonical RBAC seed + optional local staff users for role testing.
 * RolePermission rows for seeded roles are replaced to match the matrix.
 */
async function seedRbacCatalog(prisma: PrismaClient): Promise<void> {
  for (const role of ROLE_SEED_ROWS) {
    await prisma.role.upsert({
      where: { code: role.code },
      create: {
        id: randomUUID(),
        code: role.code,
        slug: role.slug,
        name: role.name,
        description: role.description,
      },
      update: {
        slug: role.slug,
        name: role.name,
        description: role.description,
      },
    });
  }

  for (const permission of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: {
        id: randomUUID(),
        code: permission.code,
        module: permission.module,
        name: permission.name,
        description: permission.description,
        resource: permission.resource,
        action: permission.action,
      },
      update: {
        module: permission.module,
        name: permission.name,
        description: permission.description,
        resource: permission.resource,
        action: permission.action,
      },
    });
  }

  const roles = await prisma.role.findMany({
    where: { code: { in: [...SEEDED_ROLE_CODES] } },
  });
  const permissions = await prisma.permission.findMany();
  const roleByCode = new Map(roles.map((r) => [r.code, r]));
  const permissionByCode = new Map(permissions.map((p) => [p.code, p]));

  for (const roleCode of SEEDED_ROLE_CODES) {
    const role = roleByCode.get(roleCode);
    if (!role) {
      throw new Error(`Missing seeded role ${roleCode}`);
    }

    const desiredCodes = ROLE_PERMISSION_MATRIX[roleCode];
    const desiredIds = desiredCodes.map((code: string) => {
      const permission = permissionByCode.get(code);
      if (!permission) {
        throw new Error(`Missing seeded permission ${code}`);
      }
      return permission.id;
    });

    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: desiredIds },
      },
    });

    for (const permissionId of desiredIds) {
      const existing = await prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
      });
      if (!existing) {
        await prisma.rolePermission.create({
          data: {
            id: randomUUID(),
            roleId: role.id,
            permissionId,
          },
        });
      }
    }
  }

  console.log(
    `Seeded RBAC catalog: ${roles.length} roles, ${permissions.length} permissions (canonical matrix).`,
  );
}

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: parseInt(process.env.ARGON2_MEMORY_COST ?? '65536', 10),
    timeCost: parseInt(process.env.ARGON2_TIME_COST ?? '3', 10),
    parallelism: parseInt(process.env.ARGON2_PARALLELISM ?? '4', 10),
  });
}

async function seedStaffUser(
  prisma: PrismaClient,
  options: {
    email: string;
    password: string;
    roleCode: RoleCode;
    label: string;
  },
): Promise<void> {
  const email = options.email.trim().toLowerCase();
  const { password, roleCode, label } = options;

  if (password.length < 12) {
    throw new Error(
      `${label} password must be at least 12 characters (AUTH-034).`,
    );
  }

  const passwordHash = await hashPassword(password);

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

  const role = await prisma.role.findUnique({
    where: { code: roleCode },
  });
  if (!role) {
    throw new Error(`${label} role ${roleCode} missing after catalog seed`);
  }

  await prisma.userRoleAssignment.upsert({
    where: {
      userId_roleId: { userId: user.id, roleId: role.id },
    },
    create: {
      id: randomUUID(),
      userId: user.id,
      roleId: role.id,
      revokedAt: null,
    },
    update: {
      revokedAt: null,
      assignedAt: new Date(),
    },
  });

  console.log(`Seeded ${label} user: ${user.email} (${user.id}) with ${roleCode}`);
}

async function seedAdminUser(prisma: PrismaClient): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      'Admin user seed skipped: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create a local Administrator.',
    );
    return;
  }

  await seedStaffUser(prisma, {
    email,
    password,
    roleCode: Roles.ADMINISTRATOR,
    label: 'Administrator',
  });
}

async function seedSuperAdminUser(prisma: PrismaClient): Promise<void> {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      'Super Admin user seed skipped: set SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD to create a local Super Administrator.',
    );
    return;
  }

  await seedStaffUser(prisma, {
    email,
    password,
    roleCode: Roles.SUPER_ADMINISTRATOR,
    label: 'Super Administrator',
  });
}

/**
 * Optional local demo accounts for every non-admin staff role.
 * Enable with SEED_DEMO_STAFF=true and SEED_DEMO_STAFF_PASSWORD (≥12 chars).
 * Emails default to {role}@example.com unless overridden per role.
 */
async function seedDemoStaffUsers(prisma: PrismaClient): Promise<void> {
  const enabled = process.env.SEED_DEMO_STAFF?.trim().toLowerCase();
  if (enabled !== 'true' && enabled !== '1') {
    console.log(
      'Demo staff seed skipped: set SEED_DEMO_STAFF=true and SEED_DEMO_STAFF_PASSWORD to create Doctor/Pharmacist/Support/Operations/Marketing/Content users.',
    );
    return;
  }

  const password = process.env.SEED_DEMO_STAFF_PASSWORD;
  if (!password) {
    throw new Error(
      'SEED_DEMO_STAFF_PASSWORD is required when SEED_DEMO_STAFF is enabled.',
    );
  }

  const accounts: Array<{
    envEmail: string;
    defaultEmail: string;
    roleCode: RoleCode;
    label: string;
  }> = [
    {
      envEmail: 'SEED_DOCTOR_EMAIL',
      defaultEmail: 'doctor@example.com',
      roleCode: Roles.DOCTOR,
      label: 'Doctor',
    },
    {
      envEmail: 'SEED_PHARMACIST_EMAIL',
      defaultEmail: 'pharmacist@example.com',
      roleCode: Roles.PHARMACIST,
      label: 'Pharmacist',
    },
    {
      envEmail: 'SEED_SUPPORT_EMAIL',
      defaultEmail: 'support@example.com',
      roleCode: Roles.SUPPORT,
      label: 'Support',
    },
    {
      envEmail: 'SEED_OPERATIONS_EMAIL',
      defaultEmail: 'operations@example.com',
      roleCode: Roles.OPERATIONS,
      label: 'Operations',
    },
    {
      envEmail: 'SEED_MARKETING_EMAIL',
      defaultEmail: 'marketing@example.com',
      roleCode: Roles.MARKETING,
      label: 'Marketing',
    },
    {
      envEmail: 'SEED_CONTENT_EMAIL',
      defaultEmail: 'content@example.com',
      roleCode: Roles.CONTENT,
      label: 'Content',
    },
  ];

  for (const account of accounts) {
    const email =
      process.env[account.envEmail]?.trim().toLowerCase() ||
      account.defaultEmail;
    await seedStaffUser(prisma, {
      email,
      password,
      roleCode: account.roleCode,
      label: account.label,
    });
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run the seed.');
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    await seedRbacCatalog(prisma);
    await seedAdminUser(prisma);
    await seedSuperAdminUser(prisma);
    await seedDemoStaffUsers(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
