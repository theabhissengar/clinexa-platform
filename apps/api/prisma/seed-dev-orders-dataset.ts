import { randomUUID } from 'crypto';

import {
  OrderAddressKind,
  OrderStatus,
  OrderType,
  ProductType,
  ReservationStatus,
  StockMovementType,
  UserStatus,
  type PrismaClient,
} from '../generated/prisma';
import { Roles } from '../src/modules/rbac/constants/roles';
import {
  DEV_CITIES,
  DEV_FIRST_NAMES,
  DEV_LAST_NAMES,
  DEV_ORDER_COUNT,
  DEV_ORDER_NUMBER_PREFIX,
  DEV_PATIENT_COUNT,
  DEV_PATIENT_EMAIL_PREFIX,
  type DevOrderStatusPlan,
  orderNumber,
  orderTypeForIndex,
  patientEmail,
  statusForOrderIndex,
} from './data/dev-orders-dataset';

type VariantRow = {
  id: string;
  productId: string;
  sku: string;
  label: string | null;
  priceCents: number;
  salePriceCents: number | null;
  product: {
    id: string;
    name: string;
    productType: ProductType;
    isRxEligible: boolean;
    brandName: string | null;
  };
};

function isEnabledFlag(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === 'true' || v === '1';
}

function assertDevEnvironment(): void {
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnv === 'production') {
    throw new Error(
      'SEED_DEV_DATASET cannot run when NODE_ENV=production.',
    );
  }
}

function padPhone(index: number): string {
  const n = 5550100000 + index;
  const s = String(n);
  return `+1${s.slice(0, 3)}${s.slice(3, 6)}${s.slice(6)}`;
}

