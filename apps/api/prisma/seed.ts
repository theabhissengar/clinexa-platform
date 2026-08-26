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
import { seedDevOrdersDataset } from './seed-dev-orders-dataset';
import { seedDevSubscriptionsDataset } from './seed-dev-subscriptions-dataset';
import { seedDevCouponsDataset } from './seed-dev-coupons-dataset';

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
      displayName: label,
      staffProfile: { create: {} },
      accountSecurityState: { create: {} },
    },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
    },
  });

  await prisma.staffProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });
  await prisma.accountSecurityState.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
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

async function seedDemoPatients(prisma: PrismaClient): Promise<void> {
  const enabled = process.env.SEED_DEMO_PATIENTS?.trim().toLowerCase();
  if (enabled !== 'true' && enabled !== '1') {
    console.log(
      'Demo patients seed skipped: set SEED_DEMO_PATIENTS=true and SEED_DEMO_PATIENT_PASSWORD to create sample patients.',
    );
    return;
  }

  const password = process.env.SEED_DEMO_PATIENT_PASSWORD;
  if (!password) {
    throw new Error(
      'SEED_DEMO_PATIENT_PASSWORD is required when SEED_DEMO_PATIENTS is enabled.',
    );
  }

  const patients = [
    {
      email: 'patient1@example.com',
      firstName: 'Alex',
      lastName: 'Patient',
    },
    {
      email: 'patient2@example.com',
      firstName: 'Jordan',
      lastName: 'Member',
    },
  ] as const;

  const patientRole = await prisma.role.findUnique({
    where: { code: Roles.PATIENT },
  });
  if (!patientRole) {
    throw new Error('Patient role missing after catalog seed');
  }

  const passwordHash = await hashPassword(password);

  for (const patient of patients) {
    const email = patient.email.trim().toLowerCase();
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        status: UserStatus.ACTIVE,
        firstName: patient.firstName,
        lastName: patient.lastName,
        displayName: `${patient.firstName} ${patient.lastName}`,
        accountSecurityState: { create: {} },
      },
      update: {
        passwordHash,
        status: UserStatus.ACTIVE,
        firstName: patient.firstName,
        lastName: patient.lastName,
        displayName: `${patient.firstName} ${patient.lastName}`,
      },
    });

    await prisma.userRoleAssignment.upsert({
      where: {
        userId_roleId: { userId: user.id, roleId: patientRole.id },
      },
      create: {
        id: randomUUID(),
        userId: user.id,
        roleId: patientRole.id,
        revokedAt: null,
      },
      update: {
        revokedAt: null,
        assignedAt: new Date(),
      },
    });

    console.log(`Seeded demo patient: ${user.email} (${user.id})`);
  }
}

