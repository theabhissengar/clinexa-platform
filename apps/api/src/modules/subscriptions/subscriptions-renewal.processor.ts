import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  OrderType,
  PaymentLifecycleState,
  PaymentStatus,
  SubscriptionClinicalRequirement,
  SubscriptionRenewalAttemptStatus,
  SubscriptionStatus,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { RenewalAddressResolver } from './renewal-address.resolver';
import { SubscriptionsScheduleService } from './subscriptions-schedule.service';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRenewalService } from './subscriptions-renewal.service';

export type ProcessRenewalInput = {
  subscriptionId: string;
  mode: 'auto' | 'manual' | 'retry';
  actorUserId?: string | null;
  source: string;
  now?: Date;
  forceOutcome?: 'decline' | 'timeout' | null;
};

export type ProcessRenewalResult = {
  subscriptionId: string;
  billingPeriodKey: string;
  attemptId: string;
  orderId: string | null;
  paymentId: string | null;
  outcome:
    | 'succeeded'
    | 'authorized_awaiting_clinical'
    | 'authorization_failed'
    | 'capture_failed'
    | 'address_missing'
    | 'order_create_failed'
    | 'skipped'
    | 'method_missing'
    | 'in_flight'
    | 'inventory_insufficient';
  attemptStatus: SubscriptionRenewalAttemptStatus;
};

