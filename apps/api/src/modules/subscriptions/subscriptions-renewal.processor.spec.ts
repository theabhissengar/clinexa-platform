import { BadRequestException } from '@nestjs/common';
import {
  OrderStatus,
  PaymentLifecycleState,
  PaymentStatus,
  SubscriptionRenewalAttemptStatus,
  SubscriptionStatus,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { SubscriptionsRenewalProcessor } from './subscriptions-renewal.processor';

describe('SubscriptionsRenewalProcessor', () => {
  const billingPeriodKey = 'sub-1:2026-03-01';
  const attemptBase = {
    id: 'att-1',
    billingPeriodKey,
    status: SubscriptionRenewalAttemptStatus.PENDING,
    orderId: null as string | null,
    paymentId: null as string | null,
  };

  const subscriptionBase = {
    id: 'sub-1',
    patientUserId: 'user-1',
    paymentMethodId: 'spm-1',
    customerFirstName: 'Pat',
    customerLastName: 'ient',
    customerEmail: 'p@example.com',
    customerPhone: null,
    status: SubscriptionStatus.ACTIVE,
    currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
    cycleNumber: 1,
    plan: {
      billingInterval: 'MONTH',
      intervalCount: 1,
      customIntervalDays: null,
    },
  };

  function build(overrides?: {
    attempt?: Partial<typeof attemptBase>;
    order?: Record<string, unknown> | null;
    auth?: Record<string, unknown>;
    capture?: Record<string, unknown>;
    addressError?: boolean;
  }) {
    const attempt = { ...attemptBase, ...overrides?.attempt };
    const order =
      overrides?.order === null
        ? null
        : {
            id: 'ord-1',
            totalCents: 5000,
            currency: 'USD',
            isRxOrder: false,
            status: OrderStatus.PAYMENT_PENDING,
            ...(overrides?.order ?? {}),
          };

    const prisma = {
      order: {
        findUnique: jest.fn(() => Promise.resolve(order)),
      },
      subscription: {
        findUnique: jest.fn(() => Promise.resolve({ ...subscriptionBase })),
      },
      subscriptionRenewalAttempt: {
        findUnique: jest.fn(() => Promise.resolve(attempt)),
        findFirst: jest.fn(() => Promise.resolve(attempt)),
      },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          subscription: { update: jest.fn() },
          subscriptionStatusHistory: { create: jest.fn() },
          subscriptionRenewalAttempt: { update: jest.fn() },
          subscriptionActivity: { create: jest.fn() },
        };
        return fn(tx);
      }),
      $queryRaw: jest.fn(() => Promise.resolve([])),
    };

    const renewal = {
      openRenewalAttempt: jest.fn(() =>
        Promise.resolve({
          billingPeriodKey,
          attempt,
          subscription: subscriptionBase,
          orderRequest: {
            lines: [
              {
                productId: 'p1',
                variantId: 'v1',
                productName: 'Therapy',
                sku: 'SKU',
                productType: 'SIMPLE',
                quantity: 1,
                unitPriceCents: 5000,
                salePriceCents: 5000,
                isRxEligible: false,
              },
            ],
          },
        }),
      ),
      attachRenewalOrder: jest.fn(),
      markAttemptOutcome: jest.fn(),
    };

    const schedule = {
      advancePeriod: jest.fn(() => ({
        currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
        nextRenewalAt: new Date('2026-04-01T00:00:00.000Z'),
        cycleNumber: 2,
      })),
    };

    const orders = {
      createOrderFromSnapshots: jest.fn(() => Promise.resolve({ id: 'ord-1' })),
      transitionOrder: jest.fn(),
    };

    const payments = {
      authorizeForOrder: jest.fn(() =>
        Promise.resolve({
          paymentId: 'pay-1',
          status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
          lifecycleState: PaymentLifecycleState.AUTHORIZED,
          paymentStatusSummary: 'authorized_or_captured',
          ...(overrides?.auth ?? {}),
        }),
      ),
      capturePayment: jest.fn(() =>
        Promise.resolve({
          paymentId: 'pay-1',
          status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
          lifecycleState: PaymentLifecycleState.CAPTURED,
          paymentStatusSummary: 'authorized_or_captured',
          ...(overrides?.capture ?? {}),
        }),
      ),
      findLatestForOrder: jest.fn(),
    };

    const addresses = {
      resolve: jest.fn(() => {
        if (overrides?.addressError) {
          return Promise.reject(
            new BadRequestException({
              code: ErrorCodes.VAL_MISSING_FIELD,
              message: 'Address required',
            }),
          );
        }
        return Promise.resolve({
          shipping: { line1: '1 Main', city: 'Austin', country: 'US' },
          billing: { line1: '1 Main', city: 'Austin', country: 'US' },
        });
      }),
    };

    const subscriptions = {
      recordPaymentSnapshot: jest.fn(),
      markPastDue: jest.fn(),
      notify: jest.fn(),
      setClinicalRequirement: jest.fn(),
    };

    const processor = new SubscriptionsRenewalProcessor(
      prisma as never,
      subscriptions as never,
      renewal as never,
      schedule as never,
      orders as never,
      payments as never,
      addresses as never,
    );

    return {
      processor,
      prisma,
      renewal,
      schedule,
      orders,
      payments,
      addresses,
      subscriptions,
    };
  }

  it('authorization failure marks PAST_DUE and does not advance period', async () => {
    const { processor, payments, subscriptions, schedule, renewal } = build({
      auth: {
        status: PaymentStatus.FAILED,
        lifecycleState: PaymentLifecycleState.AUTHORIZATION_FAILED,
        paymentStatusSummary: 'failed',
      },
    });

    const result = await processor.processSubscription({
      subscriptionId: 'sub-1',
      mode: 'auto',
      source: 'system',
    });

    expect(result.outcome).toBe('authorization_failed');
    expect(payments.capturePayment).not.toHaveBeenCalled();
    expect(schedule.advancePeriod).not.toHaveBeenCalled();
    expect(subscriptions.markPastDue).toHaveBeenCalled();
    expect(renewal.markAttemptOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        status: SubscriptionRenewalAttemptStatus.FAILED,
      }),
    );
  });

  it('non-Rx capture success advances the period once', async () => {
    const { processor, schedule, subscriptions, orders } = build();

    const result = await processor.processSubscription({
      subscriptionId: 'sub-1',
      mode: 'manual',
      source: 'crm',
      actorUserId: 'staff-1',
    });

    expect(result.outcome).toBe('succeeded');
    expect(schedule.advancePeriod).toHaveBeenCalledTimes(1);
    expect(subscriptions.notify).toHaveBeenCalledWith(
      'subscription.renewed',
      'sub-1',
    );
    expect(orders.transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        toStatus: OrderStatus.AWAITING_FULFILLMENT,
      }),
    );
  });

  it('Rx authorize does not capture or advance the period', async () => {
    const { processor, payments, schedule, orders } = build({
      order: { isRxOrder: true },
    });

    const result = await processor.processSubscription({
      subscriptionId: 'sub-1',
      mode: 'auto',
      source: 'system',
    });

    expect(result.outcome).toBe('authorized_awaiting_clinical');
    expect(payments.capturePayment).not.toHaveBeenCalled();
    expect(schedule.advancePeriod).not.toHaveBeenCalled();
    expect(orders.transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        toStatus: OrderStatus.AWAITING_CLINICAL_REVIEW,
      }),
    );
  });

  it('missing address fails without PAST_DUE or charge', async () => {
    const { processor, payments, subscriptions, orders } = build({
      addressError: true,
    });

    const result = await processor.processSubscription({
      subscriptionId: 'sub-1',
      mode: 'auto',
      source: 'system',
    });

    expect(result.outcome).toBe('address_missing');
    expect(orders.createOrderFromSnapshots).not.toHaveBeenCalled();
    expect(payments.authorizeForOrder).not.toHaveBeenCalled();
    expect(subscriptions.markPastDue).not.toHaveBeenCalled();
  });

  it('missing payment method fails authorization path to PAST_DUE', async () => {
    const { processor, prisma, subscriptions, payments } = build();
    prisma.subscription.findUnique.mockResolvedValue({
      ...subscriptionBase,
      paymentMethodId: null,
    });

    const result = await processor.processSubscription({
      subscriptionId: 'sub-1',
      mode: 'auto',
      source: 'system',
    });

    expect(result.outcome).toBe('method_missing');
    expect(payments.authorizeForOrder).not.toHaveBeenCalled();
    expect(subscriptions.markPastDue).toHaveBeenCalled();
  });

  it('clinical decline sets DECLINED_HOLD and does not mark PAST_DUE', async () => {
    const { processor, subscriptions, renewal } = build({
      attempt: {
        orderId: 'ord-1',
        status: SubscriptionRenewalAttemptStatus.PROCESSING,
      },
    });

    await processor.onClinicalDecline({
      orderId: 'ord-1',
      subscriptionId: 'sub-1',
    });

    expect(subscriptions.setClinicalRequirement).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicalRequirement: 'DECLINED_HOLD',
      }),
    );
    expect(subscriptions.markPastDue).not.toHaveBeenCalled();
    expect(renewal.markAttemptOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        status: SubscriptionRenewalAttemptStatus.FAILED,
      }),
    );
  });

  it('idempotent short-circuit when attempt already succeeded', async () => {
    const { processor, payments, schedule } = build({
      attempt: {
        status: SubscriptionRenewalAttemptStatus.SUCCEEDED,
        orderId: 'ord-1',
        paymentId: 'pay-1',
      },
    });

    const result = await processor.processSubscription({
      subscriptionId: 'sub-1',
      mode: 'retry',
      source: 'crm',
    });

    expect(result.outcome).toBe('succeeded');
    expect(payments.authorizeForOrder).not.toHaveBeenCalled();
    expect(schedule.advancePeriod).not.toHaveBeenCalled();
  });
});
