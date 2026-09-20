import 'dotenv/config';

import { randomUUID } from 'crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

import {
  OrderAddressKind,
  OrderStatus,
  OrderType,
  PrismaClient,
  SubscriptionClinicalRequirement,
  SubscriptionRenewalAttemptStatus,
  SubscriptionStatus,
  UserGender,
  UserStatus,
} from '../generated/prisma';
import { Roles } from '../src/modules/rbac/constants/roles';
import {
  DEV_CITIES,
  DEV_FIRST_NAMES,
  DEV_LAST_NAMES,
} from './data/dev-orders-dataset';
import {
  UI_DATASET_COUNT,
  UI_PATIENT_EMAIL_PREFIX,
  uiParentOrderNumber,
  uiPatientEmail,
  uiPhone,
  uiRenewalOrderNumber,
  uiSubscriptionNumber,
} from './data/dev-ui-modernization-dataset';
import { ensureSubscriptionCatalog } from './seed-dev-subscriptions-dataset';

function assertDevEnvironment(): void {
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnv === 'production') {
    throw new Error(
      'UI modernization dataset cannot run when NODE_ENV=production.',
    );
  }
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function billingPeriodKey(subscriptionId: string, periodEnd: Date): string {
  return `${subscriptionId}:${periodEnd.toISOString().slice(0, 10)}`;
}

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: parseInt(process.env.ARGON2_MEMORY_COST ?? '65536', 10),
    timeCost: parseInt(process.env.ARGON2_TIME_COST ?? '3', 10),
    parallelism: parseInt(process.env.ARGON2_PARALLELISM ?? '1', 10),
  });
}

type Catalog = Awaited<ReturnType<typeof ensureSubscriptionCatalog>>;

type RenewalPlan = {
  attemptStatus: SubscriptionRenewalAttemptStatus;
  orderStatus: OrderStatus;
};

function renewalPlanForIndex(index1Based: number): RenewalPlan {
  const slot = index1Based % 5;
  if (slot === 0) {
    return {
      attemptStatus: SubscriptionRenewalAttemptStatus.FAILED,
      orderStatus: OrderStatus.PAYMENT_PENDING,
    };
  }
  if (slot === 1) {
    return {
      attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
      orderStatus: OrderStatus.PAYMENT_PENDING,
    };
  }
  if (slot === 2) {
    return {
      attemptStatus: SubscriptionRenewalAttemptStatus.SUCCEEDED,
      orderStatus: OrderStatus.AWAITING_FULFILLMENT,
    };
  }
  return {
    attemptStatus: SubscriptionRenewalAttemptStatus.SUCCEEDED,
    orderStatus: OrderStatus.FULFILLED,
  };
}

