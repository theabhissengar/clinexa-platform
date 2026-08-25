import { randomUUID } from 'crypto';

import {
  ProductType,
  SubscriptionBillingInterval,
  SubscriptionClinicalRequirement,
  SubscriptionPlanStatus,
  SubscriptionRenewalAttemptStatus,
  SubscriptionStatus,
  type PrismaClient,
} from '../generated/prisma';
import { patientEmail } from './data/dev-orders-dataset';

const PLAN_MONTHLY_SLUG = 'seed-monthly-weight';
const PLAN_QUARTERLY_SLUG = 'seed-quarterly-skin';
const PLAN_DRAFT_SLUG = 'seed-draft-hair';
const SUB_NUMBER_PREFIX = 'SUB-SEED-';

function isEnabledFlag(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === 'true' || v === '1';
}

function assertDevEnvironment(): void {
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  if (nodeEnv === 'production') {
    throw new Error('SEED_DEV_DATASET cannot run when NODE_ENV=production.');
  }
}

async function ensureSubscriptionCatalog(prisma: PrismaClient) {
  const weightCategory = await prisma.category.findUnique({
    where: { slug: 'weight-management' },
  });
  const skinCategory = await prisma.category.findUnique({
    where: { slug: 'skincare' },
  });

  const weightProduct = await prisma.product.upsert({
    where: { slug: 'demo-weight-subscription' },
    create: {
      id: randomUUID(),
      name: 'Demo Weight Subscription',
      slug: 'demo-weight-subscription',
      description: 'Seed SIMPLE_SUBSCRIPTION product for CRM Subscriptions.',
      isRxEligible: true,
      productType: ProductType.SIMPLE_SUBSCRIPTION,
      lifecycleStatus: 'PUBLISHED',
      tags: ['demo', 'seed', 'subscriptions-dataset'],
    },
    update: {
      productType: ProductType.SIMPLE_SUBSCRIPTION,
      lifecycleStatus: 'PUBLISHED',
      deletedAt: null,
    },
  });
  let weightVariant = await prisma.productVariant.findFirst({
    where: { sku: 'DEMO-WEIGHT-SUB-30' },
  });
  if (!weightVariant) {
    weightVariant = await prisma.productVariant.create({
      data: {
        id: randomUUID(),
        productId: weightProduct.id,
        sku: 'DEMO-WEIGHT-SUB-30',
        label: '30-day supply',
        priceCents: 19900,
        salePriceCents: 17900,
        currency: 'USD',
        isFulfillable: true,
      },
    });
  }
  if (weightCategory) {
    await prisma.productCategoryLink.upsert({
      where: {
        productId_categoryId: {
          productId: weightProduct.id,
          categoryId: weightCategory.id,
        },
      },
      create: {
        id: randomUUID(),
        productId: weightProduct.id,
        categoryId: weightCategory.id,
      },
      update: {},
    });
  }

  const skinProduct = await prisma.product.upsert({
    where: { slug: 'demo-skin-subscription' },
    create: {
      id: randomUUID(),
      name: 'Demo Skin Subscription',
      slug: 'demo-skin-subscription',
      description: 'Seed SIMPLE_SUBSCRIPTION product for CRM Subscriptions.',
      isRxEligible: false,
      productType: ProductType.SIMPLE_SUBSCRIPTION,
      lifecycleStatus: 'PUBLISHED',
      tags: ['demo', 'seed', 'subscriptions-dataset'],
    },
    update: {
      productType: ProductType.SIMPLE_SUBSCRIPTION,
      lifecycleStatus: 'PUBLISHED',
      deletedAt: null,
    },
  });
  let skinVariant = await prisma.productVariant.findFirst({
    where: { sku: 'DEMO-SKIN-SUB-50' },
  });
  if (!skinVariant) {
    skinVariant = await prisma.productVariant.create({
      data: {
        id: randomUUID(),
        productId: skinProduct.id,
        sku: 'DEMO-SKIN-SUB-50',
        label: '50 ml monthly',
        priceCents: 4900,
        currency: 'USD',
        isFulfillable: true,
      },
    });
  }
  if (skinCategory) {
    await prisma.productCategoryLink.upsert({
      where: {
        productId_categoryId: {
          productId: skinProduct.id,
          categoryId: skinCategory.id,
        },
      },
      create: {
        id: randomUUID(),
        productId: skinProduct.id,
        categoryId: skinCategory.id,
      },
      update: {},
    });
  }

  const monthly = await prisma.subscriptionPlan.upsert({
    where: { slug: PLAN_MONTHLY_SLUG },
    create: {
      id: randomUUID(),
      name: 'Monthly Weight Program',
      slug: PLAN_MONTHLY_SLUG,
      description: 'Seed monthly plan.',
      lifecycleStatus: SubscriptionPlanStatus.PUBLISHED,
      billingInterval: SubscriptionBillingInterval.MONTH,
      intervalCount: 1,
      currency: 'USD',
      priceCents: 17900,
      productBindings: [
        {
          productId: weightProduct.id,
          variantId: weightVariant.id,
          quantity: 1,
        },
      ],
      gracePeriodDays: 3,
    },
    update: {
      lifecycleStatus: SubscriptionPlanStatus.PUBLISHED,
      deletedAt: null,
      archivedAt: null,
      productBindings: [
        {
          productId: weightProduct.id,
          variantId: weightVariant.id,
          quantity: 1,
        },
      ],
    },
  });

  const quarterly = await prisma.subscriptionPlan.upsert({
    where: { slug: PLAN_QUARTERLY_SLUG },
    create: {
      id: randomUUID(),
      name: 'Quarterly Skin Care',
      slug: PLAN_QUARTERLY_SLUG,
      description: 'Seed quarterly plan.',
      lifecycleStatus: SubscriptionPlanStatus.PUBLISHED,
      billingInterval: SubscriptionBillingInterval.QUARTER,
      intervalCount: 1,
      currency: 'USD',
      priceCents: 12900,
      productBindings: [
        {
          productId: skinProduct.id,
          variantId: skinVariant.id,
          quantity: 1,
        },
      ],
      gracePeriodDays: 5,
    },
    update: {
      lifecycleStatus: SubscriptionPlanStatus.PUBLISHED,
      deletedAt: null,
      archivedAt: null,
      productBindings: [
        {
          productId: skinProduct.id,
          variantId: skinVariant.id,
          quantity: 1,
        },
      ],
    },
  });

  const draft = await prisma.subscriptionPlan.upsert({
    where: { slug: PLAN_DRAFT_SLUG },
    create: {
      id: randomUUID(),
      name: 'Draft Hair Program',
      slug: PLAN_DRAFT_SLUG,
      description: 'Seed draft plan (not bindable until published).',
      lifecycleStatus: SubscriptionPlanStatus.DRAFT,
      billingInterval: SubscriptionBillingInterval.WEEK,
      intervalCount: 1,
      currency: 'USD',
      priceCents: 2900,
      productBindings: [
        {
          productId: skinProduct.id,
          variantId: skinVariant.id,
          quantity: 1,
        },
      ],
      gracePeriodDays: 0,
    },
    update: {
      lifecycleStatus: SubscriptionPlanStatus.DRAFT,
      deletedAt: null,
      archivedAt: null,
    },
  });

  return {
    monthly,
    quarterly,
    draft,
    weight: { product: weightProduct, variant: weightVariant },
    skin: { product: skinProduct, variant: skinVariant },
  };
}

