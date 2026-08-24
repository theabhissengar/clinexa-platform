import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SubscriptionRenewalAttemptStatus,
  SubscriptionStatus,
  type Subscription,
  type SubscriptionItem,
  type SubscriptionPlan,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type {
  AttachRenewalOrderInput,
  OpenRenewalAttemptInput,
  PeriodPlanConfig,
  RenewalOrderRequest,
} from './subscription.types';
import {
  NOOP_SUBSCRIPTION_SIDE_EFFECTS,
  type SubscriptionSideEffectHooks,
} from './subscription-side-effects';
import { SubscriptionsLifecycleService } from './subscriptions-lifecycle.service';
import { SubscriptionsScheduleService } from './subscriptions-schedule.service';

type Tx = Prisma.TransactionClient;

type SubscriptionWithPlanItems = Subscription & {
  plan: SubscriptionPlan;
  items: SubscriptionItem[];
};

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}

@Injectable()
export class SubscriptionsRenewalService {
  private sideEffects: SubscriptionSideEffectHooks =
    NOOP_SUBSCRIPTION_SIDE_EFFECTS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: SubscriptionsLifecycleService,
    private readonly schedule: SubscriptionsScheduleService,
  ) {}

  setSideEffectHooks(hooks: SubscriptionSideEffectHooks): void {
    this.sideEffects = hooks;
  }

  isAutoDue(
    subscription: Pick<
      Subscription,
      'status' | 'nextRenewalAt' | 'deletedAt' | 'archivedAt'
    >,
    now: Date,
  ): boolean {
    if (subscription.deletedAt != null || subscription.archivedAt != null) {
      return false;
    }
    if (this.lifecycle.isTerminal(subscription.status)) {
      return false;
    }
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      return false;
    }
    if (subscription.nextRenewalAt == null) {
      return false;
    }
    return subscription.nextRenewalAt.getTime() <= now.getTime();
  }

  currentBillingPeriodKey(
    subscriptionId: string,
    currentPeriodEnd: Date | null,
  ): string {
    if (currentPeriodEnd == null) {
      throw new BadRequestException({
        code: ErrorCodes.SUB_INVALID_TRANSITION,
        message: 'Cannot compute billingPeriodKey without currentPeriodEnd',
      });
    }
    return this.schedule.billingPeriodKey(subscriptionId, currentPeriodEnd);
  }

  buildRenewalOrderRequest(
    subscription: SubscriptionWithPlanItems,
    billingPeriodKey: string,
  ): RenewalOrderRequest {
    return {
      subscriptionId: subscription.id,
      patientUserId: subscription.patientUserId,
      billingPeriodKey,
      orderType: 'SUBSCRIPTION_RENEWAL',
      lines: subscription.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        sku: item.sku,
        productType: item.productType,
        isRxEligible: item.isRxEligible,
        catalogMetadata: item.catalogMetadata,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        salePriceCents: item.salePriceCents,
        currency: item.currency,
      })),
    };
  }

  /**
   * Insert or load the unique attempt for (subscriptionId, billingPeriodKey).
   * Duplicate creates resolve to the existing row (SUB-IDEM-001).
   */
  async ensureAttempt(params: {
    subscriptionId: string;
    billingPeriodKey: string;
    actorUserId?: string | null;
    source: string;
    tx?: Tx;
  }) {
    const db = params.tx ?? this.prisma;
    const existing = await db.subscriptionRenewalAttempt.findUnique({
      where: {
        subscriptionId_billingPeriodKey: {
          subscriptionId: params.subscriptionId,
          billingPeriodKey: params.billingPeriodKey,
        },
      },
    });
    if (existing) {
      return { attempt: existing, created: false };
    }

    try {
      const attempt = await db.subscriptionRenewalAttempt.create({
        data: {
          subscriptionId: params.subscriptionId,
          billingPeriodKey: params.billingPeriodKey,
          status: SubscriptionRenewalAttemptStatus.PENDING,
          actorUserId: params.actorUserId ?? null,
          source: params.source,
          retryCount: 0,
        },
      });
      return { attempt, created: true };
    } catch (error) {
      if (!isUniqueConflict(error)) {
        throw error;
      }
      const raced = await db.subscriptionRenewalAttempt.findUnique({
        where: {
          subscriptionId_billingPeriodKey: {
            subscriptionId: params.subscriptionId,
            billingPeriodKey: params.billingPeriodKey,
          },
        },
      });
      if (!raced) {
        throw new ConflictException({
          code: ErrorCodes.SUB_DUPLICATE_PERIOD,
          message: 'Duplicate renewal period conflict could not be resolved',
        });
      }
      return { attempt: raced, created: false };
    }
  }

  async openRenewalAttempt(input: OpenRenewalAttemptInput) {
    const now = input.now ?? new Date();
    const source = input.source ?? 'system';

    const result = await this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.findUnique({
        where: { id: input.subscriptionId },
        include: { plan: true, items: true },
      });
      if (!subscription || subscription.deletedAt != null) {
        throw new NotFoundException({
          code: ErrorCodes.RES_NOT_FOUND,
          message: 'Subscription not found',
        });
      }

      if (input.mode === 'auto' && !this.isAutoDue(subscription, now)) {
        throw new BadRequestException({
          code: ErrorCodes.SUB_INVALID_TRANSITION,
          message:
            'Subscription is not auto-due (must be ACTIVE with nextRenewalAt <= now)',
        });
      }

      if (
        input.mode === 'manual' &&
        (this.lifecycle.isTerminal(subscription.status) ||
          subscription.status === SubscriptionStatus.PENDING_SETUP)
      ) {
        throw new BadRequestException({
          code: ErrorCodes.SUB_INVALID_TRANSITION,
          message: `Manual renewal is not allowed from ${subscription.status}`,
        });
      }

      const billingPeriodKey = this.currentBillingPeriodKey(
        subscription.id,
        subscription.currentPeriodEnd,
      );

      if (input.mode === 'retry') {
        const existing = await tx.subscriptionRenewalAttempt.findUnique({
          where: {
            subscriptionId_billingPeriodKey: {
              subscriptionId: subscription.id,
              billingPeriodKey,
            },
          },
        });
        if (!existing) {
          throw new NotFoundException({
            code: ErrorCodes.RES_NOT_FOUND,
            message: 'No renewal attempt exists for this period to retry',
          });
        }
        if (
          existing.status !== SubscriptionRenewalAttemptStatus.FAILED &&
          existing.status !== SubscriptionRenewalAttemptStatus.PROCESSING &&
          existing.status !== SubscriptionRenewalAttemptStatus.PENDING
        ) {
          throw new BadRequestException({
            code: ErrorCodes.SUB_DUPLICATE_PERIOD,
            message: `Retry is not allowed for attempt status ${existing.status}`,
          });
        }
        const retried = await tx.subscriptionRenewalAttempt.update({
          where: { id: existing.id },
          data: {
            retryCount: existing.retryCount + 1,
            status: SubscriptionRenewalAttemptStatus.PROCESSING,
            actorUserId: input.actorUserId ?? existing.actorUserId,
            source,
          },
        });
        await tx.subscriptionActivity.create({
          data: {
            subscriptionId: subscription.id,
            actorUserId: input.actorUserId ?? null,
            kind: 'renewal_retry',
            summary: `Retry period ${billingPeriodKey}`,
            metadata: {
              billingPeriodKey,
              attemptId: retried.id,
              retryCount: retried.retryCount,
            },
          },
        });
        return {
          subscription,
          attempt: retried,
          created: false,
          billingPeriodKey,
          orderRequest: this.buildRenewalOrderRequest(
            subscription,
            billingPeriodKey,
          ),
        };
      }

      const ensured = await this.ensureAttempt({
        subscriptionId: subscription.id,
        billingPeriodKey,
        actorUserId: input.actorUserId ?? null,
        source,
        tx,
      });

      if (
        !ensured.created &&
        ensured.attempt.orderId &&
        input.mode === 'auto'
      ) {
        return {
          subscription,
          attempt: ensured.attempt,
          created: false,
          billingPeriodKey,
          orderRequest: this.buildRenewalOrderRequest(
            subscription,
            billingPeriodKey,
          ),
        };
      }

      const processing =
        ensured.attempt.status === SubscriptionRenewalAttemptStatus.PENDING
          ? await tx.subscriptionRenewalAttempt.update({
              where: { id: ensured.attempt.id },
              data: { status: SubscriptionRenewalAttemptStatus.PROCESSING },
            })
          : ensured.attempt;

      await tx.subscriptionActivity.create({
        data: {
          subscriptionId: subscription.id,
          actorUserId: input.actorUserId ?? null,
          kind: 'renewal_attempt_opened',
          summary: `${input.mode} renewal ${billingPeriodKey}`,
          metadata: {
            billingPeriodKey,
            attemptId: processing.id,
            created: ensured.created,
            mode: input.mode,
          },
        },
      });

      return {
        subscription,
        attempt: processing,
        created: ensured.created,
        billingPeriodKey,
        orderRequest: this.buildRenewalOrderRequest(
          subscription,
          billingPeriodKey,
        ),
      };
    });

    let orderId = result.attempt.orderId;
    if (!orderId && this.sideEffects.onRequestRenewalOrder) {
      orderId =
        (await this.sideEffects.onRequestRenewalOrder(result.orderRequest)) ??
        null;
      if (orderId) {
        await this.attachRenewalOrder({
          subscriptionId: result.subscription.id,
          billingPeriodKey: result.billingPeriodKey,
          orderId,
          actorUserId: input.actorUserId ?? null,
          source,
        });
      }
    }

    return {
      ...result,
      attempt: { ...result.attempt, orderId },
    };
  }

  async attachRenewalOrder(input: AttachRenewalOrderInput) {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.subscriptionRenewalAttempt.findUnique({
        where: {
          subscriptionId_billingPeriodKey: {
            subscriptionId: input.subscriptionId,
            billingPeriodKey: input.billingPeriodKey,
          },
        },
      });
      if (!attempt) {
        throw new NotFoundException({
          code: ErrorCodes.RES_NOT_FOUND,
          message: 'Renewal attempt not found',
        });
      }
      if (attempt.orderId && attempt.orderId !== input.orderId) {
        throw new ConflictException({
          code: ErrorCodes.SUB_DUPLICATE_PERIOD,
          message: 'Attempt already has a different orderId',
        });
      }

      const order = await tx.order.findUnique({
        where: { id: input.orderId },
      });
      if (!order || order.deletedAt != null) {
        throw new NotFoundException({
          code: ErrorCodes.RES_NOT_FOUND,
          message: 'Order not found',
        });
      }
      if (
        order.subscriptionId &&
        order.subscriptionId !== input.subscriptionId
      ) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_INVALID_FORMAT,
          message: 'Order belongs to a different subscription',
        });
      }

      const updatedAttempt = await tx.subscriptionRenewalAttempt.update({
        where: { id: attempt.id },
        data: { orderId: input.orderId },
      });
      await tx.subscription.update({
        where: { id: input.subscriptionId },
        data: { latestOrderId: input.orderId },
      });
      // Order.subscriptionId is owned by Orders (set at create). Subscriptions
      // only records opaque order refs on the attempt + latestOrderId.
      await tx.subscriptionActivity.create({
        data: {
          subscriptionId: input.subscriptionId,
          actorUserId: input.actorUserId ?? null,
          kind: 'renewal_order_attached',
          summary: `Attached order ${order.orderNumber}`,
          metadata: {
            orderId: order.id,
            billingPeriodKey: input.billingPeriodKey,
          },
        },
      });
      return updatedAttempt;
    });
  }

  planConfig(plan: SubscriptionPlan): PeriodPlanConfig {
    return {
      billingInterval: plan.billingInterval,
      intervalCount: plan.intervalCount,
      customIntervalDays: plan.customIntervalDays,
    };
  }
}