function computeLine(
  unitPriceCents: number,
  salePriceCents: number,
  quantity: number,
) {
  const discountCents = 0;
  const taxCents = Math.round(salePriceCents * quantity * 0.08);
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

function fulfilledPath(preferClinical: boolean): OrderStatus[] {
  const draft = OrderStatus.DRAFT;
  const pending = OrderStatus.PAYMENT_PENDING;
  const clinical = OrderStatus.AWAITING_CLINICAL_REVIEW;
  const approved = OrderStatus.CLINICAL_APPROVED;
  const fulfill = OrderStatus.AWAITING_FULFILLMENT;
  const fulfilled = OrderStatus.FULFILLED;
  return preferClinical
    ? [draft, pending, clinical, approved, fulfill, fulfilled]
    : [draft, pending, fulfill, fulfilled];
}

function pathEndingAt(
  terminal: OrderStatus,
  preferClinical: boolean,
): OrderStatus[] {
  if (terminal === OrderStatus.PAYMENT_PENDING) {
    return [OrderStatus.DRAFT, OrderStatus.PAYMENT_PENDING];
  }
  if (terminal === OrderStatus.AWAITING_FULFILLMENT) {
    return preferClinical
      ? [
          OrderStatus.DRAFT,
          OrderStatus.PAYMENT_PENDING,
          OrderStatus.AWAITING_CLINICAL_REVIEW,
          OrderStatus.CLINICAL_APPROVED,
          OrderStatus.AWAITING_FULFILLMENT,
        ]
      : [
          OrderStatus.DRAFT,
          OrderStatus.PAYMENT_PENDING,
          OrderStatus.AWAITING_FULFILLMENT,
        ];
  }
  return fulfilledPath(preferClinical);
}

async function seedOneChain(
  prisma: PrismaClient,
  catalog: Catalog,
  passwordHash: string,
  patientRoleId: string,
  actorUserId: string | null,
  index1Based: number,
  now: Date,
): Promise<'created' | 'skipped'> {
  const email = uiPatientEmail(index1Based);
  const firstName = DEV_FIRST_NAMES[(index1Based + 7) % DEV_FIRST_NAMES.length]!;
  const lastName = DEV_LAST_NAMES[(index1Based + 13) % DEV_LAST_NAMES.length]!;
  const phone = uiPhone(index1Based);
  const city = DEV_CITIES[(index1Based - 1) % DEV_CITIES.length]!;
  const address = {
    line1: `${400 + (index1Based % 500)} Maple Avenue`,
    line2: index1Based % 3 === 0 ? `Apt ${index1Based % 18}` : null,
    city: city.city,
    region: city.region,
    postalCode: city.postalCode,
    country: 'US',
  };
  const genders = [
    UserGender.FEMALE,
    UserGender.MALE,
    UserGender.UNSPECIFIED,
    UserGender.OTHER,
  ] as const;
  const gender = genders[(index1Based - 1) % genders.length]!;
  const dateOfBirth = new Date(
    Date.UTC(1978 + (index1Based % 22), index1Based % 12, 1 + (index1Based % 27)),
  );

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
      gender,
      dateOfBirth,
      billingAddress: address,
      shippingAddress: address,
      emailVerifiedAt: new Date('2026-01-15T00:00:00.000Z'),
      accountSecurityState: { create: {} },
    },
    update: {},
  });

  await prisma.userRoleAssignment.upsert({
    where: {
      userId_roleId: { userId: user.id, roleId: patientRoleId },
    },
    create: {
      id: randomUUID(),
      userId: user.id,
      roleId: patientRoleId,
      revokedAt: null,
    },
    update: {
      revokedAt: null,
    },
  });

  const useMonthly = index1Based % 2 === 1;
  const planRow = useMonthly ? catalog.monthly : catalog.quarterly;
  const productRow = useMonthly ? catalog.weight : catalog.skin;
  const preferClinical = productRow.product.isRxEligible;
  const unitPriceCents = productRow.variant.priceCents;
  const salePriceCents =
    productRow.variant.salePriceCents ?? productRow.variant.priceCents;
  const line = computeLine(unitPriceCents, salePriceCents, 1);
  const shippingTotalCents = 799;
  const totalCents = line.lineTotalCents + shippingTotalCents;
  const createdAt = addDays(now, -40 - (index1Based % 30));
  const parentNumber = uiParentOrderNumber(index1Based);
  const renewalNumber = uiRenewalOrderNumber(index1Based);
  const subscriptionNumber = uiSubscriptionNumber(index1Based);

  const existingParent = await prisma.order.findUnique({
    where: { orderNumber: parentNumber },
    select: { id: true, patientUserId: true, subscriptionId: true },
  });
  if (existingParent && existingParent.patientUserId !== user.id) {
    throw new Error(
      `Order ${parentNumber} already exists for a different patient`,
    );
  }
  const existingSub = await prisma.subscription.findUnique({
    where: { subscriptionNumber },
    select: {
      id: true,
      patientUserId: true,
      initialOrderId: true,
      latestOrderId: true,
      currentPeriodEnd: true,
    },
  });
  if (existingSub && existingSub.patientUserId !== user.id) {
    throw new Error(
      `Subscription ${subscriptionNumber} already exists for a different patient`,
    );
  }
  const existingRenewal = await prisma.order.findUnique({
    where: { orderNumber: renewalNumber },
    select: { id: true, patientUserId: true, subscriptionId: true },
  });
  if (existingRenewal && existingRenewal.patientUserId !== user.id) {
    throw new Error(
      `Order ${renewalNumber} already exists for a different patient`,
    );
  }

  if (
    existingParent &&
    existingSub &&
    existingRenewal &&
    existingParent.patientUserId === user.id &&
    existingSub.patientUserId === user.id &&
    existingRenewal.patientUserId === user.id &&
    existingSub.initialOrderId === existingParent.id &&
    existingParent.subscriptionId === existingSub.id &&
    existingRenewal.subscriptionId === existingSub.id
  ) {
    const key = existingSub.currentPeriodEnd
      ? billingPeriodKey(existingSub.id, existingSub.currentPeriodEnd)
      : null;
    const attempt = key
      ? await prisma.subscriptionRenewalAttempt.findUnique({
          where: {
            subscriptionId_billingPeriodKey: {
              subscriptionId: existingSub.id,
              billingPeriodKey: key,
            },
          },
        })
      : null;
    if (attempt?.orderId === existingRenewal.id) {
      return 'skipped';
    }
  }

  const fullName = `${firstName} ${lastName}`;
  const addressBase = {
    fullName,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    region: address.region,
    postalCode: address.postalCode,
    country: 'US',
    phone,
  };

  const parentPath = fulfilledPath(preferClinical);
  const parentTerminal = OrderStatus.FULFILLED;

  let parentOrderId = existingParent?.id;
  if (!parentOrderId) {
    const parent = await prisma.order.create({
      data: {
        id: randomUUID(),
        orderNumber: parentNumber,
        patientUserId: user.id,
        status: parentTerminal,
        orderType: OrderType.SUBSCRIPTION_INITIAL,
        customerFirstName: firstName,
        customerLastName: lastName,
        customerEmail: email,
        customerPhone: phone,
        currency: 'USD',
        subtotalCents: line.lineSubtotalCents,
        discountTotalCents: 0,
        shippingTotalCents,
        taxTotalCents: line.taxCents,
        totalCents,
        paymentStatusSummary: 'authorized_captured',
        requiresClinicalReview: preferClinical,
        isRxOrder: preferClinical,
        trackingNumber: `UITRACK${String(index1Based).padStart(6, '0')}`,
        carrier: index1Based % 2 === 0 ? 'UPS' : 'USPS',
        shippedAt: addMinutes(createdAt, parentPath.length * 45),
        createdAt,
        updatedAt: addMinutes(createdAt, parentPath.length * 45),
        items: {
          create: {
            id: randomUUID(),
            productId: productRow.product.id,
            variantId: productRow.variant.id,
            productName: productRow.product.name,
            sku: productRow.variant.sku,
            productType: String(productRow.product.productType),
            isRxEligible: preferClinical,
            catalogMetadata: { seed: 'ui-modernization', parent: true },
            ...line,
            createdAt,
            updatedAt: createdAt,
          },
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
              line1: `${500 + (index1Based % 400)} Billing Street`,
              createdAt,
              updatedAt: createdAt,
            },
          ],
        },
        statusHistory: {
          create: parentPath.map((toStatus, hi) => ({
            id: randomUUID(),
            fromStatus: hi === 0 ? null : parentPath[hi - 1]!,
            toStatus,
            actorUserId: hi === 0 ? null : actorUserId,
            source: hi === 0 ? 'system' : 'guardian',
            createdAt: addMinutes(createdAt, hi * 45),
          })),
        },
        activities: {
          create: [
            {
              id: randomUUID(),
              kind: 'order_created',
              summary: 'Parent subscription order created (UI dataset)',
              createdAt,
            },
          ],
        },
      },
    });
    parentOrderId = parent.id;
  }

  const cycleNumber = 1 + (index1Based % 4);
  const periodEnd = addDays(now, (index1Based % 21) - 7);
  const periodStart = addDays(periodEnd, useMonthly ? -30 : -90);
  const clinical =
    index1Based % 11 === 0
      ? SubscriptionClinicalRequirement.REASSESSMENT_REQUIRED
      : SubscriptionClinicalRequirement.NONE;

  let subscriptionId = existingSub?.id;
  let currentPeriodEnd = existingSub?.currentPeriodEnd ?? periodEnd;
  if (!subscriptionId) {
    const created = await prisma.subscription.create({
      data: {
        id: randomUUID(),
        subscriptionNumber,
        patientUserId: user.id,
        planId: planRow.id,
        status: SubscriptionStatus.ACTIVE,
        cycleNumber,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextRenewalAt: periodEnd,
        customerFirstName: firstName,
        customerLastName: lastName,
        customerEmail: email,
        customerPhone: phone,
        paymentStatusSummary: 'authorized_or_captured',
        clinicalRequirement: clinical,
        initialOrderId: parentOrderId,
        latestOrderId: parentOrderId,
        adminTags: { seed: 'ui-modernization' },
        items: {
          create: {
            id: randomUUID(),
            productId: productRow.product.id,
            variantId: productRow.variant.id,
            productName: productRow.product.name,
            sku: productRow.variant.sku,
            productType: String(productRow.product.productType),
            isRxEligible: preferClinical,
            catalogMetadata: { seed: 'ui-modernization' },
            quantity: 1,
            unitPriceCents,
            salePriceCents,
            currency: 'USD',
          },
        },
        statusHistory: {
          create: [
            {
              id: randomUUID(),
              fromStatus: null,
              toStatus: SubscriptionStatus.PENDING_SETUP,
              source: 'system',
              reason: 'ui_dataset',
              createdAt,
            },
            {
              id: randomUUID(),
              fromStatus: SubscriptionStatus.PENDING_SETUP,
              toStatus: SubscriptionStatus.ACTIVE,
              source: 'system',
              reason: 'ui_dataset_activated',
              createdAt: addMinutes(createdAt, 90),
            },
          ],
        },
        activities: {
          create: {
            id: randomUUID(),
            kind: 'subscription_seeded',
            summary: 'ACTIVE subscription bound to parent order (UI dataset)',
            metadata: { seed: 'ui-modernization' },
            createdAt: addMinutes(createdAt, 90),
          },
        },
      },
    });
    subscriptionId = created.id;
    currentPeriodEnd = created.currentPeriodEnd ?? periodEnd;
  }

  if (existingParent?.subscriptionId !== subscriptionId) {
    await prisma.order.update({
      where: { id: parentOrderId },
      data: { subscriptionId },
    });
  }

  const renewal = renewalPlanForIndex(index1Based);
  const renewalPath = pathEndingAt(renewal.orderStatus, preferClinical);
  const renewalCreatedAt = addDays(createdAt, 28);
  const key = billingPeriodKey(subscriptionId, currentPeriodEnd);
  const renewalIdempotency = `renewal:${subscriptionId}:${key}`;

  let renewalOrderId = existingRenewal?.id;
  if (!renewalOrderId) {
    const renewalOrder = await prisma.order.create({
      data: {
        id: randomUUID(),
        orderNumber: renewalNumber,
        patientUserId: user.id,
        status: renewal.orderStatus,
        orderType: OrderType.SUBSCRIPTION_RENEWAL,
        subscriptionId,
        customerFirstName: firstName,
        customerLastName: lastName,
        customerEmail: email,
        customerPhone: phone,
        currency: 'USD',
        subtotalCents: line.lineSubtotalCents,
        discountTotalCents: 0,
        shippingTotalCents,
        taxTotalCents: line.taxCents,
        totalCents,
        paymentStatusSummary:
          renewal.orderStatus === OrderStatus.PAYMENT_PENDING
            ? 'pending_authorization'
            : 'authorized_captured',
        idempotencyKey: renewalIdempotency,
        requiresClinicalReview: preferClinical,
        isRxOrder: preferClinical,
        shippedAt:
          renewal.orderStatus === OrderStatus.FULFILLED
            ? addMinutes(renewalCreatedAt, renewalPath.length * 45)
            : null,
        trackingNumber:
          renewal.orderStatus === OrderStatus.FULFILLED
            ? `UIRNW${String(index1Based).padStart(6, '0')}`
            : null,
        carrier:
          renewal.orderStatus === OrderStatus.FULFILLED
            ? index1Based % 2 === 0
              ? 'UPS'
              : 'USPS'
            : null,
        createdAt: renewalCreatedAt,
        updatedAt: addMinutes(renewalCreatedAt, renewalPath.length * 45),
        items: {
          create: {
            id: randomUUID(),
            productId: productRow.product.id,
            variantId: productRow.variant.id,
            productName: productRow.product.name,
            sku: productRow.variant.sku,
            productType: String(productRow.product.productType),
            isRxEligible: preferClinical,
            catalogMetadata: { seed: 'ui-modernization', renewal: true },
            ...line,
            createdAt: renewalCreatedAt,
            updatedAt: renewalCreatedAt,
          },
        },
        addresses: {
          create: [
            {
              id: randomUUID(),
              kind: OrderAddressKind.SHIPPING,
              ...addressBase,
              createdAt: renewalCreatedAt,
              updatedAt: renewalCreatedAt,
            },
            {
              id: randomUUID(),
              kind: OrderAddressKind.BILLING,
              ...addressBase,
              line1: `${500 + (index1Based % 400)} Billing Street`,
              createdAt: renewalCreatedAt,
              updatedAt: renewalCreatedAt,
            },
          ],
        },
        statusHistory: {
          create: renewalPath.map((toStatus, hi) => ({
            id: randomUUID(),
            fromStatus: hi === 0 ? null : renewalPath[hi - 1]!,
            toStatus,
            actorUserId: hi === 0 ? null : actorUserId,
            source: 'system',
            createdAt: addMinutes(renewalCreatedAt, hi * 45),
          })),
        },
        activities: {
          create: {
            id: randomUUID(),
            kind: 'order_created',
            summary: 'Renewal order created from ACTIVE subscription (UI dataset)',
            createdAt: renewalCreatedAt,
          },
        },
      },
    });
    renewalOrderId = renewalOrder.id;
  }

  const existingAttempt = await prisma.subscriptionRenewalAttempt.findUnique({
    where: {
      subscriptionId_billingPeriodKey: {
        subscriptionId,
        billingPeriodKey: key,
      },
    },
  });
  if (!existingAttempt) {
    await prisma.subscriptionRenewalAttempt.create({
      data: {
        id: randomUUID(),
        subscriptionId,
        billingPeriodKey: key,
        status: renewal.attemptStatus,
        orderId: renewalOrderId,
        retryCount:
          renewal.attemptStatus === SubscriptionRenewalAttemptStatus.FAILED
            ? 1
            : 0,
        source: 'system',
        paymentStatusSummary:
          renewal.attemptStatus === SubscriptionRenewalAttemptStatus.FAILED
            ? 'failed'
            : renewal.attemptStatus ===
                SubscriptionRenewalAttemptStatus.SUCCEEDED
              ? 'authorized_or_captured'
              : 'pending',
        lastErrorCode:
          renewal.attemptStatus === SubscriptionRenewalAttemptStatus.FAILED
            ? 'PAY_AUTHORIZATION_FAILED'
            : null,
      },
    });
  } else if (!existingAttempt.orderId) {
    await prisma.subscriptionRenewalAttempt.update({
      where: { id: existingAttempt.id },
      data: { orderId: renewalOrderId },
    });
  }

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      initialOrderId: parentOrderId,
      latestOrderId: renewalOrderId,
    },
  });

  return 'created';
}

