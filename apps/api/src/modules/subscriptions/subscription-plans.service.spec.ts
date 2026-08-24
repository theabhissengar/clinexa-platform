import { BadRequestException } from '@nestjs/common';
import {
  SubscriptionBillingInterval,
  SubscriptionPlanStatus,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { SubscriptionPlansService } from './subscription-plans.service';
import { SubscriptionsScheduleService } from './subscriptions-schedule.service';
import { SubscriptionsSnapshotService } from './subscriptions-snapshot.service';

describe('SubscriptionPlansService', () => {
  const prisma = {
    subscriptionPlan: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    productVariant: {
      findUnique: jest.fn(),
    },
  };

  const snapshots = new SubscriptionsSnapshotService();
  const schedule = new SubscriptionsScheduleService();
  const service = new SubscriptionPlansService(
    prisma as never,
    snapshots,
    schedule,
  );

  const draft = {
    id: 'plan-1',
    name: 'Monthly',
    slug: 'monthly',
    lifecycleStatus: SubscriptionPlanStatus.DRAFT,
    billingInterval: SubscriptionBillingInterval.MONTH,
    intervalCount: 1,
    customIntervalDays: null,
    productBindings: [{ productId: 'p1', variantId: 'v1', quantity: 1 }],
    deletedAt: null,
    archivedAt: null,
    currency: 'USD',
    priceCents: 1000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a DRAFT plan', async () => {
    prisma.subscriptionPlan.create.mockResolvedValue({
      ...draft,
      lifecycleStatus: SubscriptionPlanStatus.DRAFT,
    });
    const created = await service.createPlan({
      name: 'Monthly',
      billingInterval: SubscriptionBillingInterval.MONTH,
      priceCents: 1000,
      productBindings: [{ productId: 'p1', variantId: 'v1', quantity: 1 }],
    });
    expect(created.lifecycleStatus).toBe(SubscriptionPlanStatus.DRAFT);
    expect(prisma.subscriptionPlan.create).toHaveBeenCalledWith({
      data: {
        name: 'Monthly',
        slug: 'monthly',
        description: null,
        lifecycleStatus: SubscriptionPlanStatus.DRAFT,
        billingInterval: SubscriptionBillingInterval.MONTH,
        intervalCount: 1,
        customIntervalDays: null,
        currency: 'USD',
        priceCents: 1000,
        productBindings: [{ productId: 'p1', variantId: 'v1', quantity: 1 }],
        gracePeriodDays: 0,
        requiresReassessment: false,
        reassessmentIntervalCycles: null,
      },
    });
  });

  it('refuses publish when catalog bindings are invalid', async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue(draft);
    prisma.productVariant.findUnique.mockResolvedValue(null);
    await expect(service.publish('plan-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    try {
      await service.publish('plan-1');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: ErrorCodes.SUB_PLAN_NOT_BINDABLE }),
      );
    }
  });

  it('publishes when bindings resolve to live catalog rows', async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue(draft);
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'v1',
      productId: 'p1',
      deletedAt: null,
      product: { id: 'p1', deletedAt: null },
    });
    prisma.subscriptionPlan.update.mockResolvedValue({
      ...draft,
      lifecycleStatus: SubscriptionPlanStatus.PUBLISHED,
    });
    const published = await service.publish('plan-1');
    expect(published.lifecycleStatus).toBe(SubscriptionPlanStatus.PUBLISHED);
  });
});
