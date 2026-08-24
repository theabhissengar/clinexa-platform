import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  OrderType,
  Prisma,
  SubscriptionBillingInterval,
  SubscriptionClinicalRequirement,
  SubscriptionPlanStatus,
  SubscriptionRenewalAttemptStatus,
  SubscriptionStatus,
} from '../../../generated/prisma';

const SCHEMA_PATH = join(__dirname, '../../../prisma/schema.prisma');

function readSchema(): string {
  return readFileSync(SCHEMA_PATH, 'utf8');
}

describe('Subscriptions Prisma foundation (P14a)', () => {
  it('exposes the eight Subscription aggregate models', () => {
    expect(Prisma.ModelName.SubscriptionPlan).toBe('SubscriptionPlan');
    expect(Prisma.ModelName.Subscription).toBe('Subscription');
    expect(Prisma.ModelName.SubscriptionItem).toBe('SubscriptionItem');
    expect(Prisma.ModelName.SubscriptionRenewalAttempt).toBe(
      'SubscriptionRenewalAttempt',
    );
    expect(Prisma.ModelName.SubscriptionStatusHistory).toBe(
      'SubscriptionStatusHistory',
    );
    expect(Prisma.ModelName.SubscriptionChangeHistory).toBe(
      'SubscriptionChangeHistory',
    );
    expect(Prisma.ModelName.SubscriptionActivity).toBe('SubscriptionActivity');
    expect(Prisma.ModelName.SubscriptionNote).toBe('SubscriptionNote');
  });

  it('keeps lifecycle separate from payment, renewal-attempt, and clinical dimensions', () => {
    expect(Object.values(SubscriptionStatus)).toEqual([
      'PENDING_SETUP',
      'ACTIVE',
      'PAUSED',
      'PAST_DUE',
      'CANCELLED',
      'EXPIRED',
      'COMPLETED',
    ]);
    expect(Object.values(SubscriptionStatus)).not.toContain('RENEWING');
    expect(Object.values(SubscriptionStatus)).not.toContain(
      'REASSESSMENT_REQUIRED',
    );

    expect(Object.values(SubscriptionClinicalRequirement)).toEqual([
      'NONE',
      'REASSESSMENT_REQUIRED',
      'DECLINED_HOLD',
    ]);

    expect(Object.values(SubscriptionRenewalAttemptStatus)).toEqual([
      'PENDING',
      'PROCESSING',
      'SUCCEEDED',
      'FAILED',
      'SKIPPED',
      'CANCELLED',
    ]);
  });

  it('preserves OrderType subscription classifications', () => {
    expect(OrderType.SUBSCRIPTION_INITIAL).toBe('SUBSCRIPTION_INITIAL');
    expect(OrderType.SUBSCRIPTION_RENEWAL).toBe('SUBSCRIPTION_RENEWAL');
    expect(OrderType.ONE_TIME).toBe('ONE_TIME');
  });

  it('models plan interval, pricing, bindings, grace, and reassessment configuration', () => {
    expect(Object.values(SubscriptionPlanStatus)).toEqual([
      'DRAFT',
      'PUBLISHED',
      'UNPUBLISHED',
      'ARCHIVED',
    ]);
    expect(Object.values(SubscriptionBillingInterval)).toEqual([
      'WEEK',
      'MONTH',
      'QUARTER',
      'YEAR',
      'CUSTOM',
    ]);

    const schema = readSchema();
    expect(schema).toContain('productBindings Json');
    expect(schema).toContain('gracePeriodDays');
    expect(schema).toContain('requiresReassessment');
    expect(schema).toContain('reassessmentIntervalCycles');
    expect(schema).toContain('priceCents');
  });

  it('enforces UNIQUE(subscriptionId, billingPeriodKey) for renewal idempotency', () => {
    const schema = readSchema();
    const attemptBlock = schema.slice(
      schema.indexOf('model SubscriptionRenewalAttempt'),
      schema.indexOf('model SubscriptionStatusHistory'),
    );
    expect(attemptBlock).toContain(
      '@@unique([subscriptionId, billingPeriodKey])',
    );

    const migration = readFileSync(
      join(
        __dirname,
        '../../../prisma/migrations/20260824120000_subscriptions_platform_module_foundation/migration.sql',
      ),
      'utf8',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "subscription_renewal_attempts_subscription_id_billing_period_key_key"',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT',
    );
  });

  it('wires Order, User, Product, and Variant relations with Restrict where required', () => {
    const schema = readSchema();

    expect(schema).toContain(
      '@relation("OrderSubscription", fields: [subscriptionId], references: [id], onDelete: Restrict)',
    );
    expect(schema).toContain(
      '@relation(fields: [patientUserId], references: [id], onDelete: Restrict)',
    );

    const itemBlock = schema.slice(
      schema.indexOf('model SubscriptionItem'),
      schema.indexOf('model SubscriptionRenewalAttempt'),
    );
    expect(itemBlock).toContain('productName');
    expect(itemBlock).toContain('sku');
    expect(itemBlock).toContain('productType');
    expect(itemBlock).toContain('unitPriceCents');
    expect(itemBlock).toContain('salePriceCents');
    expect(itemBlock).toContain('catalogMetadata');
    expect(itemBlock).toContain(
      '@relation(fields: [productId], references: [id], onDelete: Restrict)',
    );
    expect(itemBlock).toContain(
      '@relation(fields: [variantId], references: [id], onDelete: Restrict)',
    );
  });

  it('stores Class D deletedAt/archivedAt on Subscription and SubscriptionPlan', () => {
    const schema = readSchema();
    const subscriptionBlock = schema.slice(
      schema.indexOf('model Subscription {'),
      schema.indexOf('model SubscriptionItem'),
    );
    expect(subscriptionBlock).toContain('deletedAt');
    expect(subscriptionBlock).toContain('archivedAt');

    const planBlock = schema.slice(
      schema.indexOf('model SubscriptionPlan'),
      schema.indexOf('model Subscription {'),
    );
    expect(planBlock).toContain('deletedAt');
    expect(planBlock).toContain('archivedAt');
  });
});