async function seedDemoCatalog(prisma: PrismaClient): Promise<void> {
  const demoCategories = [
    {
      slug: 'weight-management',
      name: 'Weight Management',
      description: 'Demo seed category for weight management treatments.',
    },
    {
      slug: 'hair-loss',
      name: 'Hair Loss',
      description: 'Demo seed category for hair loss treatments.',
    },
    {
      slug: 'mens-health',
      name: "Men's Health",
      description: 'Demo seed category for men’s health treatments.',
    },
    {
      slug: 'skincare',
      name: 'Skincare',
      description: 'Demo seed category for skincare offerings.',
    },
  ] as const;

  for (const [index, category] of demoCategories.entries()) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: {
        id: randomUUID(),
        name: category.name,
        slug: category.slug,
        description: category.description,
        seoTitle: category.name,
        seoDescription: category.description,
        sortOrder: index,
        lifecycleStatus: 'PUBLISHED',
      },
      update: {
        name: category.name,
        description: category.description,
        seoTitle: category.name,
        seoDescription: category.description,
        sortOrder: index,
        lifecycleStatus: 'PUBLISHED',
        deletedAt: null,
      },
    });
  }

  const weight = await prisma.category.findUnique({
    where: { slug: 'weight-management' },
  });
  const skin = await prisma.category.findUnique({ where: { slug: 'skincare' } });

  if (weight) {
    const product = await prisma.product.upsert({
      where: { slug: 'demo-weight-program' },
      create: {
        id: randomUUID(),
        name: 'Demo Weight Program',
        slug: 'demo-weight-program',
        description: 'Seed Rx-eligible demo product for Weight Management.',
        isRxEligible: true,
        seoTitle: 'Demo Weight Program',
        seoDescription: 'Seed catalog product for AC-BR-06 demos.',
        questionnaireBindingRef: 'seed-qst-weight-v1',
        lifecycleStatus: 'PUBLISHED',
        tags: ['demo', 'seed'],
      },
      update: {
        name: 'Demo Weight Program',
        description: 'Seed Rx-eligible demo product for Weight Management.',
        isRxEligible: true,
        seoTitle: 'Demo Weight Program',
        questionnaireBindingRef: 'seed-qst-weight-v1',
        lifecycleStatus: 'PUBLISHED',
        deletedAt: null,
      },
    });

    const existingVariant = await prisma.productVariant.findFirst({
      where: { sku: 'DEMO-WEIGHT-30' },
    });
    if (!existingVariant) {
      await prisma.productVariant.create({
        data: {
          id: randomUUID(),
          productId: product.id,
          sku: 'DEMO-WEIGHT-30',
          label: '30-day supply',
          priceCents: 19900,
          currency: 'USD',
          isFulfillable: true,
        },
      });
    }

    await prisma.productCategoryLink.upsert({
      where: {
        productId_categoryId: {
          productId: product.id,
          categoryId: weight.id,
        },
      },
      create: {
        id: randomUUID(),
        productId: product.id,
        categoryId: weight.id,
      },
      update: {},
    });
  }

  if (skin) {
    const product = await prisma.product.upsert({
      where: { slug: 'demo-daily-moisturizer' },
      create: {
        id: randomUUID(),
        name: 'Demo Daily Moisturizer',
        slug: 'demo-daily-moisturizer',
        description: 'Seed non-Rx demo product for Skincare.',
        isRxEligible: false,
        seoTitle: 'Demo Daily Moisturizer',
        seoDescription: 'Non-prescription seed catalog product.',
        lifecycleStatus: 'PUBLISHED',
        tags: ['demo', 'seed', 'non-rx'],
      },
      update: {
        name: 'Demo Daily Moisturizer',
        isRxEligible: false,
        seoTitle: 'Demo Daily Moisturizer',
        lifecycleStatus: 'PUBLISHED',
        deletedAt: null,
      },
    });

    const existingVariant = await prisma.productVariant.findFirst({
      where: { sku: 'DEMO-SKIN-50ML' },
    });
    if (!existingVariant) {
      await prisma.productVariant.create({
        data: {
          id: randomUUID(),
          productId: product.id,
          sku: 'DEMO-SKIN-50ML',
          label: '50 ml',
          priceCents: 2900,
          currency: 'USD',
          isFulfillable: true,
        },
      });
    }

    await prisma.productCategoryLink.upsert({
      where: {
        productId_categoryId: {
          productId: product.id,
          categoryId: skin.id,
        },
      },
      create: {
        id: randomUUID(),
        productId: product.id,
        categoryId: skin.id,
      },
      update: {},
    });
  }

  console.log(
    'Seeded demo catalog: 4 categories + sample Weight Management and Skincare products (AC-BR-06).',
  );
}

async function seedInventoryDefaults(prisma: PrismaClient): Promise<void> {
  const warehouse = await prisma.warehouse.upsert({
    where: { code: 'DEFAULT' },
    create: {
      id: randomUUID(),
      code: 'DEFAULT',
      name: 'Default Warehouse',
      status: 'ACTIVE',
      isDefault: true,
    },
    update: {
      name: 'Default Warehouse',
      status: 'ACTIVE',
      isDefault: true,
    },
  });

  await prisma.inventoryPolicy.upsert({
    where: { code: 'default' },
    create: {
      id: randomUUID(),
      code: 'default',
      oversellMode: 'PREVENT',
      reservationTimeoutMinutes: 60,
      lowStockThreshold: 5,
      allowNegativeStock: false,
    },
    update: {},
  });

  const baselineSkus: Array<{ sku: string; quantity: number }> = [
    { sku: 'DEMO-SKIN-50ML', quantity: 500 },
    { sku: 'DEMO-WEIGHT-30', quantity: 500 },
  ];

  for (const row of baselineSkus) {
    const demoVariant = await prisma.productVariant.findFirst({
      where: { sku: row.sku, deletedAt: null },
    });
    if (!demoVariant) continue;

    const existing = await prisma.inventoryBalance.findUnique({
      where: {
        warehouseId_productVariantId: {
          warehouseId: warehouse.id,
          productVariantId: demoVariant.id,
        },
      },
    });
    if (existing) continue;

    await prisma.stockMovement.create({
      data: {
        id: randomUUID(),
        warehouseId: warehouse.id,
        productVariantId: demoVariant.id,
        movementType: 'RECEIVE',
        quantityDelta: row.quantity,
        reason: 'Seed receiving',
      },
    });
    await prisma.inventoryBalance.create({
      data: {
        id: randomUUID(),
        warehouseId: warehouse.id,
        productVariantId: demoVariant.id,
        quantityOnHand: row.quantity,
        quantityReserved: 0,
      },
    });
  }

  console.log(
    'Seeded inventory: default warehouse, policies, demo stock for baseline catalog SKUs when present.',
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
    await seedDemoCatalog(prisma);
    await seedInventoryDefaults(prisma);
    await seedAdminUser(prisma);
    await seedSuperAdminUser(prisma);
    await seedDemoStaffUsers(prisma);
    await seedDemoPatients(prisma);
    await seedDevOrdersDataset(prisma, hashPassword);
    await seedDevSubscriptionsDataset(prisma);
    await seedDevCouponsDataset(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