async function verifyDataset(prisma: PrismaClient): Promise<{
  users: number;
  parentOrders: number;
  subscriptions: number;
  renewalOrders: number;
  attempts: number;
  incomplete: string[];
}> {
  const emails = Array.from({ length: UI_DATASET_COUNT }, (_, i) =>
    uiPatientEmail(i + 1),
  );
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });
  const userIds = users.map((u) => u.id);
  const parentOrders = await prisma.order.findMany({
    where: {
      orderNumber: { startsWith: 'ORD-UI-' },
      NOT: { orderNumber: { startsWith: 'ORD-UI-R-' } },
    },
    select: {
      id: true,
      orderNumber: true,
      patientUserId: true,
      orderType: true,
      subscriptionId: true,
    },
  });
  const renewalOrders = await prisma.order.findMany({
    where: { orderNumber: { startsWith: 'ORD-UI-R-' } },
    select: {
      id: true,
      orderNumber: true,
      patientUserId: true,
      orderType: true,
      subscriptionId: true,
    },
  });
  const subscriptions = await prisma.subscription.findMany({
    where: { subscriptionNumber: { startsWith: 'SUB-UI-' } },
    select: {
      id: true,
      subscriptionNumber: true,
      patientUserId: true,
      initialOrderId: true,
      latestOrderId: true,
      status: true,
      currentPeriodEnd: true,
    },
  });
  const attempts = await prisma.subscriptionRenewalAttempt.findMany({
    where: { subscriptionId: { in: subscriptions.map((s) => s.id) } },
    select: { id: true, subscriptionId: true, orderId: true },
  });

  const incomplete: string[] = [];
  const usersByEmail = new Map(users.map((u) => [u.email, u]));
  const parentsByUser = new Map(parentOrders.map((o) => [o.patientUserId, o]));
  const subsByUser = new Map(subscriptions.map((s) => [s.patientUserId, s]));
  const renewalsBySub = new Map(
    renewalOrders.map((o) => [o.subscriptionId ?? '', o]),
  );
  const attemptsBySub = new Map(attempts.map((a) => [a.subscriptionId, a]));

  for (let i = 1; i <= UI_DATASET_COUNT; i++) {
    const email = uiPatientEmail(i);
    const user = usersByEmail.get(email);
    if (!user) {
      incomplete.push(`${email}: missing user`);
      continue;
    }
    const parent = parentsByUser.get(user.id);
    const sub = subsByUser.get(user.id);
    if (!parent) incomplete.push(`${email}: missing parent order`);
    if (!sub) incomplete.push(`${email}: missing subscription`);
    if (parent && sub) {
      if (parent.orderType !== OrderType.SUBSCRIPTION_INITIAL) {
        incomplete.push(`${email}: parent order type ${parent.orderType}`);
      }
      if (parent.subscriptionId !== sub.id) {
        incomplete.push(`${email}: parent order not linked to subscription`);
      }
      if (sub.initialOrderId !== parent.id) {
        incomplete.push(`${email}: subscription.initialOrderId mismatch`);
      }
      const renewal = renewalsBySub.get(sub.id);
      if (!renewal) {
        incomplete.push(`${email}: missing renewal order`);
      } else if (renewal.orderType !== OrderType.SUBSCRIPTION_RENEWAL) {
        incomplete.push(`${email}: renewal order type ${renewal.orderType}`);
      } else if (sub.latestOrderId !== renewal.id) {
        incomplete.push(`${email}: subscription.latestOrderId mismatch`);
      }
      const attempt = attemptsBySub.get(sub.id);
      if (!attempt) incomplete.push(`${email}: missing renewal attempt`);
      else if (renewal && attempt.orderId !== renewal.id) {
        incomplete.push(`${email}: attempt.orderId mismatch`);
      }
    }
    const extraParents = parentOrders.filter((o) => o.patientUserId === user.id);
    if (extraParents.length > 1) {
      incomplete.push(`${email}: ${extraParents.length} parent orders`);
    }
    const extraSubs = subscriptions.filter((s) => s.patientUserId === user.id);
    if (extraSubs.length > 1) {
      incomplete.push(`${email}: ${extraSubs.length} subscriptions`);
    }
  }

  const extraUsers = userIds.length;
  if (extraUsers !== UI_DATASET_COUNT) {
    incomplete.push(
      `expected ${UI_DATASET_COUNT} users, found ${extraUsers}`,
    );
  }

  return {
    users: users.length,
    parentOrders: parentOrders.length,
    subscriptions: subscriptions.length,
    renewalOrders: renewalOrders.length,
    attempts: attempts.length,
    incomplete,
  };
}

