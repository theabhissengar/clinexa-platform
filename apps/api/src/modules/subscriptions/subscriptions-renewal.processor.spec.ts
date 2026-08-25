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
    transitionError?: Error;
    dueIds?: string[];
    subscription?: Record<string, unknown>;
  }) {
    const attempt = { ...attemptBase, ...overrides?.attempt };
    const order =
      overrides?.order === null
        ? null
        : ({
            id: 'ord-1',
            totalCents: 5000,
            currency: 'USD',
            isRxOrder: false,
            status: OrderStatus.PAYMENT_PENDING,
            ...(overrides?.order ?? {}),
          } as {
            id: string;
            totalCents: number;
            currency: string;
            isRxOrder: boolean;
            status: OrderStatus;
            [key: string]: unknown;
          });

    const prisma = {
      order: {
        findUnique: jest.fn(() => Promise.resolve(order)),
      },
      subscription: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            ...subscriptionBase,
            clinicalRequirement: 'NONE',
            ...(overrides?.subscription ?? {}),
          }),
        ),
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
      $queryRaw: jest.fn(() =>
        Promise.resolve((overrides?.dueIds ?? []).map((id) => ({ id }))),
      ),
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
      billingPeriodKey: jest.fn(
        (subscriptionId: string, periodEnd: Date) =>
          `${subscriptionId}:${periodEnd.toISOString().slice(0, 10)}`,
      ),
      advancePeriod: jest.fn(() => ({
        currentPeriodStart: new Date('2026-03-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-04-01T00:00:00.000Z'),
        nextRenewalAt: new Date('2026-04-01T00:00:00.000Z'),
        cycleNumber: 2,
      })),
    };

    const orders = {
      createOrderFromSnapshots: jest.fn(() => Promise.resolve({ id: 'ord-1' })),
      transitionOrder: jest.fn((args: { toStatus: OrderStatus }) => {
        if (overrides?.transitionError) {
          return Promise.reject(overrides.transitionError);
        }
        // Simulate P13e committed Reserve transition for completeRenewalOnCapture guard.
        if (order) {
          order.status = args.toStatus;
        }
        return Promise.resolve({ id: 'ord-1', status: args.toStatus });
      }),
    };

    let latestPayment: {
      id: string;
      status: PaymentStatus;
      lifecycleState: PaymentLifecycleState;
      paymentStatusSummary?: string;
    } | null = null;

    const payments = {
      authorizeForOrder: jest.fn(() => {
        const result = {
          paymentId: 'pay-1',
          status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
          lifecycleState: PaymentLifecycleState.AUTHORIZED,
          paymentStatusSummary: 'authorized_or_captured',
          ...(overrides?.auth ?? {}),
        };
        latestPayment = {
          id: result.paymentId,
          status: result.status as PaymentStatus,
          lifecycleState: result.lifecycleState as PaymentLifecycleState,
          paymentStatusSummary: result.paymentStatusSummary,
        };
        return Promise.resolve(result);
      }),
      capturePayment: jest.fn(() => {
        const result = {
          paymentId: 'pay-1',
          status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
          lifecycleState: PaymentLifecycleState.CAPTURED,
          paymentStatusSummary: 'authorized_or_captured',
          ...(overrides?.capture ?? {}),
        };
        latestPayment = {
          id: result.paymentId,
          status: result.status as PaymentStatus,
          lifecycleState: result.lifecycleState as PaymentLifecycleState,
          paymentStatusSummary: result.paymentStatusSummary,
        };
        return Promise.resolve(result);
      }),
      findLatestForOrder: jest.fn(() => Promise.resolve(latestPayment)),
      voidOrRefundForOrder: jest.fn(),
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
      order,
      attempt,
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
    const { processor, schedule, subscriptions, orders, payments } = build();

    const result = await processor.processSubscription({
      subscriptionId: 'sub-1',
      mode: 'manual',
      source: 'crm',
      actorUserId: 'staff-1',
    });

    expect(result.outcome).toBe('succeeded');
    expect(payments.authorizeForOrder).toHaveBeenCalledTimes(1);
    expect(payments.capturePayment).toHaveBeenCalledTimes(1);
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

  it('P14g: DECLINED_HOLD short-circuits without authorize/Order/capture', async () => {
    const { processor, payments, orders, renewal, schedule } = build({
      subscription: { clinicalRequirement: 'DECLINED_HOLD' },
      attempt: {
        status: SubscriptionRenewalAttemptStatus.FAILED,
        orderId: 'ord-1',
        paymentId: 'pay-1',
      },
    });

    const result = await processor.processSubscription({
      subscriptionId: 'sub-1',
      mode: 'auto',
      source: 'system',
    });

    expect(result.outcome).toBe('clinical_hold');
    expect(payments.authorizeForOrder).not.toHaveBeenCalled();
    expect(payments.capturePayment).not.toHaveBeenCalled();
    expect(orders.createOrderFromSnapshots).not.toHaveBeenCalled();
    expect(orders.transitionOrder).not.toHaveBeenCalled();
    expect(renewal.openRenewalAttempt).not.toHaveBeenCalled();
    expect(schedule.advancePeriod).not.toHaveBeenCalled();
  });

  it('P14g: CLINICAL_APPROVED resume captures without re-authorize', async () => {
    const { processor, payments, orders, schedule } = build({
      attempt: {
        status: SubscriptionRenewalAttemptStatus.PROCESSING,
        orderId: 'ord-1',
        paymentId: 'pay-1',
      },
      order: {
        isRxOrder: true,
        status: OrderStatus.CLINICAL_APPROVED,
      },
    });
    let lifecycle = PaymentLifecycleState.AUTHORIZED;
    payments.findLatestForOrder.mockImplementation(() =>
      Promise.resolve({
        id: 'pay-1',
        lifecycleState: lifecycle,
        status:
          lifecycle === PaymentLifecycleState.CAPTURED
            ? PaymentStatus.AUTHORIZED_OR_CAPTURED
            : PaymentStatus.AUTHORIZED_OR_CAPTURED,
      }),
    );
    payments.capturePayment.mockImplementation(() => {
      lifecycle = PaymentLifecycleState.CAPTURED;
      return Promise.resolve({
        paymentId: 'pay-1',
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
        lifecycleState: PaymentLifecycleState.CAPTURED,
        paymentStatusSummary: 'authorized_or_captured',
      });
    });

    const result = await processor.processSubscription({
      subscriptionId: 'sub-1',
      mode: 'retry',
      source: 'system',
    });

    expect(result.outcome).toBe('succeeded');
    expect(payments.authorizeForOrder).not.toHaveBeenCalled();
    expect(payments.capturePayment).toHaveBeenCalled();
    expect(orders.transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        toStatus: OrderStatus.AWAITING_FULFILLMENT,
        source: 'clinical',
        expectedStatus: OrderStatus.CLINICAL_APPROVED,
      }),
    );
    expect(schedule.advancePeriod).toHaveBeenCalledTimes(1);
  });

  it('P14g: CLINICAL_DECLINED resume does not re-authorize', async () => {
    const { processor, payments, orders, schedule } = build({
      attempt: {
        status: SubscriptionRenewalAttemptStatus.FAILED,
        orderId: 'ord-1',
        paymentId: 'pay-1',
      },
      order: {
        isRxOrder: true,
        status: OrderStatus.CLINICAL_DECLINED,
      },
    });

    const result = await processor.processSubscription({
      subscriptionId: 'sub-1',
      mode: 'retry',
      source: 'crm',
    });

    expect(result.outcome).toBe('clinical_hold');
    expect(payments.authorizeForOrder).not.toHaveBeenCalled();
    expect(payments.capturePayment).not.toHaveBeenCalled();
    expect(orders.createOrderFromSnapshots).not.toHaveBeenCalled();
    expect(schedule.advancePeriod).not.toHaveBeenCalled();
  });

  it('P14g: AWAITING_FULFILLMENT + CAPTURE_FAILED retries capture only', async () => {
    const { processor, payments, orders, schedule } = build({
      attempt: {
        status: SubscriptionRenewalAttemptStatus.FAILED,
        orderId: 'ord-1',
        paymentId: 'pay-1',
      },
      order: {
        isRxOrder: true,
        status: OrderStatus.AWAITING_FULFILLMENT,
      },
    });
    let lifecycle = PaymentLifecycleState.CAPTURE_FAILED;
    payments.findLatestForOrder.mockImplementation(() =>
      Promise.resolve({
        id: 'pay-1',
        lifecycleState: lifecycle,
        status:
          lifecycle === PaymentLifecycleState.CAPTURED
            ? PaymentStatus.AUTHORIZED_OR_CAPTURED
            : PaymentStatus.FAILED,
      }),
    );
    payments.capturePayment.mockImplementation(() => {
      lifecycle = PaymentLifecycleState.CAPTURED;
      return Promise.resolve({
        paymentId: 'pay-1',
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
        lifecycleState: PaymentLifecycleState.CAPTURED,
        paymentStatusSummary: 'authorized_or_captured',
      });
    });

    const result = await processor.processSubscription({
      subscriptionId: 'sub-1',
      mode: 'retry',
      source: 'system',
    });

    expect(result.outcome).toBe('succeeded');
    expect(payments.authorizeForOrder).not.toHaveBeenCalled();
    expect(payments.capturePayment).toHaveBeenCalled();
    expect(orders.createOrderFromSnapshots).not.toHaveBeenCalled();
    expect(schedule.advancePeriod).toHaveBeenCalledTimes(1);
  });

  it('idempotent short-circuit when attempt already succeeded', async () => {
    const { processor, payments, schedule, orders } = build({
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
    expect(payments.capturePayment).not.toHaveBeenCalled();
    expect(orders.transitionOrder).not.toHaveBeenCalled();
    expect(schedule.advancePeriod).not.toHaveBeenCalled();
  });

  it('P13e Rx retry: PROCESSING+PAYMENT_PENDING+AUTHORIZED re-transitions clinical, does not capture', async () => {
    const { processor, payments, orders } = build({
      attempt: {
        status: SubscriptionRenewalAttemptStatus.PROCESSING,
        orderId: 'ord-1',
        paymentId: 'pay-1',
      },
      order: {
        isRxOrder: true,
        status: OrderStatus.PAYMENT_PENDING,
      },
    });
    payments.findLatestForOrder.mockResolvedValue({
      id: 'pay-1',
      lifecycleState: PaymentLifecycleState.AUTHORIZED,
    });

    const result = await processor.processSubscription({
      subscriptionId: 'sub-1',
      mode: 'retry',
      source: 'system',
    });

    expect(result.outcome).toBe('authorized_awaiting_clinical');
    expect(payments.authorizeForOrder).not.toHaveBeenCalled();
    expect(payments.capturePayment).not.toHaveBeenCalled();
    expect(orders.transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        toStatus: OrderStatus.AWAITING_CLINICAL_REVIEW,
        expectedStatus: OrderStatus.PAYMENT_PENDING,
        reason: 'renewal_authorized_retry',
      }),
    );
  });

  describe('P14f inventory failure policy', () => {
    it('non-Rx: Reserve ERR-INV-001 after capture fails attempt without period advance or refund', async () => {
      const { processor, payments, schedule, subscriptions, renewal, orders } =
        build({
          transitionError: new BadRequestException({
            code: ErrorCodes.INV_INSUFFICIENT,
            message: 'Insufficient stock for this operation',
          }),
        });

      const result = await processor.processSubscription({
        subscriptionId: 'sub-1',
        mode: 'manual',
        source: 'crm',
      });

      expect(result.outcome).toBe('inventory_insufficient');
      expect(result.attemptStatus).toBe(
        SubscriptionRenewalAttemptStatus.FAILED,
      );
      expect(payments.capturePayment).toHaveBeenCalledTimes(1);
      expect(schedule.advancePeriod).not.toHaveBeenCalled();
      expect(subscriptions.markPastDue).not.toHaveBeenCalled();
      expect(payments.voidOrRefundForOrder).not.toHaveBeenCalled();
      expect(renewal.markAttemptOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SubscriptionRenewalAttemptStatus.FAILED,
          lastErrorCode: ErrorCodes.INV_INSUFFICIENT,
        }),
      );
      expect(orders.createOrderFromSnapshots).toHaveBeenCalledTimes(1);
    });

    it('non-Rx CAPTURED+PAYMENT_PENDING retry re-runs Reserve without authorize/capture', async () => {
      const { processor, payments, orders, schedule, renewal } = build({
        attempt: {
          status: SubscriptionRenewalAttemptStatus.FAILED,
          orderId: 'ord-1',
          paymentId: 'pay-1',
        },
        order: {
          isRxOrder: false,
          status: OrderStatus.PAYMENT_PENDING,
        },
      });
      payments.findLatestForOrder.mockResolvedValue({
        id: 'pay-1',
        lifecycleState: PaymentLifecycleState.CAPTURED,
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
      });

      const result = await processor.processSubscription({
        subscriptionId: 'sub-1',
        mode: 'retry',
        source: 'system',
      });

      expect(result.outcome).toBe('succeeded');
      expect(payments.authorizeForOrder).not.toHaveBeenCalled();
      expect(payments.capturePayment).not.toHaveBeenCalled();
      expect(orders.createOrderFromSnapshots).not.toHaveBeenCalled();
      expect(orders.transitionOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          toStatus: OrderStatus.AWAITING_FULFILLMENT,
          expectedStatus: OrderStatus.PAYMENT_PENDING,
          reason: 'renewal_captured_inventory_retry',
        }),
      );
      expect(schedule.advancePeriod).toHaveBeenCalledTimes(1);
      expect(renewal.markAttemptOutcome).not.toHaveBeenCalledWith(
        expect.objectContaining({
          lastErrorCode: ErrorCodes.INV_INSUFFICIENT,
        }),
      );
    });

    it('non-Rx CAPTURED+PAYMENT_PENDING: completeRenewalOnCapture does not advance until Reserve', async () => {
      const { processor, schedule, prisma, payments } = build({
        attempt: {
          status: SubscriptionRenewalAttemptStatus.PROCESSING,
          orderId: 'ord-1',
          paymentId: 'pay-1',
        },
        order: {
          isRxOrder: false,
          status: OrderStatus.PAYMENT_PENDING,
        },
      });
      payments.findLatestForOrder.mockResolvedValue({
        id: 'pay-1',
        lifecycleState: PaymentLifecycleState.CAPTURED,
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
      });

      // Simulate onRenewalCaptureSucceeded firing while Order still PAYMENT_PENDING.
      await processor.completeRenewalOnCapture({
        subscriptionId: 'sub-1',
        billingPeriodKey,
        paymentId: 'pay-1',
        source: 'payment',
      });
      expect(schedule.advancePeriod).not.toHaveBeenCalled();

      // After Reserve succeeds, order is AWAITING_FULFILLMENT.
      prisma.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        isRxOrder: false,
        status: OrderStatus.AWAITING_FULFILLMENT,
      });
      await processor.completeRenewalOnCapture({
        subscriptionId: 'sub-1',
        billingPeriodKey,
        paymentId: 'pay-1',
        source: 'payment',
      });
      expect(schedule.advancePeriod).toHaveBeenCalledTimes(1);
    });

    it('non-Rx retry after inventory failure does not advance period twice', async () => {
      const { processor, payments, schedule, renewal } = build({
        attempt: {
          status: SubscriptionRenewalAttemptStatus.FAILED,
          orderId: 'ord-1',
          paymentId: 'pay-1',
        },
        order: {
          isRxOrder: false,
          status: OrderStatus.PAYMENT_PENDING,
        },
      });
      payments.findLatestForOrder.mockResolvedValue({
        id: 'pay-1',
        lifecycleState: PaymentLifecycleState.CAPTURED,
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
      });

      await processor.processSubscription({
        subscriptionId: 'sub-1',
        mode: 'retry',
        source: 'system',
      });
      expect(schedule.advancePeriod).toHaveBeenCalledTimes(1);

      // Second call: already SUCCEEDED — no further period/payment side effects.
      renewal.openRenewalAttempt.mockResolvedValue({
        billingPeriodKey,
        attempt: {
          ...attemptBase,
          status: SubscriptionRenewalAttemptStatus.SUCCEEDED,
          orderId: 'ord-1',
          paymentId: 'pay-1',
        },
        subscription: subscriptionBase,
        orderRequest: { lines: [] },
      });

      const second = await processor.processSubscription({
        subscriptionId: 'sub-1',
        mode: 'retry',
        source: 'system',
      });
      expect(second.outcome).toBe('succeeded');
      expect(schedule.advancePeriod).toHaveBeenCalledTimes(1);
      expect(payments.authorizeForOrder).not.toHaveBeenCalled();
      expect(payments.capturePayment).not.toHaveBeenCalled();
    });

    it('Rx: Reserve ERR-INV-001 after authorize fails without capture or PAST_DUE', async () => {
      const { processor, payments, schedule, subscriptions, renewal } = build({
        order: { isRxOrder: true },
        transitionError: new BadRequestException({
          code: ErrorCodes.INV_INSUFFICIENT,
          message: 'Oversell prevented by inventory policy',
        }),
      });

      const result = await processor.processSubscription({
        subscriptionId: 'sub-1',
        mode: 'auto',
        source: 'system',
      });

      expect(result.outcome).toBe('inventory_insufficient');
      expect(payments.authorizeForOrder).toHaveBeenCalledTimes(1);
      expect(payments.capturePayment).not.toHaveBeenCalled();
      expect(schedule.advancePeriod).not.toHaveBeenCalled();
      expect(subscriptions.markPastDue).not.toHaveBeenCalled();
      expect(renewal.markAttemptOutcome).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SubscriptionRenewalAttemptStatus.FAILED,
          lastErrorCode: ErrorCodes.INV_INSUFFICIENT,
        }),
      );
    });

    it('Rx FAILED+AUTHORIZED+PAYMENT_PENDING retry re-transitions clinical without authorize/capture', async () => {
      const { processor, payments, orders, schedule } = build({
        attempt: {
          status: SubscriptionRenewalAttemptStatus.FAILED,
          orderId: 'ord-1',
          paymentId: 'pay-1',
        },
        order: {
          isRxOrder: true,
          status: OrderStatus.PAYMENT_PENDING,
        },
      });
      payments.findLatestForOrder.mockResolvedValue({
        id: 'pay-1',
        lifecycleState: PaymentLifecycleState.AUTHORIZED,
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
      });

      const result = await processor.processSubscription({
        subscriptionId: 'sub-1',
        mode: 'retry',
        source: 'crm',
      });

      expect(result.outcome).toBe('authorized_awaiting_clinical');
      expect(result.attemptStatus).toBe(
        SubscriptionRenewalAttemptStatus.PROCESSING,
      );
      expect(payments.authorizeForOrder).not.toHaveBeenCalled();
      expect(payments.capturePayment).not.toHaveBeenCalled();
      expect(orders.createOrderFromSnapshots).not.toHaveBeenCalled();
      expect(orders.transitionOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          toStatus: OrderStatus.AWAITING_CLINICAL_REVIEW,
          reason: 'renewal_authorized_retry',
        }),
      );
      expect(schedule.advancePeriod).not.toHaveBeenCalled();
    });

    it('unrelated Order transition errors are not converted to inventory FAILED', async () => {
      const { processor, renewal } = build({
        transitionError: new BadRequestException({
          code: ErrorCodes.ORD_CONFLICT,
          message: 'Order was modified concurrently',
        }),
      });

      await expect(
        processor.processSubscription({
          subscriptionId: 'sub-1',
          mode: 'manual',
          source: 'crm',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(renewal.markAttemptOutcome).not.toHaveBeenCalledWith(
        expect.objectContaining({
          lastErrorCode: ErrorCodes.INV_INSUFFICIENT,
        }),
      );
    });

    it('FAILED auth attempt falls through to authorize retry (not inventory resume)', async () => {
      const { processor, payments, orders } = build({
        attempt: {
          status: SubscriptionRenewalAttemptStatus.FAILED,
          orderId: 'ord-1',
          paymentId: 'pay-1',
        },
        order: {
          isRxOrder: false,
          status: OrderStatus.PAYMENT_PENDING,
        },
      });
      // First lookup in resumeExistingAttempt sees auth failure → fall through.
      payments.findLatestForOrder
        .mockResolvedValueOnce({
          id: 'pay-1',
          lifecycleState: PaymentLifecycleState.AUTHORIZATION_FAILED,
          status: PaymentStatus.FAILED,
        })
        .mockImplementation(() =>
          Promise.resolve({
            id: 'pay-1',
            lifecycleState: PaymentLifecycleState.CAPTURED,
            status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
          }),
        );

      const result = await processor.processSubscription({
        subscriptionId: 'sub-1',
        mode: 'retry',
        source: 'system',
      });

      expect(result.outcome).toBe('succeeded');
      expect(payments.authorizeForOrder).toHaveBeenCalled();
      expect(orders.createOrderFromSnapshots).not.toHaveBeenCalled();
    });

    it('processDueBatch isolates inventory failure and continues', async () => {
      const invError = new BadRequestException({
        code: ErrorCodes.INV_INSUFFICIENT,
        message: 'Insufficient stock',
      });
      const { processor, prisma } = build({
        dueIds: ['sub-1', 'sub-2'],
        transitionError: invError,
      });

      // First subscription fails inventory; second succeeds (no transition error on 2nd).
      let call = 0;
      jest
        .spyOn(processor, 'processSubscription')
        .mockImplementation((input) => {
          call += 1;
          if (input.subscriptionId === 'sub-1') {
            return Promise.resolve({
              subscriptionId: 'sub-1',
              billingPeriodKey,
              attemptId: 'att-1',
              orderId: 'ord-1',
              paymentId: 'pay-1',
              outcome: 'inventory_insufficient' as const,
              attemptStatus: SubscriptionRenewalAttemptStatus.FAILED,
            });
          }
          return Promise.resolve({
            subscriptionId: 'sub-2',
            billingPeriodKey: 'sub-2:2026-03-01',
            attemptId: 'att-2',
            orderId: 'ord-2',
            paymentId: 'pay-2',
            outcome: 'succeeded' as const,
            attemptStatus: SubscriptionRenewalAttemptStatus.SUCCEEDED,
          });
        });

      prisma.subscription.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) =>
          Promise.resolve({
            status: SubscriptionStatus.ACTIVE,
            id: where.id,
          }),
      );

      const result = await processor.processDueBatch({ limit: 10 });

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(call).toBe(2);
    });
  });
});