function createdAtForOrder(index1Based: number): Date {
  // Spread across ~120 days ending 2026-08-15 (deterministic, non-future vs Aug 20 2026).
  const base = Date.UTC(2026, 3, 15, 14, 0, 0); // 2026-04-15
  const dayOffset = (index1Based * 7) % 120;
  const hourOffset = (index1Based * 3) % 20;
  const minuteOffset = (index1Based * 11) % 60;
  return new Date(
    base + dayOffset * 86_400_000 + hourOffset * 3_600_000 + minuteOffset * 60_000,
  );
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** Build a valid status path ending at `finalStatus`. */
function statusPath(
  finalStatus: DevOrderStatusPlan,
  preferClinical: boolean,
): OrderStatus[] {
  const draft = OrderStatus.DRAFT;
  const pending = OrderStatus.PAYMENT_PENDING;
  const clinical = OrderStatus.AWAITING_CLINICAL_REVIEW;
  const approved = OrderStatus.CLINICAL_APPROVED;
  const declined = OrderStatus.CLINICAL_DECLINED;
  const fulfill = OrderStatus.AWAITING_FULFILLMENT;
  const fulfilled = OrderStatus.FULFILLED;
  const cancelled = OrderStatus.CANCELLED;
  const refunded = OrderStatus.REFUNDED;

  switch (finalStatus) {
    case 'DRAFT':
      return [draft];
    case 'PAYMENT_PENDING':
      return [draft, pending];
    case 'AWAITING_CLINICAL_REVIEW':
      return [draft, pending, clinical];
    case 'CLINICAL_APPROVED':
      return [draft, pending, clinical, approved];
    case 'CLINICAL_DECLINED':
      return [draft, pending, clinical, declined];
    case 'AWAITING_FULFILLMENT':
      return preferClinical
        ? [draft, pending, clinical, approved, fulfill]
        : [draft, pending, fulfill];
    case 'FULFILLED':
      return preferClinical
        ? [draft, pending, clinical, approved, fulfill, fulfilled]
        : [draft, pending, fulfill, fulfilled];
    case 'CANCELLED': {
      // Vary cancel entry points for realism.
      const paths: OrderStatus[][] = [
        [draft, cancelled],
        [draft, pending, cancelled],
        [draft, pending, clinical, cancelled],
        [draft, pending, fulfill, cancelled],
      ];
      return paths[preferClinical ? 2 : 1]!;
    }
    case 'REFUNDED': {
      if (preferClinical) {
        return [draft, pending, clinical, declined, refunded];
      }
      return [draft, pending, fulfill, fulfilled, refunded];
    }
    default:
      return [draft];
  }
}

function computeLine(
  unitPriceCents: number,
  salePriceCents: number,
  quantity: number,
  discountCents: number,
  taxCents: number,
) {
  const lineSubtotalCents = salePriceCents * quantity;
  const lineTotalCents = lineSubtotalCents - discountCents + taxCents;
  return {
    unitPriceCents,
    salePriceCents,
    quantity,
    discountCents,
    taxCents,
    lineSubtotalCents,
    lineTotalCents,
  };
}

async function ensureDevCatalogVariants(
  prisma: PrismaClient,
): Promise<VariantRow[]> {
  const extras: Array<{
    productSlug: string;
    productName: string;
    isRxEligible: boolean;
    productType: ProductType;
    categorySlug: string;
    variants: Array<{
      sku: string;
      label: string;
      priceCents: number;
      salePriceCents?: number;
      isFulfillable?: boolean;
    }>;
  }> = [
    {
      productSlug: 'demo-hair-finasteride',
      productName: 'Demo Hair Finasteride',
      isRxEligible: true,
      productType: ProductType.STANDARD,
      categorySlug: 'hair-loss',
      variants: [
        { sku: 'DEMO-HAIR-1MG', label: '1 mg daily', priceCents: 4900 },
      ],
    },
    {
      productSlug: 'demo-vitamin-d',
      productName: 'Demo Vitamin D',
      isRxEligible: false,
      productType: ProductType.STANDARD,
      categorySlug: 'mens-health',
      variants: [
        { sku: 'DEMO-VITD-60', label: '60 capsules', priceCents: 1800 },
      ],
    },
    {
      productSlug: 'demo-skin-serum',
      productName: 'Demo Skin Serum',
      isRxEligible: false,
      productType: ProductType.VARIABLE,
      categorySlug: 'skincare',
      variants: [
        {
          sku: 'DEMO-SERUM-30',
          label: '30 ml',
          priceCents: 4500,
          salePriceCents: 3900,
        },
        { sku: 'DEMO-SERUM-60', label: '60 ml', priceCents: 7200 },
      ],
    },
    {
      productSlug: 'demo-digital-guide',
      productName: 'Demo Digital Guide',
      isRxEligible: false,
      productType: ProductType.DIGITAL,
      categorySlug: 'mens-health',
      variants: [
        {
          sku: 'DEMO-DIGITAL-GUIDE',
          label: 'PDF guide',
          priceCents: 900,
          isFulfillable: false,
        },
      ],
    },
    {
      productSlug: 'demo-lowstock-item',
      productName: 'Demo Low Stock Item',
      isRxEligible: false,
      productType: ProductType.STANDARD,
      categorySlug: 'skincare',
      variants: [
        { sku: 'DEMO-LOWSTOCK-1', label: 'Single unit', priceCents: 1200 },
      ],
    },
  ];

  for (const spec of extras) {
    const category = await prisma.category.findUnique({
      where: { slug: spec.categorySlug },
    });
    if (!category) continue;

    const product = await prisma.product.upsert({
      where: { slug: spec.productSlug },
      create: {
        id: randomUUID(),
        name: spec.productName,
        slug: spec.productSlug,
        description: `Seed catalog product for Orders dataset (${spec.productName}).`,
        isRxEligible: spec.isRxEligible,
        productType: spec.productType,
        seoTitle: spec.productName,
        seoDescription: 'Development seed catalog product.',
        lifecycleStatus: 'PUBLISHED',
        tags: ['demo', 'seed', 'orders-dataset'],
      },
      update: {
        name: spec.productName,
        isRxEligible: spec.isRxEligible,
        productType: spec.productType,
        lifecycleStatus: 'PUBLISHED',
        deletedAt: null,
      },
    });

    for (const variant of spec.variants) {
      const existing = await prisma.productVariant.findFirst({
        where: { sku: variant.sku },
      });
      if (!existing) {
        await prisma.productVariant.create({
          data: {
            id: randomUUID(),
            productId: product.id,
            sku: variant.sku,
            label: variant.label,
            priceCents: variant.priceCents,
            salePriceCents: variant.salePriceCents ?? null,
            currency: 'USD',
            isFulfillable: variant.isFulfillable ?? true,
          },
        });
      }
    }

    await prisma.productCategoryLink.upsert({
      where: {
        productId_categoryId: {
          productId: product.id,
          categoryId: category.id,
        },
      },
      create: {
        id: randomUUID(),
        productId: product.id,
        categoryId: category.id,
      },
      update: {},
    });
  }

  const skus = [
    'DEMO-WEIGHT-30',
    'DEMO-SKIN-50ML',
    'DEMO-HAIR-1MG',
    'DEMO-VITD-60',
    'DEMO-SERUM-30',
    'DEMO-SERUM-60',
    'DEMO-DIGITAL-GUIDE',
    'DEMO-LOWSTOCK-1',
  ];

  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: skus }, deletedAt: null },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          productType: true,
          isRxEligible: true,
          brandName: true,
        },
      },
    },
  });

  if (variants.length < 2) {
    throw new Error(
      'Dev Orders dataset requires catalog variants (run seedDemoCatalog first).',
    );
  }

  return variants;
}

