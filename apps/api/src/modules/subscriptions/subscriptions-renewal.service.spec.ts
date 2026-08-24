import { BadRequestException } from '@nestjs/common';
import {
  SubscriptionRenewalAttemptStatus,
  SubscriptionStatus,
} from '../../../generated/prisma';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { SubscriptionsLifecycleService } from './subscriptions-lifecycle.service';
import { SubscriptionsRenewalService } from './subscriptions-renewal.service';
import { SubscriptionsScheduleService } from './subscriptions-schedule.service';

describe('SubscriptionsRenewalService', () => {
  const now = new Date('2026-03-01T00:00:00.000Z');
  const periodEnd = new Date('2026-03-01T00:00:00.000Z');
  const subscription = {
    id: 'sub-1',
    patientUserId: 'user-1',
    status: SubscriptionStatus.ACTIVE,
    nextRenewalAt: periodEnd,
    currentPeriodEnd: periodEnd,
    deletedAt: null,
    archivedAt: null,
    items: [
      {
        productId: 'p1',
        variantId: 'v1',
        productName: 'Therapy A',
        sku: 'SKU-1',
        productType: 'SIMPLE_SUBSCRIPTION',
        isRxEligible: false,
        catalogMetadata: { brandName: 'Clinexa' },
        quantity: 1,
        unitPriceCents: 5000,
        salePriceCents: 5000,
        currency: 'USD',
      },
    ],
    plan: {},
  };

  function build() {
    const attemptRow = {
      id: 'att-1',
      subscriptionId: 'sub-1',
      billingPeriodKey: 'sub-1:2026-03-01',
      status: SubscriptionRenewalAttemptStatus.PENDING,
      orderId: null,
      retryCount: 0,
      actorUserId: null,
    };
    const tx = {
      subscription: {
        findUnique: jest.fn().mockResolvedValue(subscription),
        update: jest.fn().mockResolvedValue(subscription),
      },
      subscriptionRenewalAttempt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(attemptRow),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: object }) =>
            Promise.resolve({ ...attemptRow, ...data }),
          ),
      },
      subscriptionActivity: { create: jest.fn().mockResolvedValue({}) },
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
      subscriptionRenewalAttempt: tx.subscriptionRenewalAttempt,
    };
    const service = new SubscriptionsRenewalService(
      prisma as unknown as PrismaService,
      new SubscriptionsLifecycleService(),
      new SubscriptionsScheduleService(),
    );
    return { service, tx, prisma, attemptRow };
  }

  it('treats only ACTIVE non-deleted rows with nextRenewalAt <= now as auto-due', () => {
    const { service } = build();
    expect(service.isAutoDue(subscription, now)).toBe(true);
    expect(
      service.isAutoDue(
        { ...subscription, status: SubscriptionStatus.PAUSED },
        now,
      ),
    ).toBe(false);
    expect(
      service.isAutoDue(
        { ...subscription, status: SubscriptionStatus.PAST_DUE },
        now,
      ),
    ).toBe(false);
    expect(
      service.isAutoDue({ ...subscription, deletedAt: new Date() }, now),
    ).toBe(false);
  });

  it('creates the first attempt and returns snapshot-based order request', async () => {
    const { service, tx } = build();
    const result = await service.openRenewalAttempt({
      subscriptionId: 'sub-1',
      mode: 'auto',
      source: 'system',
      now,
    });
    expect(tx.subscriptionRenewalAttempt.create).toHaveBeenCalled();
    expect(result.billingPeriodKey).toBe('sub-1:2026-03-01');
    expect(result.orderRequest.lines[0].productName).toBe('Therapy A');
    expect(result.orderRequest.orderType).toBe('SUBSCRIPTION_RENEWAL');
  });

  it('reuses an existing attempt for the same period (idempotent)', async () => {
    const { service, tx, attemptRow } = build();
    tx.subscriptionRenewalAttempt.findUnique.mockResolvedValue({
      ...attemptRow,
      orderId: 'ord-1',
      status: SubscriptionRenewalAttemptStatus.PROCESSING,
    });
    const result = await service.openRenewalAttempt({
      subscriptionId: 'sub-1',
      mode: 'auto',
      source: 'system',
      now,
    });
    expect(tx.subscriptionRenewalAttempt.create).not.toHaveBeenCalled();
    expect(result.created).toBe(false);
    expect(result.attempt.orderId).toBe('ord-1');
  });

  it('handles unique-constraint races by loading the existing attempt', async () => {
    const { service, tx, attemptRow } = build();
    tx.subscriptionRenewalAttempt.create.mockRejectedValue({ code: 'P2002' });
    tx.subscriptionRenewalAttempt.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(attemptRow);
    const ensured = await service.ensureAttempt({
      subscriptionId: 'sub-1',
      billingPeriodKey: 'sub-1:2026-03-01',
      source: 'system',
      tx: tx as never,
    });
    expect(ensured.created).toBe(false);
    expect(ensured.attempt.id).toBe('att-1');
  });

  it('rejects auto renewal when not due', async () => {
    const { service, tx } = build();
    tx.subscription.findUnique.mockResolvedValue({
      ...subscription,
      nextRenewalAt: new Date('2026-12-01T00:00:00.000Z'),
    });
    await expect(
      service.openRenewalAttempt({
        subscriptionId: 'sub-1',
        mode: 'auto',
        source: 'system',
        now,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records order refs on the attempt without mutating Order rows', async () => {
    const { service, tx } = build();
    tx.subscriptionRenewalAttempt.findUnique.mockResolvedValue({
      id: 'att-1',
      orderId: null,
    });
    tx.order.findUnique.mockResolvedValue({
      id: 'ord-9',
      orderNumber: 'ORD-9',
      subscriptionId: 'sub-1',
      deletedAt: null,
    });
    await service.attachRenewalOrder({
      subscriptionId: 'sub-1',
      billingPeriodKey: 'sub-1:2026-03-01',
      orderId: 'ord-9',
      source: 'system',
    });
    expect(tx.subscriptionRenewalAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { orderId: 'ord-9' },
      }),
    );
    expect(tx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { latestOrderId: 'ord-9' },
      }),
    );
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('increments retryCount on retry without minting a new period key', async () => {
    const { service, tx, attemptRow } = build();
    tx.subscriptionRenewalAttempt.findUnique.mockResolvedValue({
      ...attemptRow,
      status: SubscriptionRenewalAttemptStatus.FAILED,
      retryCount: 1,
    });
    const result = await service.openRenewalAttempt({
      subscriptionId: 'sub-1',
      mode: 'retry',
      source: 'crm',
      now,
    });
    expect(result.billingPeriodKey).toBe('sub-1:2026-03-01');
    expect(tx.subscriptionRenewalAttempt.update).toHaveBeenCalled();
    expect(tx.subscriptionRenewalAttempt.create).not.toHaveBeenCalled();
  });
});