type SeedSpec = {
  index: number;
  status: SubscriptionStatus;
  plan: 'monthly' | 'quarterly';
  cycleNumber: number;
  clinical: SubscriptionClinicalRequirement;
  paymentStatusSummary: string | null;
  attempt?: SubscriptionRenewalAttemptStatus;
};

const SPECS: SeedSpec[] = [
  { index: 1, status: SubscriptionStatus.ACTIVE, plan: 'monthly', cycleNumber: 3, clinical: SubscriptionClinicalRequirement.NONE, paymentStatusSummary: 'authorized_or_captured' },
  { index: 2, status: SubscriptionStatus.ACTIVE, plan: 'quarterly', cycleNumber: 2, clinical: SubscriptionClinicalRequirement.NONE, paymentStatusSummary: 'authorized_or_captured' },
  { index: 3, status: SubscriptionStatus.PAUSED, plan: 'monthly', cycleNumber: 4, clinical: SubscriptionClinicalRequirement.NONE, paymentStatusSummary: 'authorized_or_captured' },
  { index: 4, status: SubscriptionStatus.PAST_DUE, plan: 'monthly', cycleNumber: 5, clinical: SubscriptionClinicalRequirement.NONE, paymentStatusSummary: 'failed', attempt: SubscriptionRenewalAttemptStatus.FAILED },
  { index: 5, status: SubscriptionStatus.CANCELLED, plan: 'quarterly', cycleNumber: 1, clinical: SubscriptionClinicalRequirement.NONE, paymentStatusSummary: 'authorized_or_captured' },
  { index: 6, status: SubscriptionStatus.EXPIRED, plan: 'monthly', cycleNumber: 12, clinical: SubscriptionClinicalRequirement.NONE, paymentStatusSummary: 'authorized_or_captured' },
  { index: 7, status: SubscriptionStatus.COMPLETED, plan: 'quarterly', cycleNumber: 8, clinical: SubscriptionClinicalRequirement.NONE, paymentStatusSummary: 'authorized_or_captured' },
  { index: 8, status: SubscriptionStatus.PENDING_SETUP, plan: 'monthly', cycleNumber: 0, clinical: SubscriptionClinicalRequirement.NONE, paymentStatusSummary: 'pending' },
  { index: 9, status: SubscriptionStatus.ACTIVE, plan: 'monthly', cycleNumber: 1, clinical: SubscriptionClinicalRequirement.REASSESSMENT_REQUIRED, paymentStatusSummary: 'authorized_or_captured' },
  { index: 10, status: SubscriptionStatus.ACTIVE, plan: 'quarterly', cycleNumber: 6, clinical: SubscriptionClinicalRequirement.DECLINED_HOLD, paymentStatusSummary: 'authorized_or_captured', attempt: SubscriptionRenewalAttemptStatus.SKIPPED },
];

