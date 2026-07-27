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
import { Roles } from '../src/modules/rbac/constants/roles';

/**
 * Canonical RBAC seed + optional staff Administrator and Super Administrator users.
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

async function seedAdminUser(prisma: PrismaClient): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      'Admin user seed skipped: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create a local Administrator.',
    );
    return;
  }

  if (password.length < 12) {
    throw new Error(
      'SEED_ADMIN_PASSWORD must be at least 12 characters (AUTH-034).',
    );
  }

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

  const adminRole = await prisma.role.findUnique({
    where: { code: Roles.ADMINISTRATOR },
  });
  if (!adminRole) {
    throw new Error('Administrator role missing after catalog seed');
  }

  await prisma.userRoleAssignment.upsert({
    where: {
      userId_roleId: { userId: user.id, roleId: adminRole.id },
    },
    create: {
      id: randomUUID(),
      userId: user.id,
      roleId: adminRole.id,
      revokedAt: null,
    },
    update: {
      revokedAt: null,
      assignedAt: new Date(),
    },
  });

  console.log(
    `Seeded Administrator user: ${user.email} (${user.id}) with ${Roles.ADMINISTRATOR}`,
  );
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

  if (password.length < 12) {
    throw new Error(
      'SEED_SUPER_ADMIN_PASSWORD must be at least 12 characters (AUTH-034).',
    );
  }

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

  const superAdminRole = await prisma.role.findUnique({
    where: { code: Roles.SUPER_ADMINISTRATOR },
  });
  if (!superAdminRole) {
    throw new Error('Super Administrator role missing after catalog seed');
  }

  await prisma.userRoleAssignment.upsert({
    where: {
      userId_roleId: { userId: user.id, roleId: superAdminRole.id },
    },
    create: {
      id: randomUUID(),
      userId: user.id,
      roleId: superAdminRole.id,
      revokedAt: null,
    },
    update: {
      revokedAt: null,
      assignedAt: new Date(),
    },
  });

  console.log(
    `Seeded Super Administrator user: ${user.email} (${user.id}) with ${Roles.SUPER_ADMINISTRATOR}`,
  );
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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