/** Ensure DEFAULT warehouse has enough stock for seed orders + live CRM ops. */
async function ensureDevInventoryStock(
  prisma: PrismaClient,
  variants: VariantRow[],
): Promise<string> {
  const warehouse = await prisma.warehouse.findFirst({
    where: { isDefault: true },
  });
  if (!warehouse) {
    throw new Error('Default warehouse missing — run seedInventoryDefaults first.');
  }

  const stockBySku: Record<string, number> = {
    'DEMO-WEIGHT-30': 2000,
    'DEMO-SKIN-50ML': 2000,
    'DEMO-HAIR-1MG': 2000,
    'DEMO-VITD-60': 2000,
    'DEMO-SERUM-30': 2000,
    'DEMO-SERUM-60': 2000,
    'DEMO-LOWSTOCK-1': 1,
  };

  for (const variant of variants) {
    if (variant.product.productType === ProductType.DIGITAL) continue;
    const target = stockBySku[variant.sku];
    if (target == null) continue;

    const existing = await prisma.inventoryBalance.findUnique({
      where: {
        warehouseId_productVariantId: {
          warehouseId: warehouse.id,
          productVariantId: variant.id,
        },
      },
    });
    if (existing) {
      // Reset projection for deterministic reseed (movements from prior ORD-SEED cleared above).
      if (
        existing.quantityOnHand !== target ||
        existing.quantityReserved !== 0
      ) {
        const delta = target - existing.quantityOnHand;
        if (delta !== 0) {
          await prisma.stockMovement.create({
            data: {
              id: randomUUID(),
              warehouseId: warehouse.id,
              productVariantId: variant.id,
              movementType: StockMovementType.ADJUST,
              quantityDelta: delta,
              reason: 'Seed balance reset for ORD-SEED dataset',
            },
          });
        }
        await prisma.inventoryBalance.update({
          where: { id: existing.id },
          data: { quantityOnHand: target, quantityReserved: 0 },
        });
      }
      continue;
    }

    await prisma.stockMovement.create({
      data: {
        id: randomUUID(),
        warehouseId: warehouse.id,
        productVariantId: variant.id,
        movementType: StockMovementType.RECEIVE,
        quantityDelta: target,
        reason: 'Seed receiving',
      },
    });
    await prisma.inventoryBalance.create({
      data: {
        id: randomUUID(),
        warehouseId: warehouse.id,
        productVariantId: variant.id,
        quantityOnHand: target,
        quantityReserved: 0,
      },
    });
  }

  return warehouse.id;
}

/**
 * Create a real StockReservation + ledger movements for a seed order.
 * Returns reservation id or null when no tracked lines / no auth-equivalent status.
 */