/**
 * Additive UI modernization dataset: 50 patients, each with one parent
 * SUBSCRIPTION_INITIAL order, one ACTIVE subscription, and one renewal
 * order/attempt created from that ACTIVE subscription.
 *
 * Idempotent by email / orderNumber / subscriptionNumber.
 * Does not delete existing records.
 */
export async function seedDevUiModernizationDataset(
  prisma: PrismaClient,
): Promise<void> {
  assertDevEnvironment();

  const password =
    process.env.SEED_DEV_DATASET_PASSWORD?.trim() ||
    process.env.SEED_DEMO_PATIENT_PASSWORD?.trim();
  if (!password || password.length < 12) {
    throw new Error(
      'SEED_DEV_DATASET_PASSWORD (or SEED_DEMO_PATIENT_PASSWORD) ≥12 chars is required.',
    );
  }

  const patientRole = await prisma.role.findUnique({
    where: { code: Roles.PATIENT },
  });
  if (!patientRole) {
    throw new Error('Patient role missing; run the canonical RBAC seed first.');
  }

  console.log('Seeding additive UI modernization dataset (50 user chains)…');
  const catalog = await ensureSubscriptionCatalog(prisma);
  const passwordHash = await hashPassword(password);
  const actor =
    (await prisma.user.findFirst({
      where: { email: 'operations@example.com', deletedAt: null },
      select: { id: true },
    })) ??
    (await prisma.user.findFirst({
      where: { email: 'support@example.com', deletedAt: null },
      select: { id: true },
    }));

  const now = new Date(Date.UTC(2026, 8, 20, 12, 0, 0));
  let created = 0;
  let skipped = 0;

  for (let i = 1; i <= UI_DATASET_COUNT; i++) {
    const result = await seedOneChain(
      prisma,
      catalog,
      passwordHash,
      patientRole.id,
      actor?.id ?? null,
      i,
      now,
    );
    if (result === 'skipped') skipped += 1;
    else created += 1;
  }

  const verification = await verifyDataset(prisma);
  console.log(
    `UI dataset: ${created} chains written, ${skipped} already complete.`,
  );
  console.log(
    `Verified: ${verification.users} users, ${verification.parentOrders} parent orders, ${verification.subscriptions} subscriptions, ${verification.renewalOrders} renewal orders, ${verification.attempts} renewal attempts.`,
  );
  if (verification.incomplete.length > 0) {
    throw new Error(
      `UI dataset verification failed:\n${verification.incomplete.join('\n')}`,
    );
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run the UI dataset seed.');
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    await seedDevUiModernizationDataset(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
