import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
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

  /**
   * Claim a durable processing lease on a renewal attempt (short txn only).
   * Never hold this across a gateway network call — heartbeat instead.
   */
  async claimRenewalAttemptLease(input: {
    attemptId: string;
    leaseSeconds: number;
  }): Promise<{ claimToken: string } | null> {
    const claimToken = randomUUID();
    const leaseSeconds =
      Number.isFinite(input.leaseSeconds) && input.leaseSeconds > 0
        ? input.leaseSeconds
        : 120;
    const claimed = await this.prisma.$executeRaw`
      UPDATE subscription_renewal_attempts
      SET claim_token = ${claimToken},
          lease_expires_at = now() + (${leaseSeconds}::double precision * interval '1 second'),
          updated_at = NOW()
      WHERE id = ${input.attemptId}::uuid
        AND status <> 'SUCCEEDED'
        AND (
          claim_token IS NULL
          OR lease_expires_at IS NULL
          OR lease_expires_at < now()
        )
    `;
    if (claimed === 0) {
      return null;
    }
    return { claimToken };
  }

  /** Extend lease while a provider call is in flight (owner only). */
  async heartbeatRenewalAttemptLease(input: {
    attemptId: string;
    claimToken: string;
    leaseSeconds: number;
  }): Promise<boolean> {
    const leaseSeconds =
      Number.isFinite(input.leaseSeconds) && input.leaseSeconds > 0
        ? input.leaseSeconds
        : 120;
    const updated = await this.prisma.$executeRaw`
      UPDATE subscription_renewal_attempts
      SET lease_expires_at = now() + (${leaseSeconds}::double precision * interval '1 second'),
          updated_at = NOW()
      WHERE id = ${input.attemptId}::uuid
        AND claim_token = ${input.claimToken}
    `;
    return updated > 0;
  }

  /** Release lease only if this worker still owns it. */
  async releaseRenewalAttemptLease(input: {
    attemptId: string;
    claimToken: string;
  }): Promise<boolean> {
    const updated = await this.prisma.$executeRaw`
      UPDATE subscription_renewal_attempts
      SET claim_token = NULL,
          lease_expires_at = NULL,
          updated_at = NOW()
      WHERE id = ${input.attemptId}::uuid
        AND claim_token = ${input.claimToken}
    `;
    return updated > 0;
  }

  /**
   * Atomically allocate the next authorize attempt number under the current
   * claim owner. Used to mint `renewal:{sub}:{period}:authorize:a{n}` keys.
   * `claimToken` is required — unscoped allocation is not allowed.
   */
  async allocateAuthorizeAttemptNumber(
    attemptId: string,
    claimToken: string,
  ): Promise<number | null> {
    if (!claimToken) {
      return null;
    }
    const rows = await this.prisma.$queryRaw<
      Array<{ authorize_attempt_number: number }>
    >`
      UPDATE subscription_renewal_attempts
      SET authorize_attempt_number = authorize_attempt_number + 1,
          updated_at = NOW()
      WHERE id = ${attemptId}::uuid
        AND claim_token = ${claimToken}
      RETURNING authorize_attempt_number
    `;
    return rows[0]?.authorize_attempt_number ?? null;
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
        subscription.status !== SubscriptionStatus.ACTIVE
      ) {
        throw new BadRequestException({
          code: ErrorCodes.SUB_INVALID_TRANSITION,
          message: `Manual renewal is only allowed from ACTIVE (got ${subscription.status})`,
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

  /**
   * Persist attempt outcome. When `claimToken` is provided (worker money paths),
   * the write applies only if `claim_token` is non-null and equals the token —
   * a cleared (NULL) token after release never authorizes a stale write.
   * Webhook paths omit `claimToken` (no worker lease).
   */
  async markAttemptOutcome(input: {
    subscriptionId: string;
    billingPeriodKey: string;
    status: SubscriptionRenewalAttemptStatus;
    paymentId?: string | null;
    paymentStatusSummary?: string | null;
    lastErrorCode?: string | null;
    actorUserId?: string | null;
    source?: string;
    claimToken?: string | null;
  }): Promise<{
    attempt: {
      id: string;
      status: SubscriptionRenewalAttemptStatus;
      paymentId: string | null;
      claimToken: string | null;
    };
    applied: boolean;
  }> {
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

      if (input.claimToken != null && input.claimToken !== '') {
        if (
          attempt.claimToken == null ||
          attempt.claimToken !== input.claimToken
        ) {
          return { attempt, applied: false };
        }
        const gated = await tx.subscriptionRenewalAttempt.updateMany({
          where: {
            id: attempt.id,
            claimToken: input.claimToken,
          },
          data: {
            status: input.status,
            paymentId: input.paymentId ?? attempt.paymentId,
            paymentStatusSummary:
              input.paymentStatusSummary ?? attempt.paymentStatusSummary,
            lastErrorCode:
              input.lastErrorCode !== undefined
                ? input.lastErrorCode
                : attempt.lastErrorCode,
            lastErrorAt: input.lastErrorCode ? new Date() : attempt.lastErrorAt,
          },
        });
        if (gated.count === 0) {
          return { attempt, applied: false };
        }
        const updated = await tx.subscriptionRenewalAttempt.findUniqueOrThrow({
          where: { id: attempt.id },
        });
        await tx.subscriptionActivity.create({
          data: {
            subscriptionId: input.subscriptionId,
            actorUserId: input.actorUserId ?? null,
            kind: 'renewal_attempt_outcome',
            summary: `Attempt ${input.status}`,
            metadata: {
              billingPeriodKey: input.billingPeriodKey,
              status: input.status,
              paymentId: input.paymentId ?? null,
              lastErrorCode: input.lastErrorCode ?? null,
              source: input.source ?? 'system',
            },
          },
        });
        return { attempt: updated, applied: true };
      }

      const updated = await tx.subscriptionRenewalAttempt.update({
        where: { id: attempt.id },
        data: {
          status: input.status,
          paymentId: input.paymentId ?? attempt.paymentId,
          paymentStatusSummary:
            input.paymentStatusSummary ?? attempt.paymentStatusSummary,
          lastErrorCode:
            input.lastErrorCode !== undefined
              ? input.lastErrorCode
              : attempt.lastErrorCode,
          lastErrorAt: input.lastErrorCode ? new Date() : attempt.lastErrorAt,
        },
      });
      await tx.subscriptionActivity.create({
        data: {
          subscriptionId: input.subscriptionId,
          actorUserId: input.actorUserId ?? null,
          kind: 'renewal_attempt_outcome',
          summary: `Attempt ${input.status}`,
          metadata: {
            billingPeriodKey: input.billingPeriodKey,
            status: input.status,
            paymentId: input.paymentId ?? null,
            lastErrorCode: input.lastErrorCode ?? null,
            source: input.source ?? 'system',
          },
        },
      });
      return { attempt: updated, applied: true };
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