async function seedClassDExamples(
  prisma: PrismaClient,
  catalog: Awaited<ReturnType<typeof ensureSubscriptionCatalog>>,
  now: Date,
): Promise<void> {
  const extras: Array<{
    index: number;
    archivedAt: Date | null;
    deletedAt: Date | null;
  }> = [
    { index: 11, archivedAt: now, deletedAt: null },
    { index: 12, archivedAt: null, deletedAt: now },
  ];

  for (const extra of extras) {
    const patientIndex = extra.index === 11 ? 1 : 2;
    const patient = await prisma.user.findUnique({
      where: { email: patientEmail(patientIndex) },
    });
    if (!patient) continue;

    const planRow = extra.index === 11 ? catalog.monthly : catalog.quarterly;
    const productRow = extra.index === 11 ? catalog.weight : catalog.skin;
    const periodEnd = new Date(now.getTime() + extra.index * 86_400_000 * 7);
    const periodStart = new Date(periodEnd.getTime() - 30 * 86_400_000);

    await prisma.subscription.create({
      data: {
        id: randomUUID(),
        subscriptionNumber: `${SUB_NUMBER_PREFIX}${String(extra.index).padStart(3, '0')}`,
        patientUserId: patient.id,
        planId: planRow.id,
        status: SubscriptionStatus.CANCELLED,
        cycleNumber: 1,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextRenewalAt: null,
        customerFirstName: patient.firstName,
        customerLastName: patient.lastName,
        customerEmail: patient.email,
        customerPhone: patient.phone,
        archivedAt: extra.archivedAt,
        deletedAt: extra.deletedAt,
        adminTags: { seed: extra.index === 11 ? 'archived' : 'deleted' },
        items: {
          create: {
            id: randomUUID(),
            productId: productRow.product.id,
            variantId: productRow.variant.id,
            productName: productRow.product.name,
            sku: productRow.variant.sku,
            productType: productRow.product.productType,
            isRxEligible: productRow.product.isRxEligible,
            catalogMetadata: {},
            quantity: 1,
            unitPriceCents: productRow.variant.priceCents,
            salePriceCents:
              productRow.variant.salePriceCents ??
              productRow.variant.priceCents,
            currency: 'USD',
          },
        },
        statusHistory: {
          create: {
            id: randomUUID(),
            fromStatus: null,
            toStatus: SubscriptionStatus.CANCELLED,
            source: 'system',
            reason: 'dev_seed_class_d',
          },
        },
        activities: {
          create: {
            id: randomUUID(),
            kind: extra.archivedAt
              ? 'subscription_archived'
              : 'subscription_soft_deleted',
            summary: extra.archivedAt
              ? 'Seeded archived subscription'
              : 'Seeded soft-deleted subscription',
            metadata: { seed: true, classD: true },
          },
        },
      },
    });
  }
}

/**
 * Optional CRM Subscriptions development dataset.
 * Shares SEED_DEV_DATASET with Orders so patients already exist.
 */