async function seedOrderReservation(
  prisma: PrismaClient,
  input: {
    orderId: string;
    warehouseId: string;
    terminal: OrderStatus;
    path: OrderStatus[];
    lines: Array<{
      variantId: string;
      quantity: number;
      productType: string;
    }>;
    createdAt: Date;
  },
): Promise<string | null> {
  const needsAuthReserve =
    input.path.includes(OrderStatus.AWAITING_CLINICAL_REVIEW) ||
    input.path.includes(OrderStatus.AWAITING_FULFILLMENT) ||
    input.path.includes(OrderStatus.FULFILLED) ||
    input.path.includes(OrderStatus.CLINICAL_APPROVED) ||
    input.path.includes(OrderStatus.CLINICAL_DECLINED);

  // Cancel after payment_pending without fulfillment path may still have reserved
  // if path went through awaiting_fulfillment / clinical.
  const cancelledAfterReserve =
    input.terminal === OrderStatus.CANCELLED &&
    (input.path.includes(OrderStatus.AWAITING_FULFILLMENT) ||
      input.path.includes(OrderStatus.AWAITING_CLINICAL_REVIEW));

  if (!needsAuthReserve && !cancelledAfterReserve) {
    return null;
  }

  // DRAFT / PAYMENT_PENDING never reserved.
  if (
    input.terminal === OrderStatus.DRAFT ||
    input.terminal === OrderStatus.PAYMENT_PENDING
  ) {
    return null;
  }

  const trackedLines = input.lines.filter(
    (l) => l.productType !== String(ProductType.DIGITAL),
  );
  if (trackedLines.length === 0) {
    return null;
  }

  let status: ReservationStatus = ReservationStatus.PENDING;
  if (input.terminal === OrderStatus.FULFILLED) {
    status = ReservationStatus.COMMITTED;
  } else if (
    input.terminal === OrderStatus.CANCELLED ||
    input.terminal === OrderStatus.CLINICAL_DECLINED
  ) {
    status = ReservationStatus.RELEASED;
  } else if (
    input.terminal === OrderStatus.REFUNDED &&
    input.path.includes(OrderStatus.FULFILLED)
  ) {
    status = ReservationStatus.COMMITTED; // restocked after commit
  } else if (input.terminal === OrderStatus.REFUNDED) {
    status = ReservationStatus.RELEASED; // pre-fulfill refund
  }

  const reservationId = randomUUID();
  await prisma.stockReservation.create({
    data: {
      id: reservationId,
      orderId: input.orderId,
      status,
      expiresAt: new Date(input.createdAt.getTime() + 60 * 60 * 1000),
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      lines: {
        create: trackedLines.map((line) => ({
          id: randomUUID(),
          warehouseId: input.warehouseId,
          productVariantId: line.variantId,
          quantity: line.quantity,
        })),
      },
    },
  });

  for (const line of trackedLines) {
    // RESERVE movement
    await prisma.stockMovement.create({
      data: {
        id: randomUUID(),
        warehouseId: input.warehouseId,
        productVariantId: line.variantId,
        movementType: StockMovementType.RESERVE,
        quantityDelta: line.quantity,
        orderId: input.orderId,
        reservationId,
        reason: 'Seed reserve',
        createdAt: input.createdAt,
      },
    });

    const balance = await prisma.inventoryBalance.findUnique({
      where: {
        warehouseId_productVariantId: {
          warehouseId: input.warehouseId,
          productVariantId: line.variantId,
        },
      },
    });
    if (balance) {
      let onHand = balance.quantityOnHand;
      let reserved = balance.quantityReserved + line.quantity;

      if (status === ReservationStatus.COMMITTED) {
        await prisma.stockMovement.create({
          data: {
            id: randomUUID(),
            warehouseId: input.warehouseId,
            productVariantId: line.variantId,
            movementType: StockMovementType.COMMIT,
            quantityDelta: -line.quantity,
            orderId: input.orderId,
            reservationId,
            reason: 'Seed commit',
            createdAt: addMinutes(input.createdAt, 30),
          },
        });
        reserved -= line.quantity;
        onHand -= line.quantity;

        if (
          input.terminal === OrderStatus.REFUNDED &&
          input.path.includes(OrderStatus.FULFILLED)
        ) {
          await prisma.stockMovement.create({
            data: {
              id: randomUUID(),
              warehouseId: input.warehouseId,
              productVariantId: line.variantId,
              movementType: StockMovementType.RESTOCK,
              quantityDelta: line.quantity,
              orderId: input.orderId,
              reservationId,
              reason: 'Seed restock',
              createdAt: addMinutes(input.createdAt, 60),
            },
          });
          onHand += line.quantity;
        }
      } else if (status === ReservationStatus.RELEASED) {
        await prisma.stockMovement.create({
          data: {
            id: randomUUID(),
            warehouseId: input.warehouseId,
            productVariantId: line.variantId,
            movementType: StockMovementType.RELEASE,
            quantityDelta: -line.quantity,
            orderId: input.orderId,
            reservationId,
            reason: 'Seed release',
            createdAt: addMinutes(input.createdAt, 30),
          },
        });
        reserved -= line.quantity;
      }

      await prisma.inventoryBalance.update({
        where: { id: balance.id },
        data: {
          quantityOnHand: Math.max(0, onHand),
          quantityReserved: Math.max(0, reserved),
        },
      });
    }
  }

  await prisma.order.update({
    where: { id: input.orderId },
    data: { reservationId },
  });

  return reservationId;
}