export type DueBatchResult = {
  scanned: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

function extractErrorCode(error: unknown): string | undefined {
  if (!(error instanceof BadRequestException)) {
    return undefined;
  }
  const response = error.getResponse();
  if (typeof response === 'object' && response !== null && 'code' in response) {
    const code = (response as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function isInventoryInsufficient(error: unknown): boolean {
  return extractErrorCode(error) === ErrorCodes.INV_INSUFFICIENT;
}

@Injectable()
export class SubscriptionsRenewalProcessor {
  private readonly logger = new Logger(SubscriptionsRenewalProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly renewal: SubscriptionsRenewalService,
    private readonly schedule: SubscriptionsScheduleService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly addresses: RenewalAddressResolver,
  ) {}

  async processSubscription(
    input: ProcessRenewalInput,
  ): Promise<ProcessRenewalResult> {
    const now = input.now ?? new Date();
    const opened = await this.renewal.openRenewalAttempt({
      subscriptionId: input.subscriptionId,
      mode: input.mode,
      actorUserId: input.actorUserId,
      source: input.source,
      now,
    });

    const billingPeriodKey = opened.billingPeriodKey;
    const attemptId = opened.attempt.id;

    // Already succeeded for this period — idempotent short-circuit.
    if (opened.attempt.status === SubscriptionRenewalAttemptStatus.SUCCEEDED) {
      return {
        subscriptionId: input.subscriptionId,
        billingPeriodKey,
        attemptId,
        orderId: opened.attempt.orderId,
        paymentId: opened.attempt.paymentId,
        outcome: 'succeeded',
        attemptStatus: opened.attempt.status,
      };
    }

    // Resume in-flight / FAILED attempts by Order + Payment state (P14f).
    // Do not blindly re-authorize; classify before falling through to money path.
    if (
      opened.attempt.orderId &&
      (opened.attempt.status === SubscriptionRenewalAttemptStatus.PROCESSING ||
        opened.attempt.status === SubscriptionRenewalAttemptStatus.FAILED)
    ) {
      const resumed = await this.resumeExistingAttempt({
        subscriptionId: input.subscriptionId,
        billingPeriodKey,
        attemptId,
        orderId: opened.attempt.orderId,
        paymentId: opened.attempt.paymentId,
        actorUserId: input.actorUserId,
        source: input.source,
        forceOutcome: input.forceOutcome,
      });
      if (resumed) {
        return resumed;
      }
    }

    let orderId = opened.attempt.orderId;
    if (!orderId) {
      try {
        const addrs = await this.addresses.resolve(
          input.subscriptionId,
          opened.subscription.patientUserId,
        );
        const order = await this.orders.createOrderFromSnapshots({
          patientUserId: opened.subscription.patientUserId,
          subscriptionId: input.subscriptionId,
          orderType: OrderType.SUBSCRIPTION_RENEWAL,
          lines: opened.orderRequest.lines,
          shippingAddress: addrs.shipping,
          billingAddress: addrs.billing,
          customer: {
            firstName: opened.subscription.customerFirstName,
            lastName: opened.subscription.customerLastName,
            email: opened.subscription.customerEmail,
            phone: opened.subscription.customerPhone,
          },
          initialStatus: OrderStatus.PAYMENT_PENDING,
          idempotencyKey: `renewal:${input.subscriptionId}:${billingPeriodKey}`,
          actorUserId: input.actorUserId,
          source: input.source,
        });
        orderId = order.id;
        await this.renewal.attachRenewalOrder({
          subscriptionId: input.subscriptionId,
          billingPeriodKey,
          orderId,
          actorUserId: input.actorUserId,
          source: input.source,
        });
      } catch (error) {
        const code = extractErrorCode(error) ?? ErrorCodes.SYS_UNEXPECTED;
        const isAddress = code === ErrorCodes.VAL_MISSING_FIELD;
        await this.renewal.markAttemptOutcome({
          subscriptionId: input.subscriptionId,
          billingPeriodKey,
          status: SubscriptionRenewalAttemptStatus.FAILED,
          lastErrorCode: code,
          actorUserId: input.actorUserId,
          source: input.source,
        });
        // Missing address / order create: do NOT PAST_DUE (payment did not fail).
        return {
          subscriptionId: input.subscriptionId,
          billingPeriodKey,
          attemptId,
          orderId: null,
          paymentId: null,
          outcome: isAddress ? 'address_missing' : 'order_create_failed',
          attemptStatus: SubscriptionRenewalAttemptStatus.FAILED,
        };
      }
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException({
        code: ErrorCodes.ORD_NOT_FOUND,
        message: 'Renewal order not found after create/attach',
      });
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { id: input.subscriptionId },
    });
    if (!subscription?.paymentMethodId) {
      await this.failAuthorization({
        subscriptionId: input.subscriptionId,
        billingPeriodKey,
        attemptId,
        orderId,
        paymentId: null,
        errorCode: ErrorCodes.PAY_METHOD_INVALID,
        actorUserId: input.actorUserId,
        source: input.source,
      });
      return {
        subscriptionId: input.subscriptionId,
        billingPeriodKey,
        attemptId,
        orderId,
        paymentId: null,
        outcome: 'method_missing',
        attemptStatus: SubscriptionRenewalAttemptStatus.FAILED,
      };
    }

    const auth = await this.payments.authorizeForOrder({
      orderId,
      subscriptionId: input.subscriptionId,
      paymentMethodId: subscription.paymentMethodId,
      amountCents: order.totalCents,
      currency: order.currency,
      idempotencyKey: `renewal:${input.subscriptionId}:${billingPeriodKey}:authorize`,
      forceOutcome: input.forceOutcome,
    });

    await this.subscriptions.recordPaymentSnapshot({
      subscriptionId: input.subscriptionId,
      paymentStatusSummary: auth.paymentStatusSummary,
      latestPaymentId: auth.paymentId,
      actorUserId: input.actorUserId,
      source: input.source,
    });

    if (
      auth.status === PaymentStatus.FAILED ||
      auth.lifecycleState === PaymentLifecycleState.AUTHORIZATION_FAILED
    ) {
      await this.failAuthorization({
        subscriptionId: input.subscriptionId,
        billingPeriodKey,
        attemptId,
        orderId,
        paymentId: auth.paymentId,
        errorCode: ErrorCodes.PAY_AUTHORIZATION_FAILED,
        actorUserId: input.actorUserId,
        source: input.source,
      });
      return {
        subscriptionId: input.subscriptionId,
        billingPeriodKey,
        attemptId,
        orderId,
        paymentId: auth.paymentId,
        outcome: 'authorization_failed',
        attemptStatus: SubscriptionRenewalAttemptStatus.FAILED,
      };
    }

    await this.renewal.markAttemptOutcome({
      subscriptionId: input.subscriptionId,
      billingPeriodKey,
      status: SubscriptionRenewalAttemptStatus.PROCESSING,
      paymentId: auth.paymentId,
      paymentStatusSummary: auth.paymentStatusSummary,
      actorUserId: input.actorUserId,
      source: input.source,
    });

    if (order.isRxOrder) {
      return this.transitionRxToClinical({
        subscriptionId: input.subscriptionId,
        billingPeriodKey,
        attemptId,
        orderId,
        paymentId: auth.paymentId,
        actorUserId: input.actorUserId,
        source: input.source,
        reason: 'renewal_authorized',
      });
    }

    // Non-Rx: capture then transition to AWAITING_FULFILLMENT (ordering unchanged).
    return this.continueCapture({
      subscriptionId: input.subscriptionId,
      billingPeriodKey,
      attemptId,
      orderId,
      paymentId: auth.paymentId,
      isRx: false,
      actorUserId: input.actorUserId,
      source: input.source,
      forceOutcome: input.forceOutcome,
      transitionFromPaymentPending: true,
    });
  }

  /**
   * Period advance only when payment is CAPTURED and Order has completed the
   * P13e Reserve-at-auth transition (AWAITING_FULFILLMENT or FULFILLED).
   * CAPTURED + PAYMENT_PENDING must not advance (P14f).
   */
  async completeRenewalOnCapture(input: {
    subscriptionId: string;
    billingPeriodKey: string;
    paymentId: string;
    orderId?: string | null;
    actorUserId?: string | null;
    source: string;
  }): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: input.subscriptionId },
      include: { plan: true },
    });
    if (!sub || !sub.currentPeriodEnd) {
      return;
    }

    const attempt = await this.prisma.subscriptionRenewalAttempt.findUnique({
      where: {
        subscriptionId_billingPeriodKey: {
          subscriptionId: input.subscriptionId,
          billingPeriodKey: input.billingPeriodKey,
        },
      },
    });
    if (attempt?.status === SubscriptionRenewalAttemptStatus.SUCCEEDED) {
      return;
    }

    const orderId = attempt?.orderId ?? input.orderId ?? null;
    if (!orderId) {
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (
      !order ||
      (order.status !== OrderStatus.AWAITING_FULFILLMENT &&
        order.status !== OrderStatus.FULFILLED)
    ) {
      // Reserve transition has not committed (e.g. still PAYMENT_PENDING).
      return;
    }

    const payment = await this.payments.findLatestForOrder(order.id);
    if (!payment || payment.lifecycleState !== PaymentLifecycleState.CAPTURED) {
      return;
    }

    const period = this.schedule.advancePeriod(
      sub.currentPeriodEnd,
      sub.cycleNumber,
      {
        billingInterval: sub.plan.billingInterval,
        intervalCount: sub.plan.intervalCount,
        customIntervalDays: sub.plan.customIntervalDays,
      },
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          ...period,
          paymentStatusSummary: 'authorized_or_captured',
          latestPaymentId: input.paymentId,
          ...(sub.status === SubscriptionStatus.PAST_DUE
            ? { status: SubscriptionStatus.ACTIVE }
            : {}),
        },
      });
      if (sub.status === SubscriptionStatus.PAST_DUE) {
        await tx.subscriptionStatusHistory.create({
          data: {
            subscriptionId: sub.id,
            fromStatus: SubscriptionStatus.PAST_DUE,
            toStatus: SubscriptionStatus.ACTIVE,
            actorUserId: input.actorUserId ?? null,
            source: input.source,
            reason: 'renewal_payment_recovered',
          },
        });
      }
      await tx.subscriptionRenewalAttempt.update({
        where: {
          subscriptionId_billingPeriodKey: {
            subscriptionId: input.subscriptionId,
            billingPeriodKey: input.billingPeriodKey,
          },
        },
        data: {
          status: SubscriptionRenewalAttemptStatus.SUCCEEDED,
          paymentId: input.paymentId,
          paymentStatusSummary: 'authorized_or_captured',
          lastErrorCode: null,
        },
      });
      await tx.subscriptionActivity.create({
        data: {
          subscriptionId: sub.id,
          actorUserId: input.actorUserId ?? null,
          kind: 'renewal_succeeded',
          summary: `Renewal succeeded for ${input.billingPeriodKey}`,
          metadata: {
            billingPeriodKey: input.billingPeriodKey,
            paymentId: input.paymentId,
            cycleNumber: period.cycleNumber,
          },
        },
      });
    });

    // Notify via side-effect hooks if wired.
    await this.subscriptions.notify(
      'subscription.renewed',
      input.subscriptionId,
    );
  }

  async onClinicalDecline(input: {
    orderId: string;
    subscriptionId: string | null;
  }): Promise<void> {
    if (!input.subscriptionId) {
      return;
    }
    await this.subscriptions.setClinicalRequirement({
      subscriptionId: input.subscriptionId,
      clinicalRequirement: SubscriptionClinicalRequirement.DECLINED_HOLD,
      source: 'payment',
      reason: 'clinical_decline_on_renewal_order',
    });
    const attempt = await this.prisma.subscriptionRenewalAttempt.findFirst({
      where: {
        subscriptionId: input.subscriptionId,
        orderId: input.orderId,
      },
    });
    if (attempt) {
      await this.renewal.markAttemptOutcome({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: attempt.billingPeriodKey,
        status: SubscriptionRenewalAttemptStatus.FAILED,
        lastErrorCode: ErrorCodes.SUB_CLINICAL_REASSESSMENT,
        source: 'clinical',
      });
    }
  }

  async processDueBatch(input?: {
    limit?: number;
    now?: Date;
  }): Promise<DueBatchResult> {
    const now = input?.now ?? new Date();
    const limit = Math.min(input?.limit ?? 25, 100);

    const dueIds = await this.lockDueSubscriptionIds(now, limit);
    const result: DueBatchResult = {
      scanned: dueIds.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    };

    for (const subscriptionId of dueIds) {
      try {
        const sub = await this.prisma.subscription.findUnique({
          where: { id: subscriptionId },
          select: { status: true },
        });
        const mode =
          sub?.status === SubscriptionStatus.PAST_DUE ? 'retry' : 'auto';
        const outcome = await this.processSubscription({
          subscriptionId,
          mode,
          source: 'system',
          now,
        });
        result.processed += 1;
        if (
          outcome.outcome === 'succeeded' ||
          outcome.outcome === 'authorized_awaiting_clinical'
        ) {
          result.succeeded += 1;
        } else if (
          outcome.outcome === 'skipped' ||
          outcome.outcome === 'in_flight'
        ) {
          result.skipped += 1;
        } else {
          result.failed += 1;
        }
      } catch (error) {
        result.processed += 1;
        result.failed += 1;
        this.logger.warn(
          `Renewal processing failed for ${subscriptionId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return result;
  }

  /**
   * Payment-aware resume for PROCESSING/FAILED attempts with an existing Order.
   * Returns null when the caller should fall through to authorize (e.g. auth failure retry).
   */
  private async resumeExistingAttempt(input: {
    subscriptionId: string;
    billingPeriodKey: string;
    attemptId: string;
    orderId: string;
    paymentId: string | null;
    actorUserId?: string | null;
    source: string;
    forceOutcome?: 'decline' | 'timeout' | null;
  }): Promise<ProcessRenewalResult | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
    });
    if (!order) {
      return null;
    }

    if (order.status === OrderStatus.AWAITING_CLINICAL_REVIEW) {
      return {
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: order.id,
        paymentId: input.paymentId,
        outcome: 'authorized_awaiting_clinical',
        attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
      };
    }

    if (
      order.status !== OrderStatus.PAYMENT_PENDING &&
      order.status !== OrderStatus.AWAITING_FULFILLMENT
    ) {
      return null;
    }

    const payment = await this.payments.findLatestForOrder(order.id);

    // Auth/payment FAILED → fall through to existing P14e authorize retry.
    if (
      payment &&
      (payment.lifecycleState === PaymentLifecycleState.AUTHORIZATION_FAILED ||
        payment.status === PaymentStatus.FAILED)
    ) {
      return null;
    }

    // A. Rx + AUTHORIZED + PAYMENT_PENDING → retry clinical Reserve transition only.
    if (
      order.isRxOrder &&
      order.status === OrderStatus.PAYMENT_PENDING &&
      payment &&
      payment.lifecycleState === PaymentLifecycleState.AUTHORIZED
    ) {
      return this.transitionRxToClinical({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: order.id,
        paymentId: payment.id,
        actorUserId: input.actorUserId,
        source: input.source,
        reason: 'renewal_authorized_retry',
      });
    }

    // B. Non-Rx + CAPTURED + PAYMENT_PENDING → retry fulfillment Reserve only (no capture).
    if (
      !order.isRxOrder &&
      order.status === OrderStatus.PAYMENT_PENDING &&
      payment &&
      payment.lifecycleState === PaymentLifecycleState.CAPTURED
    ) {
      return this.retryCapturedUnreserved({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: order.id,
        paymentId: payment.id,
        actorUserId: input.actorUserId,
        source: input.source,
      });
    }

    // CAPTURED + AWAITING_FULFILLMENT → Reserve already done; complete once.
    if (
      payment &&
      payment.lifecycleState === PaymentLifecycleState.CAPTURED &&
      order.status === OrderStatus.AWAITING_FULFILLMENT
    ) {
      await this.completeRenewalOnCapture({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        paymentId: payment.id,
        orderId: order.id,
        actorUserId: input.actorUserId,
        source: input.source,
      });
      return {
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: order.id,
        paymentId: payment.id,
        outcome: 'succeeded',
        attemptStatus: SubscriptionRenewalAttemptStatus.SUCCEEDED,
      };
    }

    // Non-Rx AUTHORIZED + PAYMENT_PENDING → existing P14e continueCapture (stuck after auth).
    if (
      !order.isRxOrder &&
      order.status === OrderStatus.PAYMENT_PENDING &&
      payment &&
      payment.lifecycleState === PaymentLifecycleState.AUTHORIZED
    ) {
      return this.continueCapture({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: order.id,
        paymentId: payment.id,
        isRx: false,
        actorUserId: input.actorUserId,
        source: input.source,
        forceOutcome: input.forceOutcome,
        transitionFromPaymentPending: true,
      });
    }

    return null;
  }

  private async transitionRxToClinical(input: {
    subscriptionId: string;
    billingPeriodKey: string;
    attemptId: string;
    orderId: string;
    paymentId: string;
    actorUserId?: string | null;
    source: string;
    reason: string;
  }): Promise<ProcessRenewalResult> {
    try {
      await this.orders.transitionOrder({
        orderId: input.orderId,
        toStatus: OrderStatus.AWAITING_CLINICAL_REVIEW,
        actorUserId: input.actorUserId,
        source: input.source,
        reason: input.reason,
        expectedStatus: OrderStatus.PAYMENT_PENDING,
      });
    } catch (error) {
      if (isInventoryInsufficient(error)) {
        return this.failInventoryInsufficient({
          subscriptionId: input.subscriptionId,
          billingPeriodKey: input.billingPeriodKey,
          attemptId: input.attemptId,
          orderId: input.orderId,
          paymentId: input.paymentId,
          actorUserId: input.actorUserId,
          source: input.source,
        });
      }
      throw error;
    }

    await this.renewal.markAttemptOutcome({
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      status: SubscriptionRenewalAttemptStatus.PROCESSING,
      paymentId: input.paymentId,
      actorUserId: input.actorUserId,
      source: input.source,
    });

    return {
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      attemptId: input.attemptId,
      orderId: input.orderId,
      paymentId: input.paymentId,
      outcome: 'authorized_awaiting_clinical',
      attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
    };
  }

  private async retryCapturedUnreserved(input: {
    subscriptionId: string;
    billingPeriodKey: string;
    attemptId: string;
    orderId: string;
    paymentId: string;
    actorUserId?: string | null;
    source: string;
  }): Promise<ProcessRenewalResult> {
    try {
      await this.orders.transitionOrder({
        orderId: input.orderId,
        toStatus: OrderStatus.AWAITING_FULFILLMENT,
        actorUserId: input.actorUserId,
        source: input.source,
        reason: 'renewal_captured_inventory_retry',
        expectedStatus: OrderStatus.PAYMENT_PENDING,
      });
    } catch (error) {
      if (isInventoryInsufficient(error)) {
        return this.failInventoryInsufficient({
          subscriptionId: input.subscriptionId,
          billingPeriodKey: input.billingPeriodKey,
          attemptId: input.attemptId,
          orderId: input.orderId,
          paymentId: input.paymentId,
          actorUserId: input.actorUserId,
          source: input.source,
        });
      }
      throw error;
    }

    await this.completeRenewalOnCapture({
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      paymentId: input.paymentId,
      orderId: input.orderId,
      actorUserId: input.actorUserId,
      source: input.source,
    });

    return {
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      attemptId: input.attemptId,
      orderId: input.orderId,
      paymentId: input.paymentId,
      outcome: 'succeeded',
      attemptStatus: SubscriptionRenewalAttemptStatus.SUCCEEDED,
    };
  }

  private async continueCapture(input: {
    subscriptionId: string;
    billingPeriodKey: string;
    attemptId: string;
    orderId: string;
    paymentId: string;
    isRx: boolean;
    actorUserId?: string | null;
    source: string;
    forceOutcome?: 'decline' | 'timeout' | null;
    transitionFromPaymentPending?: boolean;
  }): Promise<ProcessRenewalResult> {
    const capture = await this.payments.capturePayment({
      paymentId: input.paymentId,
      idempotencyKey: `renewal:${input.subscriptionId}:${input.billingPeriodKey}:capture`,
      forceOutcome: input.forceOutcome,
    });

    if (capture.lifecycleState !== PaymentLifecycleState.CAPTURED) {
      await this.renewal.markAttemptOutcome({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        status: SubscriptionRenewalAttemptStatus.FAILED,
        paymentId: input.paymentId,
        paymentStatusSummary: capture.paymentStatusSummary,
        lastErrorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        actorUserId: input.actorUserId,
        source: input.source,
      });
      return {
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: input.orderId,
        paymentId: input.paymentId,
        outcome: 'capture_failed',
        attemptStatus: SubscriptionRenewalAttemptStatus.FAILED,
      };
    }

    if (input.transitionFromPaymentPending) {
      try {
        await this.orders.transitionOrder({
          orderId: input.orderId,
          toStatus: OrderStatus.AWAITING_FULFILLMENT,
          actorUserId: input.actorUserId,
          source: input.source,
          reason: 'renewal_captured',
          expectedStatus: OrderStatus.PAYMENT_PENDING,
        });
      } catch (error) {
        if (isInventoryInsufficient(error)) {
          return this.failInventoryInsufficient({
            subscriptionId: input.subscriptionId,
            billingPeriodKey: input.billingPeriodKey,
            attemptId: input.attemptId,
            orderId: input.orderId,
            paymentId: input.paymentId,
            actorUserId: input.actorUserId,
            source: input.source,
          });
        }
        throw error;
      }
    }

    await this.completeRenewalOnCapture({
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      paymentId: input.paymentId,
      orderId: input.orderId,
      actorUserId: input.actorUserId,
      source: input.source,
    });

    return {
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      attemptId: input.attemptId,
      orderId: input.orderId,
      paymentId: input.paymentId,
      outcome: 'succeeded',
      attemptStatus: SubscriptionRenewalAttemptStatus.SUCCEEDED,
    };
  }

  private async failInventoryInsufficient(input: {
    subscriptionId: string;
    billingPeriodKey: string;
    attemptId: string;
    orderId: string;
    paymentId: string;
    actorUserId?: string | null;
    source: string;
  }): Promise<ProcessRenewalResult> {
    await this.renewal.markAttemptOutcome({
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      status: SubscriptionRenewalAttemptStatus.FAILED,
      paymentId: input.paymentId,
      lastErrorCode: ErrorCodes.INV_INSUFFICIENT,
      actorUserId: input.actorUserId,
      source: input.source,
    });
    // Inventory-only: do NOT PAST_DUE, do NOT void/refund (OD-SUB-04 / P14f).
    return {
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      attemptId: input.attemptId,
      orderId: input.orderId,
      paymentId: input.paymentId,
      outcome: 'inventory_insufficient',
      attemptStatus: SubscriptionRenewalAttemptStatus.FAILED,
    };
  }

  private async failAuthorization(input: {
    subscriptionId: string;
    billingPeriodKey: string;
    attemptId: string;
    orderId: string;
    paymentId: string | null;
    errorCode: string;
    actorUserId?: string | null;
    source: string;
  }): Promise<void> {
    await this.renewal.markAttemptOutcome({
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      status: SubscriptionRenewalAttemptStatus.FAILED,
      paymentId: input.paymentId,
      paymentStatusSummary: 'failed',
      lastErrorCode: input.errorCode,
      actorUserId: input.actorUserId,
      source: input.source,
    });
    await this.subscriptions.markPastDue({
      subscriptionId: input.subscriptionId,
      toStatus: SubscriptionStatus.PAST_DUE,
      actorUserId: input.actorUserId,
      source: input.source,
      reason: 'renewal_payment_failed',
      failedRenewalAttempt: true,
    });
  }

  /**
   * Lock due ACTIVE renewals and PAST_DUE grace retries (SKIP LOCKED).
   */
  private async lockDueSubscriptionIds(
    now: Date,
    limit: number,
  ): Promise<string[]> {
    type Row = { id: string };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT s.id
      FROM subscriptions s
      LEFT JOIN subscription_plans p ON p.id = s.plan_id
      LEFT JOIN LATERAL (
        SELECT a.status, a.last_error_at, a.updated_at, a.retry_count
        FROM subscription_renewal_attempts a
        WHERE a.subscription_id = s.id
        ORDER BY a.created_at DESC
        LIMIT 1
      ) latest ON true
      WHERE s.deleted_at IS NULL
        AND s.archived_at IS NULL
        AND (
          (
            s.status = 'ACTIVE'
            AND s.next_renewal_at IS NOT NULL
            AND s.next_renewal_at <= ${now}
          )
          OR (
            s.status = 'PAST_DUE'
            AND latest.status = 'FAILED'
            AND (
              p.grace_period_days IS NULL
              OR p.grace_period_days = 0
              OR COALESCE(latest.last_error_at, latest.updated_at) +
                 (p.grace_period_days || ' days')::interval >= ${now}
            )
          )
        )
      ORDER BY s.next_renewal_at ASC NULLS LAST
      FOR UPDATE OF s SKIP LOCKED
      LIMIT ${limit}
    `;
    return rows.map((r) => r.id);
  }
}