export async function seedDevSubscriptionsDataset(
  prisma: PrismaClient,
): Promise<void> {
  if (!isEnabledFlag(process.env.SEED_DEV_DATASET)) {
    console.log(
      'Dev Subscriptions dataset skipped: enable SEED_DEV_DATASET with the Orders dataset.',
    );
    return;
  }

  assertDevEnvironment();
  console.log('Seeding development Subscriptions dataset…');

  const catalog = await ensureSubscriptionCatalog(prisma);

  // Clear Order FKs before deleting seed subscriptions (orders.subscription_id Restrict).
  const priorSubs = await prisma.subscription.findMany({
    where: { subscriptionNumber: { startsWith: SUB_NUMBER_PREFIX } },
    select: { id: true },
  });
  if (priorSubs.length > 0) {
    const ids = priorSubs.map((s) => s.id);
    await prisma.order.updateMany({
      where: { subscriptionId: { in: ids } },
      data: { subscriptionId: null },
    });
    await prisma.subscriptionRenewalAttempt.deleteMany({
      where: { subscriptionId: { in: ids } },
    });
  }

  await prisma.subscription.deleteMany({
    where: { subscriptionNumber: { startsWith: SUB_NUMBER_PREFIX } },
  });

  const now = new Date(Date.UTC(2026, 7, 24, 12, 0, 0));

  for (const spec of SPECS) {
    const patient = await prisma.user.findUnique({
      where: { email: patientEmail(spec.index) },
    });
    if (!patient) {
      console.log(
        `Skipping ${SUB_NUMBER_PREFIX}${spec.index}: patient ${patientEmail(spec.index)} not found.`,
      );
      continue;
    }

    const planRow =
      spec.plan === 'monthly' ? catalog.monthly : catalog.quarterly;
    const productRow =
      spec.plan === 'monthly' ? catalog.weight : catalog.skin;
    const periodEnd = new Date(now.getTime() + spec.index * 86_400_000 * 7);
    const periodStart = new Date(periodEnd.getTime() - 30 * 86_400_000);
    const isPending = spec.status === SubscriptionStatus.PENDING_SETUP;

    const created = await prisma.subscription.create({
      data: {
        id: randomUUID(),
        subscriptionNumber: `${SUB_NUMBER_PREFIX}${String(spec.index).padStart(3, '0')}`,
        patientUserId: patient.id,
        planId: planRow.id,
        status: spec.status,
        cycleNumber: spec.cycleNumber,
        currentPeriodStart: isPending ? null : periodStart,
        currentPeriodEnd: isPending ? null : periodEnd,
        nextRenewalAt: isPending ? null : periodEnd,
        pausedAt:
          spec.status === SubscriptionStatus.PAUSED ? now : null,
        statusBeforePause:
          spec.status === SubscriptionStatus.PAUSED
            ? SubscriptionStatus.ACTIVE
            : null,
        customerFirstName: patient.firstName,
        customerLastName: patient.lastName,
        customerEmail: patient.email,
        customerPhone: patient.phone,
        paymentStatusSummary: spec.paymentStatusSummary,
        clinicalRequirement: spec.clinical,
        shippingPreferenceNotes:
          spec.index === 1 ? 'Leave at side door' : null,
        items: {
          create: {
            id: randomUUID(),
            productId: productRow.product.id,
            variantId: productRow.variant.id,
            productName: productRow.product.name,
            sku: productRow.variant.sku,
            productType: String(productRow.product.productType),
            isRxEligible: productRow.product.isRxEligible,
            quantity: 1,
            unitPriceCents: productRow.variant.priceCents,
            salePriceCents:
              productRow.variant.salePriceCents ??
              productRow.variant.priceCents,
            currency: 'USD',
          },
        },
        statusHistory: {
          create: {
            id: randomUUID(),
            fromStatus: null,
            toStatus: spec.status,
            source: 'system',
            reason: 'dev_seed',
          },
        },
        activities: {
          create: {
            id: randomUUID(),
            kind: 'subscription_seeded',
            summary: `Seeded ${spec.status}`,
            metadata: { seed: true },
          },
        },
        notes: {
          create: {
            id: randomUUID(),
            authorUserId: patient.id,
            body: `Seed note for ${spec.status} subscription.`,
          },
        },
      },
    });

    if (spec.attempt && created.currentPeriodEnd) {
      await prisma.subscriptionRenewalAttempt.create({
        data: {
          id: randomUUID(),
          subscriptionId: created.id,
          billingPeriodKey: `${created.id}:${created.currentPeriodEnd.toISOString().slice(0, 10)}`,
          status: spec.attempt,
          retryCount: spec.attempt === SubscriptionRenewalAttemptStatus.FAILED ? 1 : 0,
          source: 'system',
          paymentStatusSummary:
            spec.attempt === SubscriptionRenewalAttemptStatus.FAILED
              ? 'failed'
              : null,
        },
      });
    }
  }

  await seedClassDExamples(prisma, catalog, now);

  console.log(
    `Seeded ${SPECS.length} subscriptions (${SUB_NUMBER_PREFIX}*) plus archived/deleted Guardian examples.`,
  );
}