async function seedDevPatients(
  prisma: PrismaClient,
  passwordHash: string,
): Promise<{ id: string; email: string; firstName: string; lastName: string; phone: string }[]> {
  const patientRole = await prisma.role.findUnique({
    where: { code: Roles.PATIENT },
  });
  if (!patientRole) {
    throw new Error('Patient role missing after catalog seed');
  }

  const patients: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  }[] = [];

  for (let i = 1; i <= DEV_PATIENT_COUNT; i++) {
    const email = patientEmail(i);
    const firstName = DEV_FIRST_NAMES[(i - 1) % DEV_FIRST_NAMES.length]!;
    const lastName = DEV_LAST_NAMES[(i - 1) % DEV_LAST_NAMES.length]!;
    const phone = padPhone(i);
    const city = DEV_CITIES[(i - 1) % DEV_CITIES.length]!;
    const address = {
      line1: `${100 + (i % 800)} Dev Street`,
      line2: i % 4 === 0 ? `Suite ${i % 20}` : null,
      city: city.city,
      region: city.region,
      postalCode: city.postalCode,
      country: 'US',
    };

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        status: UserStatus.ACTIVE,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        phone,
        region: city.region,
        billingAddress: address,
        shippingAddress: address,
        emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
        accountSecurityState: { create: {} },
      },
      update: {
        passwordHash,
        status: UserStatus.ACTIVE,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        phone,
        region: city.region,
        billingAddress: address,
        shippingAddress: address,
        deletedAt: null,
        archivedAt: null,
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
      },
    });

    patients.push({
      id: user.id,
      email,
      firstName,
      lastName,
      phone,
    });
  }

  return patients;
}

