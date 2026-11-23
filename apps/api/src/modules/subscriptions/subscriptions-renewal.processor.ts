import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatus,
  OrderType,
  PaymentInitiator,
  PaymentLifecycleState,
  PaymentPurpose,
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
    | 'authorization_pending'
    | 'capture_failed'
    | 'address_missing'
    | 'order_create_failed'
    | 'skipped'
    | 'method_missing'
    | 'in_flight'
    | 'inventory_insufficient'
    | 'clinical_hold';
  attemptStatus: SubscriptionRenewalAttemptStatus;
};

export type DueBatchResult = {
  scanned: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  /** P3-REN-001: ACTIVE subscriptions expired because endsAt <= now. */
  expired: number;
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
    private readonly config: ConfigService,
  ) {}

  private renewalLeaseSeconds(): number {
    const raw = this.config.get<number>('payments.renewalLeaseSeconds');
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0
      ? raw
      : 120;
  }

  private renewalMaxAuthorizeAttempts(): number {
    const raw = this.config.get<number>('payments.renewalMaxAuthorizeAttempts');
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1
      ? Math.floor(raw)
      : 5;
  }

  private renewalMinRetryDelaySeconds(): number {
    const raw = this.config.get<number>('payments.renewalMinRetryDelaySeconds');
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
      ? Math.floor(raw)
      : 3600;
  }

  private isPermanentMethodError(error: unknown): boolean {
    const code = extractErrorCode(error);
    return code === ErrorCodes.PAY_METHOD_INVALID;
  }

  private isTransientProviderError(error: unknown): boolean {
    if (error instanceof ConflictException) {
      return true;
    }
    const code = extractErrorCode(error);
    return code === ErrorCodes.PAY_PROVIDER_UNAVAILABLE;
  }

  /**
   * Heartbeat during a provider call. No overlapping heartbeats; DB errors
   * count as ownership loss. Never holds a DB transaction across the work fn.
   */
  private async withLeaseHeartbeat<T>(input: {
    attemptId: string;
    claimToken: string;
    leaseSeconds: number;
    work: () => Promise<T>;
  }): Promise<{ ok: true; value: T } | { ok: false; value?: T }> {
    const beat = async (): Promise<boolean> => {
      try {
        return await this.subscriptions.heartbeatRenewalAttemptLease({
          attemptId: input.attemptId,
          claimToken: input.claimToken,
          leaseSeconds: input.leaseSeconds,
        });
      } catch (error) {
        this.logger.warn(
          `Renewal lease heartbeat failed for ${input.attemptId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return false;
      }
    };

    if (!(await beat())) {
      return { ok: false };
    }

    let inFlight = false;
    let lost = false;
    const intervalMs = Math.max(
      1_000,
      Math.floor((input.leaseSeconds * 1000) / 3),
    );
    const timer = setInterval(() => {
      if (inFlight || lost) {
        return;
      }
      inFlight = true;
      void beat()
        .then((ok) => {
          if (!ok) {
            lost = true;
          }
        })
        .finally(() => {
          inFlight = false;
        });
    }, intervalMs);

    try {
      const value = await input.work();
      if (lost || !(await beat())) {
        return { ok: false, value };
      }
      return { ok: true, value };
    } finally {
      clearInterval(timer);
    }
  }

  private inFlightResult(input: {
    subscriptionId: string;
    billingPeriodKey: string;
    attemptId: string;
    orderId: string | null;
    paymentId: string | null;
    attemptStatus: SubscriptionRenewalAttemptStatus;
  }): ProcessRenewalResult {
    return {
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      attemptId: input.attemptId,
      orderId: input.orderId,
      paymentId: input.paymentId,
      outcome: 'in_flight',
      attemptStatus: input.attemptStatus,
    };
  }

  async processSubscription(
    input: ProcessRenewalInput,
  ): Promise<ProcessRenewalResult> {
    const now = input.now ?? new Date();

    // P14g: DECLINED_HOLD must never enter a new money path (36 §14).
    const holdCheck = await this.prisma.subscription.findUnique({
      where: { id: input.subscriptionId },
      select: {
        clinicalRequirement: true,
        currentPeriodEnd: true,
      },
    });
    if (
      holdCheck?.clinicalRequirement ===
      SubscriptionClinicalRequirement.DECLINED_HOLD
    ) {
      const billingPeriodKey =
        holdCheck.currentPeriodEnd != null
          ? this.schedule.billingPeriodKey(
              input.subscriptionId,
              holdCheck.currentPeriodEnd,
            )
          : 'unknown';
      const attempt = await this.prisma.subscriptionRenewalAttempt.findUnique({
        where: {
          subscriptionId_billingPeriodKey: {
            subscriptionId: input.subscriptionId,
            billingPeriodKey,
          },
        },
      });
      return {
        subscriptionId: input.subscriptionId,
        billingPeriodKey,
        attemptId: attempt?.id ?? 'none',
        orderId: attempt?.orderId ?? null,
        paymentId: attempt?.paymentId ?? null,
        outcome: 'clinical_hold',
        attemptStatus:
          attempt?.status ?? SubscriptionRenewalAttemptStatus.FAILED,
      };
    }

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

    const leaseSeconds = this.renewalLeaseSeconds();
    const claimed = await this.subscriptions.claimRenewalAttemptLease({
      attemptId,
      leaseSeconds,
    });
    if (!claimed) {
      return {
        subscriptionId: input.subscriptionId,
        billingPeriodKey,
        attemptId,
        orderId: opened.attempt.orderId,
        paymentId: opened.attempt.paymentId,
        outcome: 'in_flight',
        attemptStatus: opened.attempt.status,
      };
    }
    const claimToken = claimed.claimToken;

    try {
      // Resume in-flight / FAILED attempts by Order + Payment state (P14f).
      if (
        opened.attempt.orderId &&
        (opened.attempt.status ===
          SubscriptionRenewalAttemptStatus.PROCESSING ||
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
          claimToken,
          leaseSeconds,
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
          const marked = await this.renewal.markAttemptOutcome({
            subscriptionId: input.subscriptionId,
            billingPeriodKey,
            status: SubscriptionRenewalAttemptStatus.FAILED,
            lastErrorCode: code,
            actorUserId: input.actorUserId,
            source: input.source,
            claimToken,
          });
          if (!marked.applied) {
            return this.inFlightResult({
              subscriptionId: input.subscriptionId,
              billingPeriodKey,
              attemptId,
              orderId: null,
              paymentId: null,
              attemptStatus: opened.attempt.status,
            });
          }
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
        include: { plan: true },
      });
      if (!subscription) {
        throw new NotFoundException({
          code: ErrorCodes.RES_NOT_FOUND,
          message: 'Subscription not found',
        });
      }

      // Zero-total: no payment method required; never write synthetic UUIDs.
      if (order.totalCents === 0) {
        const zeroAuth = await this.payments.authorizeForOrder({
          orderId,
          subscriptionId: input.subscriptionId,
          paymentMethodId: subscription.paymentMethodId,
          amountCents: 0,
          currency: order.currency,
          purpose: PaymentPurpose.RENEWAL,
          initiator: PaymentInitiator.RENEWAL,
          idempotencyKey: `renewal:${input.subscriptionId}:${billingPeriodKey}:authorize:zero`,
          forceOutcome: input.forceOutcome,
        });
        await this.subscriptions.recordPaymentSnapshot({
          subscriptionId: input.subscriptionId,
          paymentStatusSummary: zeroAuth.paymentStatusSummary,
          latestPaymentId: null,
          actorUserId: input.actorUserId,
          source: input.source,
        });
        const zeroMarked = await this.renewal.markAttemptOutcome({
          subscriptionId: input.subscriptionId,
          billingPeriodKey,
          status: SubscriptionRenewalAttemptStatus.PROCESSING,
          paymentId: null,
          paymentStatusSummary: zeroAuth.paymentStatusSummary,
          actorUserId: input.actorUserId,
          source: input.source,
          claimToken,
        });
        if (!zeroMarked.applied) {
          return this.inFlightResult({
            subscriptionId: input.subscriptionId,
            billingPeriodKey,
            attemptId,
            orderId,
            paymentId: null,
            attemptStatus: opened.attempt.status,
          });
        }
        if (order.isRxOrder) {
          return this.transitionRxToClinical({
            subscriptionId: input.subscriptionId,
            billingPeriodKey,
            attemptId,
            orderId,
            paymentId: null,
            actorUserId: input.actorUserId,
            source: input.source,
            reason: 'renewal_zero_total_authorized',
          });
        }
        await this.orders.transitionOrder({
          orderId,
          toStatus: OrderStatus.AWAITING_FULFILLMENT,
          actorUserId: input.actorUserId ?? null,
          source: input.source,
          reason: 'renewal_zero_total',
          expectedStatus: OrderStatus.PAYMENT_PENDING,
        });
        await this.completeRenewalOnCapture({
          subscriptionId: input.subscriptionId,
          billingPeriodKey,
          orderId,
          paymentId: null,
          actorUserId: input.actorUserId,
          source: input.source,
        });
        return {
          subscriptionId: input.subscriptionId,
          billingPeriodKey,
          attemptId,
          orderId,
          paymentId: null,
          outcome: 'succeeded',
          attemptStatus: SubscriptionRenewalAttemptStatus.SUCCEEDED,
        };
      }

      if (!subscription.paymentMethodId) {
        const failed = await this.failAuthorization({
          subscriptionId: input.subscriptionId,
          billingPeriodKey,
          attemptId,
          orderId,
          paymentId: null,
          errorCode: ErrorCodes.PAY_METHOD_INVALID,
          actorUserId: input.actorUserId,
          source: input.source,
          claimToken,
        });
        if (!failed) {
          return this.inFlightResult({
            subscriptionId: input.subscriptionId,
            billingPeriodKey,
            attemptId,
            orderId,
            paymentId: null,
            attemptStatus: opened.attempt.status,
          });
        }
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

      const latestPayment = await this.payments.findLatestForOrder(orderId);

      if (
        latestPayment?.lifecycleState ===
        PaymentLifecycleState.PENDING_AUTHORIZATION
      ) {
        const graceEnded = this.isGracePeriodEnded(subscription, now);
        if (
          graceEnded &&
          (latestPayment.providerStatusRaw === 'requires_action' ||
            opened.attempt.lastErrorCode === ErrorCodes.PAY_ACTION_REQUIRED)
        ) {
          return this.abandonPendingAuthorizationAfterGrace({
            subscriptionId: input.subscriptionId,
            billingPeriodKey,
            attemptId,
            orderId,
            paymentId: latestPayment.id,
            actorUserId: input.actorUserId,
            source: input.source,
            claimToken,
            leaseSeconds,
          });
        }

        const gated = await this.withLeaseHeartbeat({
          attemptId,
          claimToken,
          leaseSeconds,
          work: () =>
            this.payments.authorizeForOrder({
              orderId,
              subscriptionId: input.subscriptionId,
              paymentMethodId: subscription.paymentMethodId!,
              amountCents: order.totalCents,
              currency: order.currency,
              purpose: PaymentPurpose.RENEWAL,
              initiator: PaymentInitiator.RENEWAL,
              idempotencyKey: latestPayment.idempotencyKey,
              forceOutcome: input.forceOutcome,
            }),
        });
        if (!gated.ok || !gated.value) {
          return this.inFlightResult({
            subscriptionId: input.subscriptionId,
            billingPeriodKey,
            attemptId,
            orderId,
            paymentId: latestPayment.id,
            attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
          });
        }
        return this.classifyAuthorizeOutcome({
          input,
          billingPeriodKey,
          attemptId,
          orderId,
          order,
          auth: gated.value,
          claimToken,
        });
      }

      const maxAttempts = this.renewalMaxAuthorizeAttempts();
      const currentAttemptNumber = opened.attempt.authorizeAttemptNumber ?? 0;
      if (currentAttemptNumber >= maxAttempts) {
        const failed = await this.failAuthorization({
          subscriptionId: input.subscriptionId,
          billingPeriodKey,
          attemptId,
          orderId,
          paymentId: latestPayment?.id ?? null,
          errorCode: ErrorCodes.PAY_AUTHORIZATION_FAILED,
          actorUserId: input.actorUserId,
          source: input.source,
          claimToken,
        });
        if (!failed) {
          return this.inFlightResult({
            subscriptionId: input.subscriptionId,
            billingPeriodKey,
            attemptId,
            orderId,
            paymentId: latestPayment?.id ?? null,
            attemptStatus: opened.attempt.status,
          });
        }
        return {
          subscriptionId: input.subscriptionId,
          billingPeriodKey,
          attemptId,
          orderId,
          paymentId: latestPayment?.id ?? null,
          outcome: 'authorization_failed',
          attemptStatus: SubscriptionRenewalAttemptStatus.FAILED,
        };
      }

      // Provider already advanced past authorize — never mint a new a{n}.
      if (latestPayment?.lifecycleState === PaymentLifecycleState.CAPTURED) {
        await this.completeRenewalOnCapture({
          subscriptionId: input.subscriptionId,
          billingPeriodKey,
          orderId,
          paymentId: latestPayment.id,
          actorUserId: input.actorUserId,
          source: input.source,
        });
        return {
          subscriptionId: input.subscriptionId,
          billingPeriodKey,
          attemptId,
          orderId,
          paymentId: latestPayment.id,
          outcome: 'succeeded',
          attemptStatus: SubscriptionRenewalAttemptStatus.SUCCEEDED,
        };
      }
      if (
        latestPayment &&
        (latestPayment.lifecycleState === PaymentLifecycleState.AUTHORIZED ||
          latestPayment.lifecycleState ===
            PaymentLifecycleState.CAPTURE_PENDING ||
          latestPayment.lifecycleState === PaymentLifecycleState.CAPTURE_FAILED)
      ) {
        return this.continueCapture({
          subscriptionId: input.subscriptionId,
          billingPeriodKey,
          attemptId,
          orderId,
          paymentId: latestPayment.id,
          isRx: order.isRxOrder,
          actorUserId: input.actorUserId,
          source: input.source,
          forceOutcome: input.forceOutcome,
          claimToken,
          leaseSeconds,
          transitionFromPaymentPending:
            order.status === OrderStatus.PAYMENT_PENDING,
        });
      }

      // Reclaim window: reuse a{n} key if Payment exists or number already allocated.
      let authorizeKey: string | null = null;
      const priorTerminal =
        latestPayment?.lifecycleState ===
          PaymentLifecycleState.AUTHORIZATION_FAILED ||
        latestPayment?.lifecycleState === PaymentLifecycleState.VOIDED;

      // PENDING_AUTHORIZATION already handled above — any remaining payment is
      // non-pending (or absent), so reuse a{n} when a number was already allocated.
      if (!priorTerminal && currentAttemptNumber > 0) {
        const reuseKey = `renewal:${input.subscriptionId}:${billingPeriodKey}:authorize:a${currentAttemptNumber}`;
        const existing = await this.payments.findByIdempotencyKey(reuseKey);
        if (existing) {
          if (
            existing.lifecycleState ===
              PaymentLifecycleState.AUTHORIZATION_FAILED ||
            existing.lifecycleState === PaymentLifecycleState.VOIDED
          ) {
            // Confirmed terminal for this a{n} — fall through to allocate next.
          } else {
            authorizeKey = reuseKey;
          }
        } else {
          // Number bumped but Payment not visible yet — reuse same key (no new a{n}).
          authorizeKey = reuseKey;
        }
      }

      if (authorizeKey == null) {
        const existingKey =
          latestPayment &&
          !priorTerminal &&
          typeof latestPayment.idempotencyKey === 'string' &&
          latestPayment.idempotencyKey.length > 0
            ? latestPayment.idempotencyKey
            : null;
        if (existingKey) {
          // Unexpected non-terminal latest — reconcile via its key; never allocate.
          authorizeKey = existingKey;
        } else {
          const attemptNumber =
            await this.subscriptions.allocateAuthorizeAttemptNumber(
              attemptId,
              claimToken,
            );
          if (attemptNumber == null) {
            return this.inFlightResult({
              subscriptionId: input.subscriptionId,
              billingPeriodKey,
              attemptId,
              orderId,
              paymentId: opened.attempt.paymentId,
              attemptStatus: opened.attempt.status,
            });
          }
          authorizeKey = `renewal:${input.subscriptionId}:${billingPeriodKey}:authorize:a${attemptNumber}`;
        }
      }

      const paymentMethodId = subscription.paymentMethodId;
      if (!paymentMethodId) {
        return this.inFlightResult({
          subscriptionId: input.subscriptionId,
          billingPeriodKey,
          attemptId,
          orderId,
          paymentId: opened.attempt.paymentId,
          attemptStatus: opened.attempt.status,
        });
      }
      const resolvedAuthorizeKey = authorizeKey;

      const gated = await this.withLeaseHeartbeat({
        attemptId,
        claimToken,
        leaseSeconds,
        work: async () => {
          try {
            return {
              kind: 'auth' as const,
              auth: await this.payments.authorizeForOrder({
                orderId,
                subscriptionId: input.subscriptionId,
                paymentMethodId,
                amountCents: order.totalCents,
                currency: order.currency,
                purpose: PaymentPurpose.RENEWAL,
                initiator: PaymentInitiator.RENEWAL,
                idempotencyKey: resolvedAuthorizeKey,
                forceOutcome: input.forceOutcome,
              }),
            };
          } catch (error) {
            return { kind: 'error' as const, error };
          }
        },
      });

      if (!gated.ok || !gated.value) {
        return this.inFlightResult({
          subscriptionId: input.subscriptionId,
          billingPeriodKey,
          attemptId,
          orderId,
          paymentId: opened.attempt.paymentId,
          attemptStatus: opened.attempt.status,
        });
      }

      if (gated.value.kind === 'error') {
        const error = gated.value.error;
        if (this.isPermanentMethodError(error)) {
          const failed = await this.failAuthorization({
            subscriptionId: input.subscriptionId,
            billingPeriodKey,
            attemptId,
            orderId,
            paymentId: null,
            errorCode: ErrorCodes.PAY_METHOD_INVALID,
            actorUserId: input.actorUserId,
            source: input.source,
            claimToken,
          });
          if (!failed) {
            return this.inFlightResult({
              subscriptionId: input.subscriptionId,
              billingPeriodKey,
              attemptId,
              orderId,
              paymentId: null,
              attemptStatus: opened.attempt.status,
            });
          }
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
        if (this.isTransientProviderError(error)) {
          const marked = await this.renewal.markAttemptOutcome({
            subscriptionId: input.subscriptionId,
            billingPeriodKey,
            status: SubscriptionRenewalAttemptStatus.PROCESSING,
            paymentId: null,
            paymentStatusSummary: 'pending',
            lastErrorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
            actorUserId: input.actorUserId,
            source: input.source,
            claimToken,
          });
          if (!marked.applied) {
            return this.inFlightResult({
              subscriptionId: input.subscriptionId,
              billingPeriodKey,
              attemptId,
              orderId,
              paymentId: null,
              attemptStatus: opened.attempt.status,
            });
          }
          return {
            subscriptionId: input.subscriptionId,
            billingPeriodKey,
            attemptId,
            orderId,
            paymentId: null,
            outcome: 'authorization_pending',
            attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
          };
        }
        throw gated.value.error;
      }

      return this.classifyAuthorizeOutcome({
        input,
        billingPeriodKey,
        attemptId,
        orderId,
        order,
        auth: gated.value.auth,
        claimToken,
      });
    } finally {
      await this.subscriptions.releaseRenewalAttemptLease({
        attemptId,
        claimToken,
      });
    }
  }

  private isGracePeriodEnded(
    subscription: {
      currentPeriodEnd: Date | null;
      nextRenewalAt: Date | null;
      plan: { gracePeriodDays: number | null };
    },
    now: Date,
  ): boolean {
    const graceDays = subscription.plan.gracePeriodDays ?? 0;
    if (graceDays <= 0) {
      return true;
    }
    const anchor =
      subscription.currentPeriodEnd ?? subscription.nextRenewalAt ?? null;
    if (!anchor) {
      return true;
    }
    const end = new Date(anchor.getTime());
    end.setUTCDate(end.getUTCDate() + graceDays);
    return now.getTime() > end.getTime();
  }

  private async abandonPendingAuthorizationAfterGrace(input: {
    subscriptionId: string;
    billingPeriodKey: string;
    attemptId: string;
    orderId: string;
    paymentId: string;
    actorUserId?: string | null;
    source: string;
    claimToken: string;
    leaseSeconds: number;
  }): Promise<ProcessRenewalResult> {
    const gated = await this.withLeaseHeartbeat({
      attemptId: input.attemptId,
      claimToken: input.claimToken,
      leaseSeconds: input.leaseSeconds,
      work: () =>
        this.payments.cancelPendingAuthorization({
          paymentId: input.paymentId,
          idempotencyKey: `renewal:${input.subscriptionId}:${input.billingPeriodKey}:abandon:${input.paymentId}`,
          reason: ErrorCodes.PAY_RENEWAL_ABANDONED,
        }),
    });

    // Always re-read payment after cancel — capture may have raced.
    const payment = await this.payments.findById(input.paymentId);
    const outcome =
      payment != null
        ? this.payments.classifyPaymentLifecycleForAbandon(
            payment.lifecycleState,
          )
        : (gated.value ?? 'not_found');

    if (!gated.ok) {
      // Lease lost: preserve provider result; do not mutate as abandoned.
      if (outcome === 'captured') {
        await this.completeRenewalOnCapture({
          subscriptionId: input.subscriptionId,
          billingPeriodKey: input.billingPeriodKey,
          orderId: input.orderId,
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
          outcome: 'succeeded',
          attemptStatus: SubscriptionRenewalAttemptStatus.SUCCEEDED,
        };
      }
      return this.inFlightResult({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: input.orderId,
        paymentId: input.paymentId,
        attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
      });
    }

    if (outcome === 'captured') {
      await this.completeRenewalOnCapture({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        orderId: input.orderId,
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
        outcome: 'succeeded',
        attemptStatus: SubscriptionRenewalAttemptStatus.SUCCEEDED,
      };
    }

    if (outcome === 'authorized') {
      return this.continueCapture({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: input.orderId,
        paymentId: input.paymentId,
        isRx: false,
        actorUserId: input.actorUserId,
        source: input.source,
        claimToken: input.claimToken,
        leaseSeconds: input.leaseSeconds,
        transitionFromPaymentPending: true,
      });
    }

    if (outcome === 'voided' || outcome === 'authorization_failed') {
      const failed = await this.failAuthorization({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: input.orderId,
        paymentId: input.paymentId,
        errorCode: ErrorCodes.PAY_RENEWAL_ABANDONED,
        actorUserId: input.actorUserId,
        source: input.source,
        claimToken: input.claimToken,
      });
      if (!failed) {
        return this.inFlightResult({
          subscriptionId: input.subscriptionId,
          billingPeriodKey: input.billingPeriodKey,
          attemptId: input.attemptId,
          orderId: input.orderId,
          paymentId: input.paymentId,
          attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
        });
      }
      return {
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: input.orderId,
        paymentId: input.paymentId,
        outcome: 'authorization_failed',
        attemptStatus: SubscriptionRenewalAttemptStatus.FAILED,
      };
    }

    if (outcome === 'refunded') {
      const marked = await this.renewal.markAttemptOutcome({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        status: SubscriptionRenewalAttemptStatus.FAILED,
        paymentId: input.paymentId,
        paymentStatusSummary: 'refunded',
        lastErrorCode: ErrorCodes.PAY_RENEWAL_ABANDONED,
        actorUserId: input.actorUserId,
        source: input.source,
        claimToken: input.claimToken,
      });
      if (marked.applied) {
        await this.subscriptions.markPastDue({
          subscriptionId: input.subscriptionId,
          toStatus: SubscriptionStatus.PAST_DUE,
          actorUserId: input.actorUserId,
          source: input.source,
          reason: 'renewal_refunded_during_grace',
          failedRenewalAttempt: true,
        });
      }
      return {
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: input.orderId,
        paymentId: input.paymentId,
        outcome: marked.applied ? 'authorization_failed' : 'in_flight',
        attemptStatus: marked.applied
          ? SubscriptionRenewalAttemptStatus.FAILED
          : SubscriptionRenewalAttemptStatus.PROCESSING,
      };
    }

    // unknown / not_found — retain recoverable pending; never SCA/action-required.
    await this.renewal.markAttemptOutcome({
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      status: SubscriptionRenewalAttemptStatus.PROCESSING,
      paymentId: input.paymentId,
      paymentStatusSummary: 'pending',
      lastErrorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
      actorUserId: input.actorUserId,
      source: input.source,
      claimToken: input.claimToken,
    });
    return {
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      attemptId: input.attemptId,
      orderId: input.orderId,
      paymentId: input.paymentId,
      outcome: 'authorization_pending',
      attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
    };
  }

  private async classifyAuthorizeOutcome(args: {
    input: ProcessRenewalInput;
    billingPeriodKey: string;
    attemptId: string;
    orderId: string;
    order: { isRxOrder: boolean };
    auth: {
      paymentId: string | null;
      paymentStatusSummary:
        'pending' | 'authorized_or_captured' | 'failed' | 'refunded';
      status: PaymentStatus;
      lifecycleState: PaymentLifecycleState;
    };
    claimToken: string;
  }): Promise<ProcessRenewalResult> {
    const {
      input: proc,
      billingPeriodKey,
      attemptId,
      orderId,
      order,
      auth,
      claimToken,
    } = args;

    await this.subscriptions.recordPaymentSnapshot({
      subscriptionId: proc.subscriptionId,
      paymentStatusSummary: auth.paymentStatusSummary,
      latestPaymentId: auth.paymentId,
      actorUserId: proc.actorUserId,
      source: proc.source,
    });

    if (
      auth.status === PaymentStatus.FAILED ||
      auth.lifecycleState === PaymentLifecycleState.AUTHORIZATION_FAILED ||
      auth.lifecycleState === PaymentLifecycleState.VOIDED
    ) {
      const failed = await this.failAuthorization({
        subscriptionId: proc.subscriptionId,
        billingPeriodKey,
        attemptId,
        orderId,
        paymentId: auth.paymentId,
        errorCode: ErrorCodes.PAY_AUTHORIZATION_FAILED,
        actorUserId: proc.actorUserId,
        source: proc.source,
        claimToken,
      });
      if (!failed) {
        return this.inFlightResult({
          subscriptionId: proc.subscriptionId,
          billingPeriodKey,
          attemptId,
          orderId,
          paymentId: auth.paymentId,
          attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
        });
      }
      return {
        subscriptionId: proc.subscriptionId,
        billingPeriodKey,
        attemptId,
        orderId,
        paymentId: auth.paymentId,
        outcome: 'authorization_failed',
        attemptStatus: SubscriptionRenewalAttemptStatus.FAILED,
      };
    }

    if (auth.lifecycleState === PaymentLifecycleState.PENDING_AUTHORIZATION) {
      const paymentRow = auth.paymentId
        ? await this.payments.findById(auth.paymentId)
        : null;
      const requiresAction =
        paymentRow?.providerStatusRaw === 'requires_action';
      const marked = await this.renewal.markAttemptOutcome({
        subscriptionId: proc.subscriptionId,
        billingPeriodKey,
        status: SubscriptionRenewalAttemptStatus.PROCESSING,
        paymentId: auth.paymentId,
        paymentStatusSummary: 'pending',
        lastErrorCode: requiresAction
          ? ErrorCodes.PAY_ACTION_REQUIRED
          : ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        actorUserId: proc.actorUserId,
        source: proc.source,
        claimToken,
      });
      if (!marked.applied) {
        return this.inFlightResult({
          subscriptionId: proc.subscriptionId,
          billingPeriodKey,
          attemptId,
          orderId,
          paymentId: auth.paymentId,
          attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
        });
      }
      if (requiresAction) {
        await this.subscriptions.markPastDue({
          subscriptionId: proc.subscriptionId,
          toStatus: SubscriptionStatus.PAST_DUE,
          actorUserId: proc.actorUserId,
          source: proc.source,
          reason: 'renewal_action_required',
          actionRequiredHold: true,
        });
      }
      return {
        subscriptionId: proc.subscriptionId,
        billingPeriodKey,
        attemptId,
        orderId,
        paymentId: auth.paymentId,
        outcome: 'authorization_pending',
        attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
      };
    }

    if (auth.lifecycleState !== PaymentLifecycleState.AUTHORIZED) {
      const marked = await this.renewal.markAttemptOutcome({
        subscriptionId: proc.subscriptionId,
        billingPeriodKey,
        status: SubscriptionRenewalAttemptStatus.PROCESSING,
        paymentId: auth.paymentId,
        paymentStatusSummary: 'pending',
        lastErrorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        actorUserId: proc.actorUserId,
        source: proc.source,
        claimToken,
      });
      if (!marked.applied) {
        return this.inFlightResult({
          subscriptionId: proc.subscriptionId,
          billingPeriodKey,
          attemptId,
          orderId,
          paymentId: auth.paymentId,
          attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
        });
      }
      return {
        subscriptionId: proc.subscriptionId,
        billingPeriodKey,
        attemptId,
        orderId,
        paymentId: auth.paymentId,
        outcome: 'authorization_pending',
        attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
      };
    }

    const marked = await this.renewal.markAttemptOutcome({
      subscriptionId: proc.subscriptionId,
      billingPeriodKey,
      status: SubscriptionRenewalAttemptStatus.PROCESSING,
      paymentId: auth.paymentId,
      paymentStatusSummary: auth.paymentStatusSummary,
      actorUserId: proc.actorUserId,
      source: proc.source,
      claimToken,
    });
    if (!marked.applied) {
      return this.inFlightResult({
        subscriptionId: proc.subscriptionId,
        billingPeriodKey,
        attemptId,
        orderId,
        paymentId: auth.paymentId,
        attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
      });
    }

    if (order.isRxOrder) {
      return this.transitionRxToClinical({
        subscriptionId: proc.subscriptionId,
        billingPeriodKey,
        attemptId,
        orderId,
        paymentId: auth.paymentId,
        actorUserId: proc.actorUserId,
        source: proc.source,
        reason: 'renewal_authorized',
      });
    }

    return this.continueCapture({
      subscriptionId: proc.subscriptionId,
      billingPeriodKey,
      attemptId,
      orderId,
      paymentId: auth.paymentId!,
      isRx: false,
      actorUserId: proc.actorUserId,
      source: proc.source,
      forceOutcome: proc.forceOutcome,
      claimToken,
      leaseSeconds: this.renewalLeaseSeconds(),
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
    paymentId: string | null;
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

    // Zero-total renewals have no Payment row; otherwise require CAPTURED.
    if (order.totalCents > 0) {
      const payment = await this.payments.findLatestForOrder(order.id);
      if (
        !payment ||
        payment.lifecycleState !== PaymentLifecycleState.CAPTURED
      ) {
        return;
      }
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

    const advanced = await this.prisma.$transaction(async (tx) => {
      // Conditional claim: only one completion advances the period.
      const claimed = await tx.subscriptionRenewalAttempt.updateMany({
        where: {
          subscriptionId: input.subscriptionId,
          billingPeriodKey: input.billingPeriodKey,
          status: {
            in: [
              SubscriptionRenewalAttemptStatus.PENDING,
              SubscriptionRenewalAttemptStatus.PROCESSING,
              SubscriptionRenewalAttemptStatus.FAILED,
            ],
          },
        },
        data: {
          status: SubscriptionRenewalAttemptStatus.SUCCEEDED,
          paymentId: input.paymentId,
          paymentStatusSummary: 'authorized_or_captured',
          lastErrorCode: null,
          claimToken: null,
          leaseExpiresAt: null,
        },
      });
      if (claimed.count === 0) {
        return false;
      }

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
      return true;
    });

    if (!advanced) {
      return;
    }

    await this.subscriptions.notify(
      'subscription.renewed',
      input.subscriptionId,
    );
  }

  /**
   * Webhook/payment-path auth failure → align attempt + PAST_DUE without
   * regressing newer attempts or terminal subscriptions.
   */
  async onRenewalAuthorizationFailed(input: {
    orderId: string;
    subscriptionId: string | null;
    paymentId: string;
    errorCode: string;
  }): Promise<void> {
    if (!input.subscriptionId) {
      return;
    }
    const payment = await this.payments.findById(input.paymentId);
    if (
      !payment ||
      (payment.lifecycleState !== PaymentLifecycleState.AUTHORIZATION_FAILED &&
        payment.lifecycleState !== PaymentLifecycleState.VOIDED &&
        payment.status !== PaymentStatus.FAILED)
    ) {
      // Unknown / non-terminal — never mark confirmed failure from webhook.
      return;
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { id: input.subscriptionId },
      select: { status: true },
    });
    if (
      !subscription ||
      (subscription.status !== SubscriptionStatus.ACTIVE &&
        subscription.status !== SubscriptionStatus.PAST_DUE)
    ) {
      // CANCELLED / EXPIRED / COMPLETED / MIGRATED / PAUSED — no FAILED attempt.
      return;
    }

    const attempt = await this.prisma.subscriptionRenewalAttempt.findFirst({
      where: {
        subscriptionId: input.subscriptionId,
        orderId: input.orderId,
      },
    });
    if (!attempt) {
      return;
    }
    if (attempt.status === SubscriptionRenewalAttemptStatus.SUCCEEDED) {
      return;
    }
    // Stale a{n}: ignore if attempt already points at a different payment.
    if (attempt.paymentId != null && attempt.paymentId !== input.paymentId) {
      return;
    }

    await this.renewal.markAttemptOutcome({
      subscriptionId: input.subscriptionId,
      billingPeriodKey: attempt.billingPeriodKey,
      status: SubscriptionRenewalAttemptStatus.FAILED,
      paymentId: input.paymentId,
      paymentStatusSummary: 'failed',
      lastErrorCode: input.errorCode || ErrorCodes.PAY_AUTHORIZATION_FAILED,
      source: 'payment',
    });
    await this.subscriptions.markPastDue({
      subscriptionId: input.subscriptionId,
      toStatus: SubscriptionStatus.PAST_DUE,
      source: 'payment',
      reason: 'renewal_payment_failed',
      failedRenewalAttempt: true,
    });
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

    // P3-REN-001: expire ACTIVE with endsAt <= now before due/retry processing.
    const expired = await this.expireEndedSubscriptions(now, limit);

    const dueIds = await this.lockDueSubscriptionIds(now, limit);
    const result: DueBatchResult = {
      scanned: dueIds.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      expired,
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
          outcome.outcome === 'in_flight' ||
          outcome.outcome === 'clinical_hold'
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
   * P3-REN-001: lock ACTIVE rows with endsAt <= now and call expire().
   * Does not expire PAUSED / PAST_DUE / PENDING_SETUP.
   */
  private async expireEndedSubscriptions(
    now: Date,
    limit: number,
  ): Promise<number> {
    const ids = await this.lockExpiredSubscriptionIds(now, limit);
    let expired = 0;
    for (const subscriptionId of ids) {
      try {
        await this.subscriptions.expire({
          subscriptionId,
          toStatus: SubscriptionStatus.EXPIRED,
          source: 'system',
          reason: 'ends_at_reached',
        });
        expired += 1;
      } catch (error) {
        this.logger.warn(
          `Expire failed for ${subscriptionId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return expired;
  }

  private async lockExpiredSubscriptionIds(
    now: Date,
    limit: number,
  ): Promise<string[]> {
    type Row = { id: string };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT s.id
      FROM subscriptions s
      WHERE s.deleted_at IS NULL
        AND s.archived_at IS NULL
        AND s.status = 'ACTIVE'
        AND s.ends_at IS NOT NULL
        AND s.ends_at <= ${now}
      ORDER BY s.ends_at ASC
      FOR UPDATE OF s SKIP LOCKED
      LIMIT ${limit}
    `;
    return rows.map((r) => r.id);
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
    claimToken?: string;
    leaseSeconds?: number;
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

    // P14g: declined orders must never fall through to authorize.
    if (order.status === OrderStatus.CLINICAL_DECLINED) {
      return {
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: order.id,
        paymentId: input.paymentId,
        outcome: 'clinical_hold',
        attemptStatus: SubscriptionRenewalAttemptStatus.FAILED,
      };
    }

    // P14g: mid-approve crash — complete capture path only (no re-authorize).
    if (order.status === OrderStatus.CLINICAL_APPROVED) {
      return this.resumeClinicalApprovedCapture({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: order.id,
        paymentId: input.paymentId,
        actorUserId: input.actorUserId,
        source: input.source,
        forceOutcome: input.forceOutcome,
        claimToken: input.claimToken,
        leaseSeconds: input.leaseSeconds,
      });
    }

    if (
      order.status !== OrderStatus.PAYMENT_PENDING &&
      order.status !== OrderStatus.AWAITING_FULFILLMENT
    ) {
      return null;
    }

    const payment = await this.payments.findLatestForOrder(order.id);

    // Auth/payment FAILED → fall through to existing P14e authorize retry.
    // Capture failure on fulfillment path is NOT authorization failure — retry capture only.
    if (
      payment &&
      order.status === OrderStatus.PAYMENT_PENDING &&
      (payment.lifecycleState === PaymentLifecycleState.AUTHORIZATION_FAILED ||
        payment.status === PaymentStatus.FAILED)
    ) {
      return null;
    }

    // P14g: AWAITING_FULFILLMENT + capture incomplete → capture-only retry.
    if (
      order.status === OrderStatus.AWAITING_FULFILLMENT &&
      payment &&
      (payment.lifecycleState === PaymentLifecycleState.AUTHORIZED ||
        payment.lifecycleState === PaymentLifecycleState.CAPTURE_FAILED ||
        payment.lifecycleState === PaymentLifecycleState.CAPTURE_PENDING)
    ) {
      return this.retryCaptureOnly({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: order.id,
        paymentId: payment.id,
        actorUserId: input.actorUserId,
        source: input.source,
        forceOutcome: input.forceOutcome,
        claimToken: input.claimToken,
        leaseSeconds: input.leaseSeconds,
      });
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
        claimToken: input.claimToken,
        leaseSeconds: input.leaseSeconds,
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
    paymentId: string | null;
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

  /**
   * P14g: Order stuck at CLINICAL_APPROVED — finish capture path only.
   */
  private async resumeClinicalApprovedCapture(input: {
    subscriptionId: string;
    billingPeriodKey: string;
    attemptId: string;
    orderId: string;
    paymentId: string | null;
    actorUserId?: string | null;
    source: string;
    forceOutcome?: 'decline' | 'timeout' | null;
    claimToken?: string;
    leaseSeconds?: number;
  }): Promise<ProcessRenewalResult> {
    const payment = await this.payments.findLatestForOrder(input.orderId);
    if (!payment) {
      return {
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: input.orderId,
        paymentId: null,
        outcome: 'capture_failed',
        attemptStatus: SubscriptionRenewalAttemptStatus.FAILED,
      };
    }

    await this.orders.transitionOrder({
      orderId: input.orderId,
      toStatus: OrderStatus.AWAITING_FULFILLMENT,
      actorUserId: input.actorUserId,
      source: 'clinical',
      reason: 'renewal_clinical_approve_resume',
      expectedStatus: OrderStatus.CLINICAL_APPROVED,
    });

    // transitionOrder fires capture_required → capturePayment → completeRenewalOnCapture.
    const refreshed = await this.payments.findLatestForOrder(input.orderId);
    if (refreshed?.lifecycleState === PaymentLifecycleState.CAPTURED) {
      await this.completeRenewalOnCapture({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        paymentId: refreshed.id,
        orderId: input.orderId,
        actorUserId: input.actorUserId,
        source: input.source,
      });
      return {
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: input.orderId,
        paymentId: refreshed.id,
        outcome: 'succeeded',
        attemptStatus: SubscriptionRenewalAttemptStatus.SUCCEEDED,
      };
    }

    return this.retryCaptureOnly({
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      attemptId: input.attemptId,
      orderId: input.orderId,
      paymentId: payment.id,
      actorUserId: input.actorUserId,
      source: input.source,
      forceOutcome: input.forceOutcome,
      claimToken: input.claimToken,
      leaseSeconds: input.leaseSeconds,
    });
  }

  /** Capture-only retry — never authorize. Preserves capture:{order}:{payment} key. */
  private async retryCaptureOnly(input: {
    subscriptionId: string;
    billingPeriodKey: string;
    attemptId: string;
    orderId: string;
    paymentId: string;
    actorUserId?: string | null;
    source: string;
    forceOutcome?: 'decline' | 'timeout' | null;
    claimToken?: string;
    leaseSeconds?: number;
  }): Promise<ProcessRenewalResult> {
    const leaseSeconds = input.leaseSeconds ?? this.renewalLeaseSeconds();
    const runCapture = () =>
      this.payments.capturePayment({
        paymentId: input.paymentId,
        idempotencyKey: `capture:${input.orderId}:${input.paymentId}`,
        forceOutcome: input.forceOutcome,
      });

    let capture;
    let owned = true;
    if (input.claimToken) {
      const gated = await this.withLeaseHeartbeat({
        attemptId: input.attemptId,
        claimToken: input.claimToken,
        leaseSeconds,
        work: runCapture,
      });
      if (!gated.value) {
        return this.inFlightResult({
          subscriptionId: input.subscriptionId,
          billingPeriodKey: input.billingPeriodKey,
          attemptId: input.attemptId,
          orderId: input.orderId,
          paymentId: input.paymentId,
          attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
        });
      }
      capture = gated.value;
      owned = gated.ok;
    } else {
      capture = await runCapture();
    }

    if (capture.lifecycleState !== PaymentLifecycleState.CAPTURED) {
      if (input.claimToken) {
        const marked = await this.renewal.markAttemptOutcome({
          subscriptionId: input.subscriptionId,
          billingPeriodKey: input.billingPeriodKey,
          status: SubscriptionRenewalAttemptStatus.FAILED,
          paymentId: input.paymentId,
          paymentStatusSummary: capture.paymentStatusSummary,
          lastErrorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
          actorUserId: input.actorUserId,
          source: input.source,
          claimToken: input.claimToken,
        });
        if (!marked.applied) {
          return this.inFlightResult({
            subscriptionId: input.subscriptionId,
            billingPeriodKey: input.billingPeriodKey,
            attemptId: input.attemptId,
            orderId: input.orderId,
            paymentId: input.paymentId,
            attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
          });
        }
      } else {
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
      }
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

    // CAPTURED — complete even if lease lost (one-shot / current owner reconciles).
    await this.completeRenewalOnCapture({
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      paymentId: input.paymentId,
      orderId: input.orderId,
      actorUserId: input.actorUserId,
      source: input.source,
    });

    if (!owned && input.claimToken) {
      return this.inFlightResult({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: input.orderId,
        paymentId: input.paymentId,
        attemptStatus: SubscriptionRenewalAttemptStatus.SUCCEEDED,
      });
    }

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
    claimToken?: string;
    leaseSeconds?: number;
  }): Promise<ProcessRenewalResult> {
    const leaseSeconds = input.leaseSeconds ?? this.renewalLeaseSeconds();
    // Phase 6G R3: prefer order-scoped canonical key when orderId is present so
    // CAPTURE_PENDING recovery can reconstruct the same provider idempotency key.
    const runCapture = () =>
      this.payments.capturePayment({
        paymentId: input.paymentId,
        idempotencyKey: `capture:${input.orderId}:${input.paymentId}`,
        forceOutcome: input.forceOutcome,
      });

    let capture;
    let owned = true;
    if (input.claimToken) {
      const gated = await this.withLeaseHeartbeat({
        attemptId: input.attemptId,
        claimToken: input.claimToken,
        leaseSeconds,
        work: runCapture,
      });
      if (!gated.value) {
        return this.inFlightResult({
          subscriptionId: input.subscriptionId,
          billingPeriodKey: input.billingPeriodKey,
          attemptId: input.attemptId,
          orderId: input.orderId,
          paymentId: input.paymentId,
          attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
        });
      }
      capture = gated.value;
      owned = gated.ok;
    } else {
      capture = await runCapture();
    }

    if (capture.lifecycleState !== PaymentLifecycleState.CAPTURED) {
      if (input.claimToken) {
        const marked = await this.renewal.markAttemptOutcome({
          subscriptionId: input.subscriptionId,
          billingPeriodKey: input.billingPeriodKey,
          status: SubscriptionRenewalAttemptStatus.FAILED,
          paymentId: input.paymentId,
          paymentStatusSummary: capture.paymentStatusSummary,
          lastErrorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
          actorUserId: input.actorUserId,
          source: input.source,
          claimToken: input.claimToken,
        });
        if (!marked.applied) {
          return this.inFlightResult({
            subscriptionId: input.subscriptionId,
            billingPeriodKey: input.billingPeriodKey,
            attemptId: input.attemptId,
            orderId: input.orderId,
            paymentId: input.paymentId,
            attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
          });
        }
      } else {
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
      }
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

    // CAPTURED at provider — always allow one-shot completion even if lease lost.
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
            claimToken: input.claimToken,
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

    if (!owned && input.claimToken) {
      return this.inFlightResult({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: input.orderId,
        paymentId: input.paymentId,
        attemptStatus: SubscriptionRenewalAttemptStatus.SUCCEEDED,
      });
    }

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
    paymentId: string | null;
    actorUserId?: string | null;
    source: string;
    claimToken?: string;
  }): Promise<ProcessRenewalResult> {
    const marked = await this.renewal.markAttemptOutcome({
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      status: SubscriptionRenewalAttemptStatus.FAILED,
      paymentId: input.paymentId,
      lastErrorCode: ErrorCodes.INV_INSUFFICIENT,
      actorUserId: input.actorUserId,
      source: input.source,
      claimToken: input.claimToken,
    });
    if (input.claimToken != null && !marked.applied) {
      return this.inFlightResult({
        subscriptionId: input.subscriptionId,
        billingPeriodKey: input.billingPeriodKey,
        attemptId: input.attemptId,
        orderId: input.orderId,
        paymentId: input.paymentId,
        attemptStatus: SubscriptionRenewalAttemptStatus.PROCESSING,
      });
    }
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

  /** Returns false when claim ownership was lost (no PAST_DUE applied). */
  private async failAuthorization(input: {
    subscriptionId: string;
    billingPeriodKey: string;
    attemptId: string;
    orderId: string;
    paymentId: string | null;
    errorCode: string;
    actorUserId?: string | null;
    source: string;
    claimToken?: string;
  }): Promise<boolean> {
    const marked = await this.renewal.markAttemptOutcome({
      subscriptionId: input.subscriptionId,
      billingPeriodKey: input.billingPeriodKey,
      status: SubscriptionRenewalAttemptStatus.FAILED,
      paymentId: input.paymentId,
      paymentStatusSummary: 'failed',
      lastErrorCode: input.errorCode,
      actorUserId: input.actorUserId,
      source: input.source,
      claimToken: input.claimToken,
    });
    if (input.claimToken != null && !marked.applied) {
      return false;
    }
    await this.subscriptions.markPastDue({
      subscriptionId: input.subscriptionId,
      toStatus: SubscriptionStatus.PAST_DUE,
      actorUserId: input.actorUserId,
      source: input.source,
      reason: 'renewal_payment_failed',
      failedRenewalAttempt: true,
    });
    return true;
  }

  /**
   * Lock due ACTIVE renewals and PAST_DUE grace retries (SKIP LOCKED).
   * Grace is fixed from period end; grace 0/NULL = no PAST_DUE failed retries.
   * PROCESSING attempts are never treated as failed-retry (SCA hold safe).
   * PAST_DUE+PROCESSING outside grace is selected for abandon/reconcile only.
   */
  private async lockDueSubscriptionIds(
    now: Date,
    limit: number,
  ): Promise<string[]> {
    const maxAttempts = this.renewalMaxAuthorizeAttempts();
    const minDelaySeconds = this.renewalMinRetryDelaySeconds();
    type Row = { id: string };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT s.id
      FROM subscriptions s
      LEFT JOIN subscription_plans p ON p.id = s.plan_id
      LEFT JOIN LATERAL (
        SELECT a.status, a.last_error_at, a.updated_at, a.retry_count,
               a.authorize_attempt_number, a.last_error_code
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
            AND COALESCE(p.grace_period_days, 0) > 0
            AND latest.authorize_attempt_number < ${maxAttempts}
            AND COALESCE(latest.last_error_at, latest.updated_at) +
                (${minDelaySeconds}::double precision * interval '1 second') <= ${now}
            AND COALESCE(s.current_period_end, s.next_renewal_at) +
                (p.grace_period_days || ' days')::interval >= ${now}
          )
          OR (
            s.status = 'PAST_DUE'
            AND latest.status = 'PROCESSING'
            AND (
              COALESCE(p.grace_period_days, 0) = 0
              OR COALESCE(s.current_period_end, s.next_renewal_at) +
                 (COALESCE(p.grace_period_days, 0) || ' days')::interval < ${now}
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