async function seedDevOrders(
  prisma: PrismaClient,
  patients: Awaited<ReturnType<typeof seedDevPatients>>,
  variants: VariantRow[],
  actorUserId: string | null,
): Promise<void> {
  // Idempotent: remove previous ORD-SEED-* orders and their seed reservations.
  const priorOrders = await prisma.order.findMany({
    where: { orderNumber: { startsWith: DEV_ORDER_NUMBER_PREFIX } },
    select: { id: true, reservationId: true },
  });
  if (priorOrders.length > 0) {
    const reservationIds = priorOrders
      .map((o) => o.reservationId)
      .filter((id): id is string => !!id);
    if (reservationIds.length > 0) {
      await prisma.stockMovement.deleteMany({
        where: { reservationId: { in: reservationIds } },
      });
      await prisma.stockReservation.deleteMany({
        where: { id: { in: reservationIds } },
      });
    }
    const deleted = await prisma.order.deleteMany({
      where: { orderNumber: { startsWith: DEV_ORDER_NUMBER_PREFIX } },
    });
    console.log(`Removed ${deleted.count} prior ${DEV_ORDER_NUMBER_PREFIX}* orders.`);
  }

  const warehouseId = await ensureDevInventoryStock(prisma, variants);

  const physicalVariants = variants.filter(
    (v) =>
      v.product.productType !== ProductType.DIGITAL &&
      v.sku !== 'DEMO-LOWSTOCK-1',
  );
  const digitalVariant = variants.find((v) => v.sku === 'DEMO-DIGITAL-GUIDE');

  const statusCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};

  for (let i = 1; i <= DEV_ORDER_COUNT; i++) {
    const patient = patients[(i - 1) % patients.length]!;
    const finalStatus = statusForOrderIndex(i);
    const { orderType, subscriptionId } = orderTypeForIndex(i);
    const createdAt = createdAtForOrder(i);

    const lineCount = 1 + (i % 4);
    const selected: VariantRow[] = [];
    for (let li = 0; li < lineCount; li++) {
      selected.push(physicalVariants[(i + li) % physicalVariants.length]!);
    }
    if (digitalVariant && i % 11 === 0) {
      selected.push(digitalVariant);
    }
    const preferClinical = selected.some((v) => v.product.isRxEligible);
    const path = statusPath(finalStatus, preferClinical);
    const terminal = path[path.length - 1]!;

    const lineRows = selected.map((variant, li) => {
      const quantity = 1 + ((i + li) % 3);
      const unitPriceCents = variant.priceCents;
      const salePriceCents = variant.salePriceCents ?? variant.priceCents;
      const discountCents = i % 7 === 0 ? Math.min(200, salePriceCents) : 0;
      const taxCents = Math.round(salePriceCents * quantity * 0.08);
      const totals = computeLine(
        unitPriceCents,
        salePriceCents,
        quantity,
        discountCents,
        taxCents,
      );
      return {
        productId: variant.productId,
        variantId: variant.id,
        productName: variant.product.name,
        sku: variant.sku,
        productType: String(variant.product.productType),
        isRxEligible: variant.product.isRxEligible,
        catalogMetadata: {
          brandName: variant.product.brandName,
          variantLabel: variant.label,
          seed: true,
        },
        ...totals,
      };
    });

    const subtotalCents = lineRows.reduce((s, l) => s + l.lineSubtotalCents, 0);
    const lineDiscountSum = lineRows.reduce((s, l) => s + l.discountCents, 0);
    const lineTaxSum = lineRows.reduce((s, l) => s + l.taxCents, 0);
    const shippingTotalCents =
      terminal === OrderStatus.DRAFT ? 0 : 599 + (i % 3) * 200;
    const discountTotalCents = lineDiscountSum;
    const taxTotalCents = lineTaxSum;
    const refundedTotalCents =
      terminal === OrderStatus.REFUNDED
        ? Math.min(
            subtotalCents - discountTotalCents + shippingTotalCents + taxTotalCents,
            subtotalCents,
          )
        : 0;
    const totalCents =
      subtotalCents - discountTotalCents + shippingTotalCents + taxTotalCents;

    const isRxOrder = lineRows.some((l) => l.isRxEligible);
    const requiresClinicalReview =
      isRxOrder &&
      (terminal === OrderStatus.AWAITING_CLINICAL_REVIEW ||
        terminal === OrderStatus.CLINICAL_APPROVED ||
        terminal === OrderStatus.CLINICAL_DECLINED ||
        path.includes(OrderStatus.AWAITING_CLINICAL_REVIEW));

    const city = DEV_CITIES[(i - 1) % DEV_CITIES.length]!;
    const fullName = `${patient.firstName} ${patient.lastName}`;
    const addressBase = {
      fullName,
      line1: `${200 + (i % 700)} Commerce Ave`,
      line2: i % 5 === 0 ? `Unit ${i % 12}` : null,
      city: city.city,
      region: city.region,
      postalCode: city.postalCode,
      country: 'US',
      phone: patient.phone,
    };

    const paymentStatusSummary =
      terminal === OrderStatus.DRAFT
        ? null
        : terminal === OrderStatus.PAYMENT_PENDING
          ? 'pending_authorization'
          : terminal === OrderStatus.CANCELLED
            ? 'voided'
            : terminal === OrderStatus.REFUNDED
              ? 'refunded'
              : terminal === OrderStatus.CLINICAL_DECLINED
                ? 'authorized'
                : 'authorized_captured';

    const historyCreates = path.map((toStatus, hi) => {
      const fromStatus = hi === 0 ? null : path[hi - 1]!;
      return {
        id: randomUUID(),
        fromStatus,
        toStatus,
        actorUserId: hi === 0 ? null : actorUserId,
        source: hi === 0 ? 'system' : hi === path.length - 1 && terminal === OrderStatus.CANCELLED ? 'crm' : 'system',
        reason:
          toStatus === OrderStatus.CANCELLED
            ? 'Seed cancel for filter coverage'
            : toStatus === OrderStatus.REFUNDED
              ? 'Seed refund outcome'
              : null,
        createdAt: addMinutes(createdAt, hi * 45),
      };
    });

    const activityCreates: Array<{
      id: string;
      actorUserId: string | null;
      kind: string;
      summary: string;
      metadata?: object;
      createdAt: Date;
    }> = [
      {
        id: randomUUID(),
        actorUserId: null,
        kind: 'order_created',
        summary: 'Order created (dev seed)',
        createdAt,
      },
    ];

    if (terminal === OrderStatus.FULFILLED || path.includes(OrderStatus.FULFILLED)) {
      activityCreates.push({
        id: randomUUID(),
        actorUserId: actorUserId,
        kind: 'status_transition',
        summary: 'AWAITING_FULFILLMENT → FULFILLED',
        createdAt: addMinutes(createdAt, (path.length - 1) * 45),
      });
    }
    if (terminal === OrderStatus.CANCELLED) {
      activityCreates.push({
        id: randomUUID(),
        actorUserId: actorUserId,
        kind: 'status_transition',
        summary: `Cancelled (${path[path.length - 2] ?? 'DRAFT'} → CANCELLED)`,
        createdAt: addMinutes(createdAt, (path.length - 1) * 45),
      });
    }
    if (i % 4 === 0) {
      activityCreates.push({
        id: randomUUID(),
        actorUserId: actorUserId,
        kind: 'note_added',
        summary: 'Internal note added',
        createdAt: addMinutes(createdAt, 20),
      });
    }

    const noteCreates =
      i % 4 === 0 && actorUserId
        ? [
            {
              id: randomUUID(),
              authorUserId: actorUserId,
              body: `Dev seed note for ${orderNumber(i)}: customer contact follow-up.`,
              createdAt: addMinutes(createdAt, 20),
            },
          ]
        : [];

    const shippedAt =
      terminal === OrderStatus.FULFILLED ||
      (terminal === OrderStatus.REFUNDED && path.includes(OrderStatus.FULFILLED))
        ? addMinutes(createdAt, path.length * 45)
        : null;

    const order = await prisma.order.create({
      data: {
        id: randomUUID(),
        orderNumber: orderNumber(i),
        patientUserId: patient.id,
        status: terminal,
        orderType:
          orderType === 'SUBSCRIPTION_INITIAL'
            ? OrderType.SUBSCRIPTION_INITIAL
            : orderType === 'SUBSCRIPTION_RENEWAL'
              ? OrderType.SUBSCRIPTION_RENEWAL
              : OrderType.ONE_TIME,
        subscriptionId,
        customerFirstName: patient.firstName,
        customerLastName: patient.lastName,
        customerEmail: patient.email,
        customerPhone: patient.phone,
        currency: 'USD',
        subtotalCents,
        discountTotalCents,
        shippingTotalCents,
        taxTotalCents,
        totalCents,
        adjustmentTotalCents: 0,
        refundedTotalCents,
        paymentIntentId:
          terminal === OrderStatus.DRAFT
            ? null
            : `pi_seed_${String(i).padStart(4, '0')}`,
        latestPaymentId:
          terminal === OrderStatus.DRAFT ||
          terminal === OrderStatus.PAYMENT_PENDING
            ? null
            : `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
        paymentStatusSummary,
        reservationId: null,
        consultationId: requiresClinicalReview
          ? `00000000-0000-4000-b000-${String(i).padStart(12, '0')}`
          : null,
        prescriptionId:
          isRxOrder &&
          (terminal === OrderStatus.CLINICAL_APPROVED ||
            path.includes(OrderStatus.CLINICAL_APPROVED) ||
            path.includes(OrderStatus.FULFILLED))
            ? `00000000-0000-4000-c000-${String(i).padStart(12, '0')}`
            : null,
        questionnaireResponseId: isRxOrder
          ? `00000000-0000-4000-d000-${String(i).padStart(12, '0')}`
          : null,
        requiresClinicalReview,
        isRxOrder,
        trackingNumber: shippedAt ? `SEEDTRACK${String(i).padStart(6, '0')}` : null,
        carrier: shippedAt ? (i % 2 === 0 ? 'UPS' : 'USPS') : null,
        shippedAt,
        createdAt,
        updatedAt: addMinutes(createdAt, path.length * 45),
        items: {
          create: lineRows.map((line) => ({
            id: randomUUID(),
            ...line,
            createdAt,
            updatedAt: createdAt,
          })),
        },
        addresses: {
          create: [
            {
              id: randomUUID(),
              kind: OrderAddressKind.SHIPPING,
              ...addressBase,
              createdAt,
              updatedAt: createdAt,
            },
            {
              id: randomUUID(),
              kind: OrderAddressKind.BILLING,
              ...addressBase,
              line1: `${300 + (i % 500)} Billing Blvd`,
              createdAt,
              updatedAt: createdAt,
            },
          ],
        },
        statusHistory: { create: historyCreates },
        activities: { create: activityCreates },
        notes: noteCreates.length ? { create: noteCreates } : undefined,
      },
    });

    await seedOrderReservation(prisma, {
      orderId: order.id,
      warehouseId,
      terminal,
      path,
      lines: lineRows.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
        productType: l.productType,
      })),
      createdAt,
    });

    statusCounts[terminal] = (statusCounts[terminal] ?? 0) + 1;
    typeCounts[orderType] = (typeCounts[orderType] ?? 0) + 1;
  }

  console.log(
    `Seeded ${DEV_ORDER_COUNT} orders (${DEV_ORDER_NUMBER_PREFIX}*). Statuses: ${JSON.stringify(statusCounts)}. Types: ${JSON.stringify(typeCounts)}.`,
  );
}

/**
 * Optional bulk development dataset for CRM Orders testing.
 * Enable with SEED_DEV_DATASET=true and a ≥12-char password env.
 * Refuses to run when NODE_ENV=production.
 */
export async function seedDevOrdersDataset(
  prisma: PrismaClient,
  hashPassword: (password: string) => Promise<string>,
): Promise<void> {
  if (!isEnabledFlag(process.env.SEED_DEV_DATASET)) {
    console.log(
      'Dev Orders dataset skipped: set SEED_DEV_DATASET=true and SEED_DEV_DATASET_PASSWORD (or SEED_DEMO_PATIENT_PASSWORD) to seed ~150 patients + ~100 orders.',
    );
    return;
  }

  assertDevEnvironment();

  const password =
    process.env.SEED_DEV_DATASET_PASSWORD?.trim() ||
    process.env.SEED_DEMO_PATIENT_PASSWORD?.trim();
  if (!password || password.length < 12) {
    throw new Error(
      'SEED_DEV_DATASET_PASSWORD (or SEED_DEMO_PATIENT_PASSWORD) ≥12 chars is required when SEED_DEV_DATASET is enabled.',
    );
  }

  console.log('Seeding development Orders dataset…');
  const passwordHash = await hashPassword(password);
  const variants = await ensureDevCatalogVariants(prisma);
  const patients = await seedDevPatients(prisma, passwordHash);

  const actor =
    (await prisma.user.findFirst({
      where: { email: 'operations@example.com', deletedAt: null },
      select: { id: true },
    })) ??
    (await prisma.user.findFirst({
      where: { email: 'support@example.com', deletedAt: null },
      select: { id: true },
    })) ??
    (await prisma.user.findFirst({
      where: {
        email: { not: { startsWith: DEV_PATIENT_EMAIL_PREFIX } },
        staffProfile: { isNot: null },
        deletedAt: null,
      },
      select: { id: true },
    }));

  await seedDevOrders(prisma, patients, variants, actor?.id ?? null);

  const patientCount = await prisma.user.count({
    where: { email: { startsWith: DEV_PATIENT_EMAIL_PREFIX } },
  });
  const orderCount = await prisma.order.count({
    where: { orderNumber: { startsWith: DEV_ORDER_NUMBER_PREFIX } },
  });
  const itemCount = await prisma.orderItem.count({
    where: { order: { orderNumber: { startsWith: DEV_ORDER_NUMBER_PREFIX } } },
  });
  const emptyItemOrders = await prisma.order.count({
    where: {
      orderNumber: { startsWith: DEV_ORDER_NUMBER_PREFIX },
      items: { none: {} },
    },
  });

  if (patientCount < DEV_PATIENT_COUNT) {
    throw new Error(`Expected ≥${DEV_PATIENT_COUNT} dev patients, found ${patientCount}`);
  }
  if (orderCount < DEV_ORDER_COUNT) {
    throw new Error(`Expected ≥${DEV_ORDER_COUNT} seed orders, found ${orderCount}`);
  }
  if (emptyItemOrders > 0) {
    throw new Error(`${emptyItemOrders} seed orders have no line items`);
  }

  console.log(
    `Dev dataset OK: ${patientCount} patients (${DEV_PATIENT_EMAIL_PREFIX}*), ${orderCount} orders, ${itemCount} line items.`,
  );
}
