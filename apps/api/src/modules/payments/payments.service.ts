import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';

import {
  PaymentInitiator,
  PaymentLifecycleState,
  PaymentPurpose,
  PaymentStatus,
  PaymentWebhookProcessingStatus,
  Prisma,
  RefundStatus,
  type Payment,
  type Refund,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { assertSupportedCurrency, assertValidMinorUnitAmount } from './money';
import type { PaymentGateway } from './payment.gateway';
import { PaymentLogCodes } from './payment-log-codes';
import { PaymentProviderRegistry } from './payment-provider.registry';
import {
  PAYMENT_GATEWAY,
  type AuthorizeForOrderInput,
  type CapturePaymentInput,
  type CustomerActionAuthResult,
  type GatewayAuthorizeResult,
  type GatewayListedRefund,
  type GatewayOutcomeClass,
  type GatewayRetrieveResult,
  type PaymentOutcomeSummary,
  type VoidOrRefundInput,
  type WebhookEnvelope,
  type WebhookVerificationMode,
} from './payment.types';
import { StripePaymentAdapter } from './stripe-payment.adapter';

export type PaymentOutcomeHandlers = {
  onOrderPaymentRefs?(input: {
    orderId: string;
    paymentId: string;
    paymentStatusSummary: PaymentOutcomeSummary['paymentStatusSummary'];
    paymentIntentId?: string | null;
  }): Promise<void>;
  onSubscriptionPaymentSnapshot?(input: {
    subscriptionId: string;
    paymentId: string;
    paymentStatusSummary: PaymentOutcomeSummary['paymentStatusSummary'];
  }): Promise<void>;
  onRenewalCaptureSucceeded?(input: {
    orderId: string;
    subscriptionId: string | null;
    paymentId: string;
  }): Promise<void>;
  onPaymentCaptured?(input: {
    orderId: string | null;
    subscriptionId: string | null;
    paymentId: string;
  }): Promise<void>;
  onRefundSucceeded?(input: {
    orderId: string | null;
    paymentId: string;
    refundId: string;
    refundedTotalCents: number;
    paymentStatusSummary: PaymentOutcomeSummary['paymentStatusSummary'];
  }): Promise<void>;
  onRenewalAuthorizationFailed?(input: {
    orderId: string;
    subscriptionId: string | null;
    paymentId: string;
    errorCode: string;
  }): Promise<void>;
  onClinicalDeclineHold?(input: {
    orderId: string;
    subscriptionId: string | null;
  }): Promise<void>;
};

function toSummary(
  status: PaymentStatus,
): PaymentOutcomeSummary['paymentStatusSummary'] {
  switch (status) {
    case PaymentStatus.AUTHORIZED_OR_CAPTURED:
      return 'authorized_or_captured';
    case PaymentStatus.FAILED:
      return 'failed';
    case PaymentStatus.REFUNDED:
      return 'refunded';
    default:
      return 'pending';
  }
}

/** Lifecycle states where a new payment for the same order (different key) is a conflict. */
const BLOCKING_LIFECYCLE_STATES: ReadonlySet<PaymentLifecycleState> = new Set([
  PaymentLifecycleState.PENDING_AUTHORIZATION,
  PaymentLifecycleState.AUTHORIZED,
  PaymentLifecycleState.CAPTURE_PENDING,
  PaymentLifecycleState.CAPTURED,
  PaymentLifecycleState.REFUND_PENDING,
  PaymentLifecycleState.REFUNDED,
]);

/** Timeout / unknown network outcome — provider state is unknown, never mark failed. */
function isAmbiguousOutcome(result: {
  outcomeClass?: GatewayOutcomeClass;
  errorCode?: string;
}): boolean {
  return (
    result.outcomeClass === 'TIMEOUT' ||
    result.outcomeClass === 'NETWORK_UNKNOWN' ||
    result.errorCode === ErrorCodes.PAY_PROVIDER_UNAVAILABLE
  );
}

function isActionRequired(result: {
  outcomeClass?: GatewayOutcomeClass;
}): boolean {
  return result.outcomeClass === 'ACTION_REQUIRED';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_WEBHOOK_LEASE_SECONDS = 60;

/** Phase 6F reconcile batch tuning. */
const RECONCILE_MAX_CONCURRENCY = 5;
const RECONCILE_DEFAULT_LIMIT = 25;
const RECONCILE_MAX_LIMIT = 100;
const RECONCILE_DEFAULT_OLDER_THAN_SECONDS = 120;
const RECONCILE_BACKOFF_BASE_MS = 60_000;
const RECONCILE_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;
/**
 * Payment has no metadata JSON column, so durable reconcile backoff is encoded in
 * `lastErrorCode` as `RECONCILE_DEFER|{epochMs}|{attempt}|{originalCode?}`.
 */
const RECONCILE_DEFER_PREFIX = 'RECONCILE_DEFER|';
/** Max numbered void/refund retry keys (`{base}:2` … `{base}:N`). */
const VOID_REFUND_MAX_ATTEMPT = 20;

/** Provider PaymentIntent state classified for webhook / reconcile branching. */
type ProviderPaymentKind =
  | 'unavailable'
  | 'inconclusive'
  | 'captured'
  | 'authorized'
  | 'requires_action'
  | 'canceled'
  | 'failed';

type ProviderPaymentState = {
  kind: ProviderPaymentKind;
  result?: GatewayRetrieveResult;
};

const ACTIVE_PROVIDER_REFUND_STATUSES: ReadonlySet<
  GatewayListedRefund['status']
> = new Set(['succeeded', 'pending', 'requires_action']);

/** Phase 6G R1 — only these codes release a FAILED refund reservation. */
const CONFIRMED_REFUND_FAILURE_CODES: ReadonlySet<string> = new Set([
  ErrorCodes.PAY_REFUND_PROVIDER_FAILED,
  ErrorCodes.PAY_REFUND_PROVIDER_CANCELED,
]);

/** True when FAILED.errorCode is an allow-listed provider-confirmed terminal failure. */
export function isConfirmedRefundFailureCode(
  code: string | null | undefined,
): boolean {
  return !!code && CONFIRMED_REFUND_FAILURE_CODES.has(code);
}

export type RefundReservationRow = {
  amountCents: number;
  status: RefundStatus;
  errorCode?: string | null;
};

/**
 * Single source of truth for staff display and startRefund reservation.
 * remaining = captured − Σ(SUCCEEDED) − Σ(PENDING) − Σ(UNCERTAIN_FAILED).
 */
export function computeRefundReservation(
  refundBaseCents: number,
  rows: RefundReservationRow[],
): {
  refundedCents: number;
  reservedRefundCents: number;
  refundableCents: number;
} {
  let refundedCents = 0;
  let reservedRefundCents = 0;
  for (const row of rows) {
    if (row.status === RefundStatus.SUCCEEDED) {
      refundedCents += row.amountCents;
      continue;
    }
    if (row.status === RefundStatus.PENDING) {
      reservedRefundCents += row.amountCents;
      continue;
    }
    if (
      row.status === RefundStatus.FAILED &&
      !isConfirmedRefundFailureCode(row.errorCode)
    ) {
      reservedRefundCents += row.amountCents;
    }
  }
  const refundableCents = Math.max(
    0,
    refundBaseCents - refundedCents - reservedRefundCents,
  );
  return { refundedCents, reservedRefundCents, refundableCents };
}

/** Canonical capture idempotency when orderId is known (Phase 6G R3). */
export function canonicalCaptureIdempotencyKey(
  orderId: string,
  paymentId: string,
): string {
  return `capture:${orderId}:${paymentId}`;
}

/** Canonical renewal-period capture key (Phase 6G R3). */
export function canonicalRenewalCaptureIdempotencyKey(
  subscriptionId: string,
  billingPeriodKey: string,
): string {
  return `renewal:${subscriptionId}:${billingPeriodKey}:capture`;
}

type RefundStart =
  | { kind: 'replay'; refund: Refund }
  | { kind: 'noop' }
  | { kind: 'created'; refund: Refund; payment: Payment };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private handlers: PaymentOutcomeHandlers = {};

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly registry: PaymentProviderRegistry,
    @Optional()
    @Inject(StripePaymentAdapter)
    private readonly stripeAdapter: StripePaymentAdapter | null,
  ) {}

  setOutcomeHandlers(handlers: PaymentOutcomeHandlers): void {
    this.handlers = handlers;
  }

  getProviderName(): string {
    return this.registry.getActiveProviderName();
  }

  getProviderConfig() {
    return this.registry.getReadModel();
  }

  async getLatestPaymentLifecycleForOrder(
    orderId: string,
  ): Promise<PaymentLifecycleState | null> {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      select: { lifecycleState: true },
    });
    return payment?.lifecycleState ?? null;
  }

  async createSavedPaymentMethod(input: {
    userId: string;
    providerMethodRef: string;
    brand?: string | null;
    last4?: string | null;
    expMonth?: number | null;
    expYear?: number | null;
    isDefault?: boolean;
  }) {
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault !== false) {
        await tx.savedPaymentMethod.updateMany({
          where: { userId: input.userId, deletedAt: null },
          data: { isDefault: false },
        });
      }
      return tx.savedPaymentMethod.create({
        data: {
          userId: input.userId,
          provider: this.getProviderName(),
          providerMethodRef: input.providerMethodRef,
          brand: input.brand ?? 'sim',
          last4: input.last4 ?? '4242',
          expMonth: input.expMonth ?? 12,
          expYear: input.expYear ?? 2030,
          isDefault: input.isDefault ?? true,
        },
      });
    });
  }

  async listSavedMethodsForUser(userId: string) {
    return this.prisma.savedPaymentMethod.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async addSavedMethodForUser(input: {
    userId: string;
    brand?: string | null;
    last4?: string | null;
    expMonth?: number | null;
    expYear?: number | null;
    isDefault?: boolean;
    /** Stripe pm_… suggestion — ownership verified server-side when provider=stripe. */
    providerMethodRef?: string | null;
  }) {
    const provider = this.getProviderName();
    const existing = await this.prisma.savedPaymentMethod.count({
      where: { userId: input.userId, deletedAt: null },
    });
    const isDefault = input.isDefault ?? existing === 0;

    if (provider === 'stripe') {
      return this.attachStripePaymentMethod({
        userId: input.userId,
        providerMethodRef: input.providerMethodRef,
        isDefault,
      });
    }

    if (input.providerMethodRef?.trim()) {
      throw new BadRequestException({
        code: ErrorCodes.PAY_METHOD_INVALID,
        message:
          'Client-supplied providerMethodRef is only allowed when PAYMENTS_PROVIDER=stripe',
      });
    }

    const providerMethodRef = `sim_${createHash('sha256')
      .update(`${input.userId}:${Date.now()}:${Math.random()}`)
      .digest('hex')
      .slice(0, 24)}`;
    return this.createSavedPaymentMethod({
      userId: input.userId,
      providerMethodRef,
      brand: input.brand,
      last4: input.last4,
      expMonth: input.expMonth,
      expYear: input.expYear,
      isDefault,
    });
  }

  /**
   * Server-side Stripe PM ownership: retrieve + customer must match stripeCustomerIdTest.
   * Client brand/last4/exp are ignored.
   */
  async attachStripePaymentMethod(input: {
    userId: string;
    providerMethodRef?: string | null;
    isDefault: boolean;
  }) {
    if (!this.stripeAdapter) {
      throw new BadRequestException({
        code: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        message: 'Stripe adapter is not active',
      });
    }
    const pmId = input.providerMethodRef?.trim() ?? '';
    if (!/^pm_[A-Za-z0-9]+$/.test(pmId)) {
      throw new BadRequestException({
        code: ErrorCodes.PAY_METHOD_INVALID,
        message: 'providerMethodRef must be a Stripe PaymentMethod id (pm_…)',
      });
    }

    const customerId = await this.ensureStripeTestCustomer(input.userId);
    let pm;
    try {
      pm = await this.stripeAdapter.retrievePaymentMethod(pmId);
    } catch {
      throw new BadRequestException({
        code: ErrorCodes.PAY_METHOD_INVALID,
        message: 'PaymentMethod could not be retrieved from Stripe',
      });
    }
    const pmCustomer =
      typeof pm.customer === 'string'
        ? pm.customer
        : pm.customer && typeof pm.customer === 'object'
          ? pm.customer.id
          : null;
    if (!pmCustomer || pmCustomer !== customerId) {
      throw new BadRequestException({
        code: ErrorCodes.PAY_METHOD_INVALID,
        message:
          'PaymentMethod is unattached or does not belong to this user Stripe test customer',
      });
    }

    const card = pm.card;
    return this.createSavedPaymentMethod({
      userId: input.userId,
      providerMethodRef: pm.id,
      brand: card?.brand ?? null,
      last4: card?.last4 ?? null,
      expMonth: card?.exp_month ?? null,
      expYear: card?.exp_year ?? null,
      isDefault: input.isDefault,
    });
  }

  /** Create/persist stripeCustomerIdTest with user-scoped Stripe idempotency. Never touches Live. */
  async ensureStripeTestCustomer(userId: string): Promise<string> {
    if (!this.stripeAdapter) {
      throw new BadRequestException({
        code: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        message: 'Stripe adapter is not active',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE
      `;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException({
          code: ErrorCodes.RES_NOT_FOUND,
          message: 'User not found',
        });
      }
      if (user.stripeCustomerIdTest) {
        return user.stripeCustomerIdTest;
      }

      const idempotencyKey = `clinexa:user:${userId}:stripe_customer:test`;
      try {
        const customer = await this.stripeAdapter!.createTestCustomer({
          userId,
          idempotencyKey,
        });
        await tx.user.update({
          where: { id: userId },
          data: { stripeCustomerIdTest: customer.id },
        });
        return customer.id;
      } catch {
        const found = await this.stripeAdapter!.searchCustomersByUserId(userId);
        if (found.length === 1) {
          await tx.user.update({
            where: { id: userId },
            data: { stripeCustomerIdTest: found[0].id },
          });
          return found[0].id;
        }
        throw new BadRequestException({
          code: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
          message:
            'Stripe Customer create outcome unknown; retry later (do not create another)',
        });
      }
    });
  }

  async setDefaultSavedMethod(userId: string, methodId: string) {
    return this.prisma.$transaction(async (tx) => {
      const method = await tx.savedPaymentMethod.findFirst({
        where: { id: methodId, userId, deletedAt: null },
      });
      if (!method) {
        throw new NotFoundException({
          code: ErrorCodes.PAY_METHOD_INVALID,
          message: 'Saved payment method not found',
        });
      }
      await tx.savedPaymentMethod.updateMany({
        where: { userId, deletedAt: null },
        data: { isDefault: false },
      });
      return tx.savedPaymentMethod.update({
        where: { id: methodId },
        data: { isDefault: true },
      });
    });
  }

  async deleteSavedMethod(userId: string, methodId: string) {
    const method = await this.prisma.savedPaymentMethod.findFirst({
      where: { id: methodId, userId, deletedAt: null },
    });
    if (!method) {
      throw new NotFoundException({
        code: ErrorCodes.PAY_METHOD_INVALID,
        message: 'Saved payment method not found',
      });
    }
    if (method.isDefault) {
      throw new BadRequestException({
        code: ErrorCodes.PAY_METHOD_INVALID,
        message:
          'Cannot delete the default payment method; set another method as default first',
      });
    }
    return this.prisma.savedPaymentMethod.update({
      where: { id: methodId },
      data: { deletedAt: new Date(), isDefault: false },
    });
  }

  async updateSavedMethodMetadata(
    userId: string,
    methodId: string,
    input: {
      brand?: string | null;
      expMonth?: number | null;
      expYear?: number | null;
    },
  ) {
    const method = await this.prisma.savedPaymentMethod.findFirst({
      where: { id: methodId, userId, deletedAt: null },
    });
    if (!method) {
      throw new NotFoundException({
        code: ErrorCodes.PAY_METHOD_INVALID,
        message: 'Saved payment method not found',
      });
    }
    return this.prisma.savedPaymentMethod.update({
      where: { id: methodId },
      data: {
        ...(input.brand !== undefined ? { brand: input.brand } : {}),
        ...(input.expMonth !== undefined ? { expMonth: input.expMonth } : {}),
        ...(input.expYear !== undefined ? { expYear: input.expYear } : {}),
      },
    });
  }

  async findLatestForOrder(orderId: string) {
    return this.prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByProviderPaymentRef(providerPaymentRef: string) {
    return this.prisma.payment.findFirst({
      where: { providerPaymentRef },
    });
  }

  // ---------------------------------------------------------------------------
  // Authorize
  // ---------------------------------------------------------------------------

  async authorizeForOrder(
    input: AuthorizeForOrderInput,
  ): Promise<PaymentOutcomeSummary | CustomerActionAuthResult> {
    const currency = assertSupportedCurrency(input.currency);
    assertValidMinorUnitAmount(currency, input.amountCents);

    if (input.amountCents === 0) {
      const zero: PaymentOutcomeSummary = {
        paymentId: null,
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
        lifecycleState: PaymentLifecycleState.CAPTURED,
        paymentStatusSummary: 'authorized_or_captured',
      };
      return input.includeCustomerAction
        ? { ...zero, requiresAction: false }
        : zero;
    }

    if (!input.paymentMethodId?.trim()) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_MISSING_FIELD,
        message: 'paymentMethodId is required for non-zero authorization',
      });
    }

    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      this.assertAuthorizeReplay(existing, input, currency);
      return this.replayAuthorize(existing, input.includeCustomerAction);
    }

    const method = await this.prisma.savedPaymentMethod.findFirst({
      where: {
        id: input.paymentMethodId,
        deletedAt: null,
      },
    });
    if (!method) {
      throw new BadRequestException({
        code: ErrorCodes.PAY_METHOD_INVALID,
        message: 'Saved payment method missing or invalid',
      });
    }

    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      select: { patientUserId: true },
    });
    if (!order) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Order not found',
      });
    }
    if (method.userId !== order.patientUserId) {
      throw new BadRequestException({
        code: ErrorCodes.PAY_METHOD_INVALID,
        message:
          'Saved payment method does not belong to the patient being charged',
      });
    }

    let providerCustomerRef: string | null = null;
    if (this.getProviderName() === 'stripe') {
      providerCustomerRef = await this.ensureStripeTestCustomer(
        order.patientUserId,
      );
      await this.assertStripePmOwnership(
        method.providerMethodRef,
        providerCustomerRef,
      );
    }

    const purpose = input.purpose ?? PaymentPurpose.RENEWAL;
    const provider = this.getProviderName();

    // R4: order-level exclusivity. Reserve under FOR UPDATE on the order row,
    // commit, and only then talk to the gateway (never hold a lock across HTTP).
    let payment: Payment;
    try {
      const reservation = await this.prisma.$transaction(
        async (
          tx,
        ): Promise<
          | { kind: 'replay'; payment: Payment }
          | { kind: 'created'; payment: Payment }
        > => {
          await this.lockOrder(tx, input.orderId);

          const sameKey = await tx.payment.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
          });
          if (sameKey) {
            this.assertAuthorizeReplay(sameKey, input, currency);
            return { kind: 'replay', payment: sameKey };
          }

          const orderPayments = await tx.payment.findMany({
            where: { orderId: input.orderId },
            select: { id: true, lifecycleState: true, idempotencyKey: true },
          });
          const blocking = orderPayments.find(
            (p) =>
              p.idempotencyKey !== input.idempotencyKey &&
              BLOCKING_LIFECYCLE_STATES.has(p.lifecycleState),
          );
          if (blocking) {
            throw new ConflictException({
              code: ErrorCodes.PAY_IDEMPOTENCY_CONFLICT,
              message:
                'Order already has an active payment; use the original idempotency key',
            });
          }

          const created = await tx.payment.create({
            data: {
              orderId: input.orderId,
              subscriptionId: input.subscriptionId ?? null,
              savedPaymentMethodId: method.id,
              amountCents: input.amountCents,
              currency,
              status: PaymentStatus.PENDING,
              lifecycleState: PaymentLifecycleState.PENDING_AUTHORIZATION,
              purpose,
              initiator: input.initiator ?? PaymentInitiator.SYSTEM,
              provider,
              idempotencyKey: input.idempotencyKey,
            },
          });
          return { kind: 'created', payment: created };
        },
      );
      if (reservation.kind === 'replay') {
        // Committed; replay/reconcile outside the transaction.
        return this.replayAuthorize(
          reservation.payment,
          input.includeCustomerAction,
        );
      }
      payment = reservation.payment;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.payment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (raced) {
          this.assertAuthorizeReplay(raced, input, currency);
          return this.replayAuthorize(raced, input.includeCustomerAction);
        }
      }
      throw error;
    }

    // If we already have a provider ref (replay/recovery), retrieve — never create again.
    if (payment.providerPaymentRef && this.gateway.retrieveAuthorization) {
      const reconciled = await this.reconcileAuthorization(payment);
      return this.finishAuthorizeOutcome(
        reconciled,
        input.includeCustomerAction,
      );
    }

    const gatewayResult = await this.callGateway(() =>
      this.gateway.authorize({
        amountCents: input.amountCents,
        currency,
        providerMethodRef: method.providerMethodRef,
        providerCustomerRef,
        idempotencyKey: input.idempotencyKey,
        metadata: {
          clinexa_payment_id: payment.id,
          clinexa_idempotency_key: input.idempotencyKey,
          clinexa_order_id: input.orderId,
        },
        forceOutcome: input.forceOutcome,
      }),
    );

    // Persist PI id as soon as known (including ACTION_REQUIRED / some failures).
    if (gatewayResult.providerPaymentRef) {
      payment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentRef: gatewayResult.providerPaymentRef,
          providerAuthorizationRef:
            gatewayResult.providerAuthorizationRef ??
            gatewayResult.providerPaymentRef,
          providerStatusRaw: gatewayResult.providerStatusRaw ?? null,
          ...(gatewayResult.authorizationExpiresAt
            ? { authorizationExpiresAt: gatewayResult.authorizationExpiresAt }
            : {}),
        },
      });
    }

    if (!gatewayResult.success) {
      if (isActionRequired(gatewayResult)) {
        const pending = await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            providerStatusRaw:
              gatewayResult.providerStatusRaw ?? 'requires_action',
            lastErrorCode: null,
          },
        });
        const summary = toSummary(pending.status);
        await this.emitOrderRefs(input.orderId, pending.id, summary, null);
        if (input.subscriptionId) {
          await this.emitSubscriptionSnapshot(
            input.subscriptionId,
            pending.id,
            summary,
          );
        }
        return this.finishAuthorizeOutcome(
          pending,
          input.includeCustomerAction,
          gatewayResult,
        );
      }
      if (isAmbiguousOutcome(gatewayResult)) {
        let pending = await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            lastErrorCode:
              gatewayResult.errorCode ?? ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
          },
        });
        if (!pending.providerPaymentRef) {
          pending = await this.recoverAuthorizeWithoutRef(pending);
        } else if (this.gateway.retrieveAuthorization) {
          pending = await this.reconcileAuthorization(pending);
        }
        const summary = toSummary(pending.status);
        await this.emitOrderRefs(input.orderId, pending.id, summary, null);
        if (input.subscriptionId) {
          await this.emitSubscriptionSnapshot(
            input.subscriptionId,
            pending.id,
            summary,
          );
        }
        return this.finishAuthorizeOutcome(
          pending,
          input.includeCustomerAction,
        );
      }
      const failed = await this.finalizeAuthorizationFailure(
        payment,
        gatewayResult.errorCode ?? ErrorCodes.PAY_AUTHORIZATION_FAILED,
        gatewayResult.providerStatusRaw,
      );
      return this.finishAuthorizeOutcome(failed, input.includeCustomerAction);
    }

    const authorized = await this.finalizeAuthorizationSuccess(payment, {
      providerPaymentRef: gatewayResult.providerPaymentRef,
      providerAuthorizationRef: gatewayResult.providerAuthorizationRef,
      authorizationExpiresAt: gatewayResult.authorizationExpiresAt,
      providerStatusRaw: gatewayResult.providerStatusRaw,
    });
    return this.finishAuthorizeOutcome(authorized, input.includeCustomerAction);
  }

  private async assertStripePmOwnership(
    providerMethodRef: string,
    expectedCustomerId: string,
  ): Promise<void> {
    if (!this.stripeAdapter) {
      return;
    }
    const pm =
      await this.stripeAdapter.retrievePaymentMethod(providerMethodRef);
    const pmCustomer =
      typeof pm.customer === 'string'
        ? pm.customer
        : pm.customer && typeof pm.customer === 'object'
          ? pm.customer.id
          : null;
    if (!pmCustomer || pmCustomer !== expectedCustomerId) {
      throw new BadRequestException({
        code: ErrorCodes.PAY_METHOD_INVALID,
        message: 'PaymentMethod ownership check failed for authorize',
      });
    }
  }

  /**
   * Best-effort Search recovery when create timed out without a PI id.
   * Zero Search hits are not proof of absence; after idempotency window fail closed.
   */
  private async recoverAuthorizeWithoutRef(payment: Payment): Promise<Payment> {
    if (!this.stripeAdapter || payment.providerPaymentRef) {
      return payment;
    }

    const maxAttempts =
      this.config.get<number>('payments.stripeSearchMaxAttempts') ?? 3;
    const backoffsMs = [2000, 5000, 15000];
    for (let i = 0; i < maxAttempts; i++) {
      if (i > 0) {
        await sleep(backoffsMs[Math.min(i - 1, backoffsMs.length - 1)]);
      }
      const hits = await this.stripeAdapter.searchPaymentIntentsByPaymentId(
        payment.id,
      );
      if (hits.length === 1) {
        const pi = hits[0];
        const updated = await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            providerPaymentRef: pi.id,
            providerAuthorizationRef: pi.id,
            providerStatusRaw: pi.status,
          },
        });
        return this.reconcileAuthorization(updated);
      }
      if (hits.length > 1) {
        this.logger.error(
          `Multiple PaymentIntents for payment ${payment.id}; fail closed`,
        );
        return payment;
      }
    }

    const windowHours =
      this.config.get<number>('payments.stripeIdempotencyWindowHours') ?? 24;
    const ageMs = Date.now() - payment.createdAt.getTime();
    const withinWindow = ageMs <= windowHours * 60 * 60 * 1000;
    if (!withinWindow) {
      // Fail closed after Stripe idempotency retention window.
      return payment;
    }

    // Same Stripe idempotency key may still return the original create.
    if (!payment.savedPaymentMethodId) {
      return payment;
    }
    const method = await this.prisma.savedPaymentMethod.findUnique({
      where: { id: payment.savedPaymentMethodId },
    });
    if (!method) {
      return payment;
    }
    let customerRef: string | null = null;
    if (payment.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: payment.orderId },
        select: { patientUserId: true },
      });
      if (order) {
        try {
          customerRef = await this.ensureStripeTestCustomer(
            order.patientUserId,
          );
        } catch {
          return payment;
        }
      }
    }
    const retry = await this.callGateway(() =>
      this.gateway.authorize({
        amountCents: payment.amountCents,
        currency: payment.currency,
        providerMethodRef: method.providerMethodRef,
        providerCustomerRef: customerRef,
        idempotencyKey: payment.idempotencyKey,
        metadata: {
          clinexa_payment_id: payment.id,
          clinexa_idempotency_key: payment.idempotencyKey,
          ...(payment.orderId ? { clinexa_order_id: payment.orderId } : {}),
        },
      }),
    );
    if (retry.providerPaymentRef) {
      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentRef: retry.providerPaymentRef,
          providerAuthorizationRef:
            retry.providerAuthorizationRef ?? retry.providerPaymentRef,
          providerStatusRaw: retry.providerStatusRaw ?? null,
        },
      });
      if (retry.success) {
        return this.finalizeAuthorizationSuccess(updated, {
          providerPaymentRef: retry.providerPaymentRef,
          providerAuthorizationRef: retry.providerAuthorizationRef,
          authorizationExpiresAt: retry.authorizationExpiresAt,
          providerStatusRaw: retry.providerStatusRaw,
        });
      }
      if (isActionRequired(retry)) {
        return this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            providerStatusRaw: retry.providerStatusRaw ?? 'requires_action',
          },
        });
      }
      return this.reconcileAuthorization(updated);
    }
    return payment;
  }

  /**
   * Resolve a PENDING_AUTHORIZATION payment via provider retrieve (when supported).
   * Leaves the payment pending when the provider outcome is unknown.
   */
  private async reconcileAuthorization(payment: Payment): Promise<Payment> {
    if (
      payment.lifecycleState !== PaymentLifecycleState.PENDING_AUTHORIZATION ||
      !this.gateway.retrieveAuthorization
    ) {
      return payment;
    }
    let result;
    try {
      result = await this.gateway.retrieveAuthorization({
        providerPaymentRef: payment.providerPaymentRef,
        providerAuthorizationRef: payment.providerAuthorizationRef,
        idempotencyKey: payment.idempotencyKey,
        operation: 'authorization',
      });
    } catch {
      return payment;
    }

    if (
      result.outcomeClass === 'SUCCESS' &&
      (result.lifecycleHint === undefined ||
        result.lifecycleHint === 'AUTHORIZED') &&
      result.providerPaymentRef &&
      result.providerAuthorizationRef
    ) {
      return this.finalizeAuthorizationSuccess(payment, {
        providerPaymentRef: result.providerPaymentRef,
        providerAuthorizationRef: result.providerAuthorizationRef,
        authorizationExpiresAt: result.authorizationExpiresAt,
        providerStatusRaw: result.providerStatusRaw,
      });
    }
    if (
      result.outcomeClass === 'CONFIRMED_FAILURE' &&
      (result.lifecycleHint === undefined ||
        result.lifecycleHint === 'AUTHORIZATION_FAILED')
    ) {
      return this.finalizeAuthorizationFailure(
        payment,
        result.errorCode ?? ErrorCodes.PAY_AUTHORIZATION_FAILED,
        result.providerStatusRaw,
      );
    }
    if (result.outcomeClass === 'ACTION_REQUIRED') {
      return this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentRef:
            result.providerPaymentRef ?? payment.providerPaymentRef,
          providerAuthorizationRef:
            result.providerAuthorizationRef ?? payment.providerAuthorizationRef,
          providerStatusRaw: result.providerStatusRaw ?? 'requires_action',
        },
      });
    }
    if (
      result.outcomeClass === 'SUCCESS' &&
      result.lifecycleHint === 'CAPTURED'
    ) {
      // PI already succeeded (e.g. auto-capture) — leave capture path to handle.
      return this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentRef:
            result.providerPaymentRef ?? payment.providerPaymentRef,
          providerCaptureRef: result.providerCaptureRef ?? null,
          providerStatusRaw: result.providerStatusRaw ?? null,
        },
      });
    }
    return payment;
  }

  private async finalizeAuthorizationSuccess(
    payment: Payment,
    data: {
      providerPaymentRef?: string | null;
      providerAuthorizationRef?: string | null;
      authorizationExpiresAt?: Date | null;
      providerStatusRaw?: string | null;
    },
  ): Promise<Payment> {
    const res = await this.prisma.payment.updateMany({
      where: {
        id: payment.id,
        lifecycleState: PaymentLifecycleState.PENDING_AUTHORIZATION,
      },
      data: {
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
        lifecycleState: PaymentLifecycleState.AUTHORIZED,
        providerPaymentRef: data.providerPaymentRef ?? null,
        providerAuthorizationRef: data.providerAuthorizationRef ?? null,
        providerStatusRaw: data.providerStatusRaw ?? null,
        authorizedAmountCents: payment.amountCents,
        authorizedAt: new Date(),
        authorizationExpiresAt: data.authorizationExpiresAt ?? null,
        lastErrorCode: null,
      },
    });
    const fresh = await this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    if (res.count === 0) {
      return fresh;
    }
    const summary = toSummary(fresh.status);
    if (fresh.orderId) {
      await this.emitOrderRefs(
        fresh.orderId,
        fresh.id,
        summary,
        fresh.providerPaymentRef,
      );
    }
    if (fresh.subscriptionId) {
      await this.emitSubscriptionSnapshot(
        fresh.subscriptionId,
        fresh.id,
        summary,
      );
    }
    return fresh;
  }

  private async finalizeAuthorizationFailure(
    payment: Payment,
    errorCode: string,
    providerStatusRaw?: string | null,
  ): Promise<Payment> {
    const res = await this.prisma.payment.updateMany({
      where: {
        id: payment.id,
        lifecycleState: PaymentLifecycleState.PENDING_AUTHORIZATION,
      },
      data: {
        status: PaymentStatus.FAILED,
        lifecycleState: PaymentLifecycleState.AUTHORIZATION_FAILED,
        lastErrorCode: errorCode,
        ...(providerStatusRaw ? { providerStatusRaw } : {}),
      },
    });
    const fresh = await this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    if (res.count === 0) {
      return fresh;
    }
    const summary = toSummary(fresh.status);
    if (fresh.orderId) {
      await this.emitOrderRefs(fresh.orderId, fresh.id, summary, null);
    }
    if (fresh.subscriptionId) {
      await this.emitSubscriptionSnapshot(
        fresh.subscriptionId,
        fresh.id,
        summary,
      );
    }
    if (fresh.orderId && this.handlers.onRenewalAuthorizationFailed) {
      await this.handlers.onRenewalAuthorizationFailed({
        orderId: fresh.orderId,
        subscriptionId: fresh.subscriptionId,
        paymentId: fresh.id,
        errorCode,
      });
    }
    return fresh;
  }

  private assertAuthorizeReplay(
    existing: Payment,
    input: AuthorizeForOrderInput,
    currency: string,
  ): void {
    const methodId = input.paymentMethodId?.trim() || null;
    if (
      existing.orderId !== input.orderId ||
      existing.amountCents !== input.amountCents ||
      existing.currency !== currency ||
      existing.savedPaymentMethodId !== methodId
    ) {
      throw new ConflictException({
        code: ErrorCodes.PAY_IDEMPOTENCY_CONFLICT,
        message: 'Payment idempotency key replay with mismatched body',
      });
    }
  }

  private async replayAuthorize(
    existing: Payment,
    includeCustomerAction?: boolean,
  ): Promise<PaymentOutcomeSummary | CustomerActionAuthResult> {
    let payment = existing;
    let retrieveSecret: string | undefined;
    if (
      payment.lifecycleState === PaymentLifecycleState.PENDING_AUTHORIZATION
    ) {
      const before = payment;
      payment = await this.reconcileAuthorization(payment);
      if (
        includeCustomerAction &&
        payment.lifecycleState ===
          PaymentLifecycleState.PENDING_AUTHORIZATION &&
        payment.providerStatusRaw === 'requires_action'
      ) {
        retrieveSecret = await this.retrieveActionClientSecret(before);
      }
    }
    return this.finishAuthorizeOutcome(
      payment,
      includeCustomerAction,
      retrieveSecret
        ? {
            outcomeClass: 'ACTION_REQUIRED',
            clientSecret: retrieveSecret,
            success: false,
          }
        : undefined,
    );
  }

  private toOutcome(payment: Payment): PaymentOutcomeSummary {
    return {
      paymentId: payment.id,
      status: payment.status,
      lifecycleState: payment.lifecycleState,
      paymentStatusSummary: toSummary(payment.status),
    };
  }

  private finishAuthorizeOutcome(
    payment: Payment,
    includeCustomerAction?: boolean,
    gateway?: Pick<
      GatewayAuthorizeResult,
      'outcomeClass' | 'clientSecret' | 'success'
    >,
  ): PaymentOutcomeSummary | CustomerActionAuthResult {
    const base = this.toOutcome(payment);
    if (!includeCustomerAction) {
      return base;
    }
    const requiresAction =
      gateway?.outcomeClass === 'ACTION_REQUIRED' ||
      (payment.lifecycleState === PaymentLifecycleState.PENDING_AUTHORIZATION &&
        payment.providerStatusRaw === 'requires_action');
    const result: CustomerActionAuthResult = {
      ...base,
      outcomeClass: gateway?.outcomeClass,
      requiresAction,
    };
    if (requiresAction && gateway?.clientSecret) {
      result.clientSecret = gateway.clientSecret;
    }
    return result;
  }

  /** Retrieve ephemeral client_secret only while PI still requires_action. */
  private async retrieveActionClientSecret(
    payment: Payment,
  ): Promise<string | undefined> {
    if (!this.gateway.retrieveAuthorization || !payment.providerPaymentRef) {
      return undefined;
    }
    try {
      const retrieved = await this.gateway.retrieveAuthorization({
        providerPaymentRef: payment.providerPaymentRef,
        providerAuthorizationRef: payment.providerAuthorizationRef,
        operation: 'authorization',
      });
      if (
        retrieved.outcomeClass === 'ACTION_REQUIRED' &&
        retrieved.clientSecret
      ) {
        return retrieved.clientSecret;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  /**
   * Owner-facing reconcile after SCA: retrieve provider state; return customer
   * action payload (secret only if still requires_action).
   */
  async reconcileCustomerPaymentAction(
    paymentId: string,
  ): Promise<CustomerActionAuthResult> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Payment not found',
      });
    }
    let current = payment;
    let secret: string | undefined;
    if (
      current.lifecycleState === PaymentLifecycleState.PENDING_AUTHORIZATION
    ) {
      secret = await this.retrieveActionClientSecret(current);
      current = await this.reconcileAuthorization(current);
      if (
        current.lifecycleState ===
          PaymentLifecycleState.PENDING_AUTHORIZATION &&
        current.providerStatusRaw === 'requires_action' &&
        !secret
      ) {
        secret = await this.retrieveActionClientSecret(current);
      }
    } else if (
      current.lifecycleState === PaymentLifecycleState.CAPTURE_PENDING
    ) {
      current = await this.reconcileCapture(current);
    }
    return this.finishAuthorizeOutcome(current, true, {
      success: false,
      outcomeClass:
        current.providerStatusRaw === 'requires_action'
          ? 'ACTION_REQUIRED'
          : undefined,
      clientSecret: secret,
    }) as CustomerActionAuthResult;
  }

  /** True when latest payment is safe for a new authorize (no blocking money state). */
  isSafeForNewAuthorization(
    lifecycleState: PaymentLifecycleState | null | undefined,
  ): boolean {
    if (!lifecycleState) {
      return true;
    }
    return (
      lifecycleState === PaymentLifecycleState.AUTHORIZATION_FAILED ||
      lifecycleState === PaymentLifecycleState.VOIDED ||
      lifecycleState === PaymentLifecycleState.CANCELLED
    );
  }

  // ---------------------------------------------------------------------------
  // Capture
  // ---------------------------------------------------------------------------

  async capturePayment(
    input: CapturePaymentInput,
  ): Promise<PaymentOutcomeSummary> {
    type Claim = {
      kind: 'done' | 'pending' | 'expired' | 'capture';
      payment: Payment;
    };

    // Short locked transaction: decide + claim (AUTHORIZED -> CAPTURE_PENDING).
    // The gateway call happens outside the transaction; concurrent callers see
    // CAPTURE_PENDING and reconcile instead of issuing a second capture.
    const claim = await this.prisma.$transaction(async (tx): Promise<Claim> => {
      await this.lockPayment(tx, input.paymentId);
      const payment = await tx.payment.findUnique({
        where: { id: input.paymentId },
      });
      if (!payment) {
        throw new NotFoundException({
          code: ErrorCodes.RES_NOT_FOUND,
          message: 'Payment not found',
        });
      }

      if (
        payment.lifecycleState === PaymentLifecycleState.CAPTURED &&
        payment.status === PaymentStatus.AUTHORIZED_OR_CAPTURED
      ) {
        return { kind: 'done', payment };
      }
      if (payment.lifecycleState === PaymentLifecycleState.CAPTURE_PENDING) {
        return { kind: 'pending', payment };
      }

      if (
        !payment.providerPaymentRef ||
        !payment.providerAuthorizationRef ||
        payment.status === PaymentStatus.FAILED ||
        (payment.lifecycleState !== PaymentLifecycleState.AUTHORIZED &&
          payment.lifecycleState !== PaymentLifecycleState.CAPTURE_FAILED)
      ) {
        throw new BadRequestException({
          code: ErrorCodes.PAY_REFUND_INELIGIBLE,
          message: 'Payment is not eligible for capture',
        });
      }

      if (
        payment.authorizationExpiresAt &&
        payment.authorizationExpiresAt.getTime() <= Date.now()
      ) {
        return { kind: 'expired', payment };
      }

      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: { lifecycleState: PaymentLifecycleState.CAPTURE_PENDING },
      });
      return { kind: 'capture', payment: updated };
    });

    if (claim.kind === 'done') {
      return this.toOutcome(claim.payment);
    }

    if (claim.kind === 'pending') {
      const reconciled = await this.reconcileCapture(
        claim.payment,
        input.idempotencyKey,
      );
      return this.toOutcome(reconciled);
    }

    if (claim.kind === 'expired') {
      await this.voidAuthorization(
        claim.payment,
        `${input.idempotencyKey}:void_expired`,
        'AUTHORIZATION_EXPIRED',
      );
      throw new BadRequestException({
        code: ErrorCodes.PAY_REFUND_INELIGIBLE,
        message: 'Payment authorization has expired; capture rejected',
      });
    }

    const payment = claim.payment;

    // Phase 6D: if provider already captured (e.g. webhook succeeded), finalize
    // without issuing a second gateway.capture.
    if (this.gateway.retrieveCapture || this.gateway.retrieveAuthorization) {
      try {
        const retrieved = this.gateway.retrieveCapture
          ? await this.gateway.retrieveCapture({
              providerPaymentRef: payment.providerPaymentRef,
              providerCaptureRef: payment.providerCaptureRef,
              operation: 'capture',
            })
          : await this.gateway.retrieveAuthorization!({
              providerPaymentRef: payment.providerPaymentRef,
              providerAuthorizationRef: payment.providerAuthorizationRef,
              operation: 'authorization',
            });
        if (
          retrieved.outcomeClass === 'SUCCESS' &&
          retrieved.lifecycleHint === 'CAPTURED'
        ) {
          const captured = await this.finalizeCaptureSuccess(
            payment,
            retrieved.providerCaptureRef ?? payment.providerPaymentRef,
            retrieved.providerStatusRaw,
          );
          return this.toOutcome(captured);
        }
      } catch {
        // Fall through to gateway.capture
      }
    }

    const result = await this.callGateway(() =>
      this.gateway.capture({
        providerPaymentRef: payment.providerPaymentRef as string,
        providerAuthorizationRef: payment.providerAuthorizationRef as string,
        amountCents: payment.amountCents,
        idempotencyKey: input.idempotencyKey,
        forceOutcome: input.forceOutcome,
      }),
    );

    if (!result.success) {
      if (isAmbiguousOutcome(result)) {
        // Unknown provider state: stay CAPTURE_PENDING for reconcile.
        const pending = await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            lastErrorCode:
              result.errorCode ?? ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
          },
        });
        return this.toOutcome(pending);
      }
      const failed = await this.markCaptureFailed(
        payment.id,
        result.errorCode ?? ErrorCodes.PAY_AUTHORIZATION_FAILED,
        result.providerStatusRaw,
      );
      return this.toOutcome(failed);
    }

    const captured = await this.finalizeCaptureSuccess(
      payment,
      result.providerCaptureRef ?? null,
      result.providerStatusRaw,
    );
    return this.toOutcome(captured);
  }

  /**
   * Resolve a CAPTURE_PENDING payment via provider retrieve.
   * If PI already succeeded → finalize only. If still requires_capture and a
   * canonical capture key can be reconstructed, re-issue capture with that key
   * (Phase 6G R3). Never invent a new idempotency key.
   */
  private async reconcileCapture(
    payment: Payment,
    idempotencyKey?: string,
  ): Promise<Payment> {
    if (payment.lifecycleState !== PaymentLifecycleState.CAPTURE_PENDING) {
      return payment;
    }
    if (!this.gateway.retrieveCapture && !this.gateway.retrieveAuthorization) {
      return payment;
    }
    let result: GatewayRetrieveResult;
    try {
      result = this.gateway.retrieveCapture
        ? await this.gateway.retrieveCapture({
            providerPaymentRef: payment.providerPaymentRef,
            providerAuthorizationRef: payment.providerAuthorizationRef,
            providerCaptureRef: payment.providerCaptureRef,
            idempotencyKey,
            operation: 'capture',
          })
        : await this.gateway.retrieveAuthorization!({
            providerPaymentRef: payment.providerPaymentRef,
            providerAuthorizationRef: payment.providerAuthorizationRef,
            idempotencyKey,
            operation: 'authorization',
          });
    } catch {
      return payment;
    }

    if (
      result.outcomeClass === 'SUCCESS' &&
      result.lifecycleHint === 'CAPTURED'
    ) {
      return this.finalizeCaptureSuccess(
        payment,
        result.providerCaptureRef ??
          payment.providerCaptureRef ??
          payment.providerPaymentRef,
        result.providerStatusRaw,
      );
    }
    if (
      result.outcomeClass === 'CONFIRMED_FAILURE' &&
      (result.lifecycleHint === undefined ||
        result.lifecycleHint === 'CAPTURE_FAILED')
    ) {
      return this.markCaptureFailed(
        payment.id,
        result.errorCode ?? ErrorCodes.PAY_AUTHORIZATION_FAILED,
        result.providerStatusRaw,
      );
    }

    // Still open auth — re-capture only with reconstructible canonical key.
    // Prefer order-scoped formula when orderId is known; never reuse a caller
    // guess (e.g. webhook_capture:evt or an arbitrary retry key) for recovery.
    const openAuth =
      result.outcomeClass === 'SUCCESS' &&
      (result.lifecycleHint === undefined ||
        result.lifecycleHint === 'AUTHORIZED');
    const key = payment.orderId
      ? canonicalCaptureIdempotencyKey(payment.orderId, payment.id)
      : (idempotencyKey ?? null);
    if (
      openAuth &&
      key &&
      payment.providerPaymentRef &&
      payment.providerAuthorizationRef
    ) {
      const captureResult = await this.callGateway(() =>
        this.gateway.capture({
          providerPaymentRef: payment.providerPaymentRef as string,
          providerAuthorizationRef: payment.providerAuthorizationRef as string,
          amountCents: payment.amountCents,
          idempotencyKey: key,
        }),
      );
      if (captureResult.success) {
        return this.finalizeCaptureSuccess(
          payment,
          captureResult.providerCaptureRef ?? null,
          captureResult.providerStatusRaw,
        );
      }
      if (isAmbiguousOutcome(captureResult)) {
        return payment;
      }
      return this.markCaptureFailed(
        payment.id,
        captureResult.errorCode ?? ErrorCodes.PAY_AUTHORIZATION_FAILED,
        captureResult.providerStatusRaw,
      );
    }
    return payment;
  }

  private async markCaptureFailed(
    paymentId: string,
    errorCode: string,
    providerStatusRaw?: string | null,
  ): Promise<Payment> {
    await this.prisma.payment.updateMany({
      where: {
        id: paymentId,
        lifecycleState: PaymentLifecycleState.CAPTURE_PENDING,
      },
      data: {
        lifecycleState: PaymentLifecycleState.CAPTURE_FAILED,
        lastErrorCode: errorCode,
        ...(providerStatusRaw ? { providerStatusRaw } : {}),
      },
    });
    return this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  }

  private async finalizeCaptureSuccess(
    payment: Payment,
    providerCaptureRef: string | null,
    providerStatusRaw?: string | null,
  ): Promise<Payment> {
    const res = await this.prisma.payment.updateMany({
      where: {
        id: payment.id,
        // AUTHORIZED / PENDING_AUTHORIZATION only via provider-confirmed paths
        // (webhook retrieve showing the PI already succeeded).
        lifecycleState: {
          in: [
            PaymentLifecycleState.CAPTURE_PENDING,
            PaymentLifecycleState.AUTHORIZED,
            PaymentLifecycleState.PENDING_AUTHORIZATION,
          ],
        },
      },
      data: {
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
        lifecycleState: PaymentLifecycleState.CAPTURED,
        providerCaptureRef,
        providerStatusRaw: providerStatusRaw ?? null,
        authorizedAmountCents:
          payment.authorizedAmountCents ?? payment.amountCents,
        authorizedAt: payment.authorizedAt ?? new Date(),
        capturedAmountCents: payment.amountCents,
        capturedAt: new Date(),
        lastErrorCode: null,
      },
    });
    const captured = await this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    if (res.count === 0) {
      return captured;
    }

    const summary = toSummary(captured.status);
    if (captured.orderId) {
      await this.emitOrderRefs(
        captured.orderId,
        captured.id,
        summary,
        captured.providerPaymentRef,
      );
    }
    if (captured.subscriptionId) {
      await this.emitSubscriptionSnapshot(
        captured.subscriptionId,
        captured.id,
        summary,
      );
    }
    if (captured.orderId && this.handlers.onPaymentCaptured) {
      await this.handlers.onPaymentCaptured({
        orderId: captured.orderId,
        subscriptionId: captured.subscriptionId,
        paymentId: captured.id,
      });
    }
    if (captured.orderId && this.handlers.onRenewalCaptureSucceeded) {
      await this.handlers.onRenewalCaptureSucceeded({
        orderId: captured.orderId,
        subscriptionId: captured.subscriptionId,
        paymentId: captured.id,
      });
    }
    return captured;
  }

  /**
   * Void an uncaptured authorization (including pending SCA PaymentIntents).
   * Sets VOIDED only when the gateway confirms (or no provider ref was ever stored).
   * Ambiguous gateway outcomes leave the row pending and return false.
   */
  private async voidAuthorization(
    payment: Payment,
    idempotencyKey: string,
    voidedErrorCode: string | null,
  ): Promise<boolean> {
    if (payment.providerPaymentRef && payment.providerAuthorizationRef) {
      const voidResult = await this.callGateway(() =>
        this.gateway.void({
          providerPaymentRef: payment.providerPaymentRef as string,
          providerAuthorizationRef: payment.providerAuthorizationRef as string,
          idempotencyKey,
        }),
      );
      if (!voidResult.success) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            lastErrorCode:
              voidResult.errorCode ?? ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
          },
        });
        return false;
      }
    }

    const res = await this.prisma.payment.updateMany({
      where: {
        id: payment.id,
        lifecycleState: {
          in: [
            PaymentLifecycleState.PENDING_AUTHORIZATION,
            PaymentLifecycleState.AUTHORIZED,
            PaymentLifecycleState.CAPTURE_FAILED,
            PaymentLifecycleState.CAPTURE_PENDING,
          ],
        },
      },
      data: {
        status: PaymentStatus.FAILED,
        lifecycleState: PaymentLifecycleState.VOIDED,
        lastErrorCode: voidedErrorCode,
      },
    });
    if (res.count > 0) {
      const summary = toSummary(PaymentStatus.FAILED);
      if (payment.orderId) {
        await this.emitOrderRefs(payment.orderId, payment.id, summary, null);
      }
      if (payment.subscriptionId) {
        await this.emitSubscriptionSnapshot(
          payment.subscriptionId,
          payment.id,
          summary,
        );
      }
    }
    return (
      res.count > 0 || payment.lifecycleState === PaymentLifecycleState.VOIDED
    );
  }

  /** Lookup by Payment id (renewal/webhook read paths; no writes). */
  async findById(paymentId: string) {
    return this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
  }

  /** Lookup by globally unique Payment.idempotencyKey (renewal reclaim). */
  async findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.payment.findUnique({
      where: { idempotencyKey },
    });
  }

  /**
   * Classify a Payment lifecycle for renewal abandon / reclaim branching.
   * Does not invent terminal outcomes.
   */
  classifyPaymentLifecycleForAbandon(
    lifecycleState: PaymentLifecycleState | undefined | null,
  ):
    | 'voided'
    | 'authorization_failed'
    | 'captured'
    | 'authorized'
    | 'refunded'
    | 'unknown'
    | 'not_found' {
    if (lifecycleState == null) {
      return 'not_found';
    }
    switch (lifecycleState) {
      case PaymentLifecycleState.VOIDED:
        return 'voided';
      case PaymentLifecycleState.AUTHORIZATION_FAILED:
        return 'authorization_failed';
      case PaymentLifecycleState.CAPTURED:
        return 'captured';
      case PaymentLifecycleState.AUTHORIZED:
      case PaymentLifecycleState.CAPTURE_PENDING:
      case PaymentLifecycleState.CAPTURE_FAILED:
        return 'authorized';
      case PaymentLifecycleState.REFUNDED:
      case PaymentLifecycleState.REFUND_PENDING:
        return 'refunded';
      default:
        return 'unknown';
    }
  }

  /**
   * Abandon a renewal SCA / pending authorization. Retrieves first when needed;
   * never invents a second PaymentIntent. Returns a discriminant from the
   * latest persisted lifecycle after any cancel attempt.
   */
  async cancelPendingAuthorization(input: {
    paymentId: string;
    idempotencyKey: string;
    reason?: string | null;
  }): Promise<
    | 'voided'
    | 'authorization_failed'
    | 'captured'
    | 'authorized'
    | 'refunded'
    | 'unknown'
    | 'not_found'
  > {
    let payment = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
    });
    if (!payment) {
      return 'not_found';
    }

    const early = this.classifyPaymentLifecycleForAbandon(
      payment.lifecycleState,
    );
    if (
      early === 'voided' ||
      early === 'authorization_failed' ||
      early === 'captured' ||
      early === 'authorized' ||
      early === 'refunded'
    ) {
      return early;
    }

    if (
      payment.lifecycleState !== PaymentLifecycleState.PENDING_AUTHORIZATION
    ) {
      return this.classifyPaymentLifecycleForAbandon(payment.lifecycleState);
    }

    if (!payment.providerPaymentRef) {
      payment = await this.recoverAuthorizeWithoutRef(payment);
      const afterRecover = this.classifyPaymentLifecycleForAbandon(
        payment.lifecycleState,
      );
      if (afterRecover !== 'unknown') {
        return afterRecover;
      }
      if (
        payment.lifecycleState !== PaymentLifecycleState.PENDING_AUTHORIZATION
      ) {
        return afterRecover;
      }
    }

    // Only attempt provider cancel while still pending authorization.
    if (
      payment.lifecycleState === PaymentLifecycleState.PENDING_AUTHORIZATION
    ) {
      const ok = await this.voidAuthorization(
        payment,
        input.idempotencyKey,
        input.reason ?? ErrorCodes.PAY_RENEWAL_ABANDONED,
      );
      if (!ok) {
        const fresh = await this.prisma.payment.findUnique({
          where: { id: input.paymentId },
        });
        return this.classifyPaymentLifecycleForAbandon(fresh?.lifecycleState);
      }
    }

    const fresh = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
    });
    return this.classifyPaymentLifecycleForAbandon(fresh?.lifecycleState);
  }

  // ---------------------------------------------------------------------------
  // Void / refund for order
  // ---------------------------------------------------------------------------

  async voidOrRefundForOrder(input: VoidOrRefundInput): Promise<void> {
    let payment = await this.prisma.payment.findFirst({
      where: { orderId: input.orderId },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) {
      return;
    }

    if (payment.lifecycleState === PaymentLifecycleState.CAPTURE_PENDING) {
      // Capture may have landed at the provider — resolve before voiding.
      payment = await this.reconcileCapture(payment);
    }

    if (payment.lifecycleState === PaymentLifecycleState.CAPTURED) {
      if (!payment.providerPaymentRef || !payment.providerCaptureRef) {
        throw new BadRequestException({
          code: ErrorCodes.PAY_REFUND_INELIGIBLE,
          message: 'Captured payment missing provider refs for refund',
        });
      }
      const existingRefund = await this.prisma.refund.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existingRefund) {
        if (existingRefund.status === RefundStatus.PENDING) {
          await this.reconcileRefundAndNotify(existingRefund);
          return;
        }
        if (existingRefund.status === RefundStatus.FAILED) {
          await this.retryFailedVoidRefund(payment, input, existingRefund);
        }
        return;
      }

      await this.runVoidRefundAttempt(payment, input, input.idempotencyKey);
      return;
    }

    if (
      payment.lifecycleState === PaymentLifecycleState.AUTHORIZED ||
      payment.lifecycleState === PaymentLifecycleState.CAPTURE_FAILED ||
      payment.lifecycleState === PaymentLifecycleState.CAPTURE_PENDING
    ) {
      await this.voidAuthorization(payment, input.idempotencyKey, null);
    }
  }

  /** Start + settle one void/refund attempt for the whole remaining captured amount. */
  private async runVoidRefundAttempt(
    payment: Payment,
    input: VoidOrRefundInput,
    idempotencyKey: string,
  ): Promise<void> {
    const started = await this.startRefund({
      paymentId: payment.id,
      amountCents: null,
      reason: input.reason ?? null,
      actorUserId: input.actorUserId ?? null,
      idempotencyKey,
    });
    if (started.kind !== 'created') {
      return;
    }

    const settled = await this.settleRefund(started.payment, started.refund);
    if (settled.outcome === 'pending') {
      return;
    }
    if (settled.outcome === 'failed') {
      throw new BadRequestException({
        code: ErrorCodes.PAY_REFUND_INELIGIBLE,
        message: settled.errorMessage ?? 'Refund failed',
      });
    }

    await this.afterRefundSucceeded(settled.refund);
    const refreshed = await this.prisma.payment.findUnique({
      where: { id: payment.id },
    });
    if (refreshed) {
      const summary = toSummary(refreshed.status);
      if (refreshed.orderId) {
        await this.emitOrderRefs(
          refreshed.orderId,
          refreshed.id,
          summary,
          null,
        );
      }
      if (refreshed.subscriptionId) {
        await this.emitSubscriptionSnapshot(
          refreshed.subscriptionId,
          refreshed.id,
          summary,
        );
      }
    }
  }

  /**
   * Base void/refund key resolved to a conclusively FAILED refund. Retry only with
   * a fresh numbered key (`{base}:2`, `:3`, …) and only when the provider list
   * completed and shows no succeeded/pending/requires_action refund that is not
   * already accounted for locally. Never reuses a FAILED key.
   */
  private async retryFailedVoidRefund(
    payment: Payment,
    input: VoidOrRefundInput,
    failedBase: Refund,
  ): Promise<void> {
    const base = input.idempotencyKey;
    const prefix = `${base}:`;
    const numberedRows = (
      await this.prisma.refund.findMany({
        where: {
          paymentId: payment.id,
          idempotencyKey: { startsWith: prefix },
        },
        orderBy: { createdAt: 'asc' },
      })
    ).filter((r) => /^\d+$/.test(r.idempotencyKey.slice(prefix.length)));
    const chain = [failedBase, ...numberedRows];

    const pending = chain.find((r) => r.status === RefundStatus.PENDING);
    if (pending) {
      await this.reconcileRefundAndNotify(pending);
      return;
    }
    if (chain.some((r) => r.status === RefundStatus.SUCCEEDED)) {
      return;
    }

    const highest = numberedRows.reduce(
      (max, r) => Math.max(max, Number(r.idempotencyKey.slice(prefix.length))),
      1,
    );
    const nextAttempt = highest + 1;
    if (nextAttempt > VOID_REFUND_MAX_ATTEMPT) {
      throw new BadRequestException({
        code: ErrorCodes.PAY_REFUND_INELIGIBLE,
        message: 'Void/refund retry limit reached; manual review required',
      });
    }

    const last = chain[chain.length - 1];
    const verdict = await this.assessVoidRefundRetry(payment, last);
    if (verdict === 'inconclusive') {
      throw new ConflictException({
        code: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        message:
          'void_refund_retry_inconclusive: provider refund state unknown; retry later',
      });
    }
    if (verdict === 'blocked') {
      return;
    }

    // Conclusive provider list/retrieve proved no money-moving refund —
    // stamp allow-listed failure so the FAILED base releases before `:N`.
    if (!isConfirmedRefundFailureCode(last.errorCode)) {
      await this.prisma.refund.updateMany({
        where: { id: last.id, status: RefundStatus.FAILED },
        data: { errorCode: ErrorCodes.PAY_REFUND_PROVIDER_FAILED },
      });
    }

    await this.runVoidRefundAttempt(payment, input, `${base}:${nextAttempt}`);
  }

  /**
   * safe = provider list/retrieve conclusively shows nothing moving money for this payment;
   * blocked = provider has (or may have) an equivalent refund, or no way to verify;
   * inconclusive = provider call failed/ambiguous (retry the whole operation later).
   */
  private async assessVoidRefundRetry(
    payment: Payment,
    lastFailed: Refund,
  ): Promise<'safe' | 'blocked' | 'inconclusive'> {
    if (this.gateway.listRefundsByPaymentRef && payment.providerPaymentRef) {
      const listed = await this.listProviderRefunds(payment);
      if (!listed) {
        return 'inconclusive';
      }
      const known = await this.prisma.refund.findMany({
        where: { paymentId: payment.id, providerRefundRef: { not: null } },
        select: { providerRefundRef: true, status: true },
      });
      const succeededRefs = new Set(
        known
          .filter((r) => r.status === RefundStatus.SUCCEEDED)
          .map((r) => r.providerRefundRef as string),
      );
      const unaccounted = listed.filter(
        (l) =>
          ACTIVE_PROVIDER_REFUND_STATUSES.has(l.status) &&
          !succeededRefs.has(l.providerRefundRef),
      );
      return unaccounted.length > 0 ? 'blocked' : 'safe';
    }

    if (this.gateway.retrieveRefund && lastFailed.providerRefundRef) {
      try {
        const result = await this.gateway.retrieveRefund({
          providerPaymentRef: payment.providerPaymentRef,
          providerCaptureRef: payment.providerCaptureRef,
          providerRefundRef: lastFailed.providerRefundRef,
          idempotencyKey: lastFailed.idempotencyKey,
          operation: 'refund',
        });
        if (
          result.outcomeClass === 'CONFIRMED_FAILURE' &&
          (result.lifecycleHint === undefined ||
            result.lifecycleHint === 'REFUND_FAILED')
        ) {
          return 'safe';
        }
        if (
          result.outcomeClass === 'SUCCESS' ||
          result.outcomeClass === 'ACTION_REQUIRED'
        ) {
          return 'blocked';
        }
        return 'inconclusive';
      } catch {
        return 'inconclusive';
      }
    }

    // No way to verify provider state — never auto-retry a money movement.
    return 'blocked';
  }

  /**
   * List provider refunds for the payment's PaymentIntent.
   * Returns null when unavailable or inconclusive (never "no refunds").
   */
  private async listProviderRefunds(
    payment: Payment,
  ): Promise<GatewayListedRefund[] | null> {
    if (!this.gateway.listRefundsByPaymentRef || !payment.providerPaymentRef) {
      return null;
    }
    try {
      const listed = await this.gateway.listRefundsByPaymentRef({
        providerPaymentRef: payment.providerPaymentRef,
      });
      if (listed.outcomeClass !== 'SUCCESS') {
        return null;
      }
      return (listed.refunds ?? []).filter(
        (r) =>
          !r.paymentIntentRef ||
          r.paymentIntentRef === payment.providerPaymentRef,
      );
    } catch {
      return null;
    }
  }

  /**
   * remaining = captured − Σ(SUCCEEDED) − Σ(PENDING) − Σ(UNCERTAIN_FAILED).
   * FAILED with allow-listed confirmed provider failure codes are released.
   * Must run under Payment lock with a transactionally consistent Refund set.
   */
  private async refundableRemainingCents(
    db: Pick<Prisma.TransactionClient, 'refund'>,
    payment: Pick<Payment, 'id' | 'capturedAmountCents' | 'amountCents'>,
  ): Promise<number> {
    const rows = await db.refund.findMany({
      where: { paymentId: payment.id },
      select: { amountCents: true, status: true, errorCode: true },
    });
    const base = payment.capturedAmountCents ?? payment.amountCents;
    return computeRefundReservation(base, rows).refundableCents;
  }

  /**
   * PSP recurring cancel. Unsupported providers return a soft result and never throw,
   * so Subscriptions local CANCELLED + onSubscriptionCancelled always proceed.
   */
  async cancelProviderRecurring(
    _subscriptionId: string,
    providerSubscriptionRef?: string | null,
  ): Promise<{ ok: boolean; unsupported?: boolean }> {
    if (!providerSubscriptionRef) {
      return { ok: true };
    }
    try {
      const result = await this.gateway.cancelRecurring({
        providerSubscriptionRef,
      });
      if (!result.ok && result.unsupported) {
        this.logger.log(
          `cancelRecurring unsupported for ref ${providerSubscriptionRef} (${result.errorCode})`,
        );
        return { ok: false, unsupported: true };
      }
      return { ok: result.ok };
    } catch (error) {
      this.logger.warn(
        `cancelRecurring failed (non-blocking): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { ok: false, unsupported: true };
    }
  }

  async handleOrderPaymentHook(
    event:
      'authorization_recorded' | 'capture_required' | 'void_or_refund_required',
    orderId: string,
  ): Promise<void> {
    if (event === 'authorization_recorded') {
      // Authorize already ran in the renewal processor — record-only no-op.
      return;
    }
    if (event === 'capture_required') {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { totalCents: true },
      });
      if (!order || order.totalCents === 0) {
        return;
      }
      const payment = await this.findLatestForOrder(orderId);
      if (!payment) {
        throw new BadRequestException({
          code: ErrorCodes.PAY_REFUND_INELIGIBLE,
          message: 'No payment available to capture for order',
        });
      }
      if (payment.lifecycleState === PaymentLifecycleState.CAPTURED) {
        return;
      }
      const capture = await this.capturePayment({
        paymentId: payment.id,
        idempotencyKey: `capture:${orderId}:${payment.id}`,
      });
      if (capture.lifecycleState !== PaymentLifecycleState.CAPTURED) {
        throw new BadRequestException({
          code: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
          message: `Capture did not complete (lifecycle=${capture.lifecycleState})`,
        });
      }
      return;
    }
    if (event === 'void_or_refund_required') {
      await this.voidOrRefundForOrder({
        orderId,
        reason: 'order_void_or_refund_required',
        idempotencyKey: `void_refund:${orderId}`,
      });
      // P14g: subscription DECLINED_HOLD is owned by CommerceIntegration after this void —
      // Payments must not call clinical/subscription handlers.
    }
  }

  async listPayments(params: {
    q?: string;
    status?: PaymentStatus | 'ALL';
    provider?: string;
    orderId?: string;
    subscriptionId?: string;
    lifecycleState?: PaymentLifecycleState | 'ALL';
    purpose?: PaymentPurpose | 'ALL';
    createdFrom?: string;
    createdTo?: string;
    skip?: number;
    take?: number;
  }) {
    const skip = params.skip ?? 0;
    const take = Math.min(params.take ?? 50, 100);
    const where: Prisma.PaymentWhereInput = {};
    if (params.status && params.status !== 'ALL') {
      where.status = params.status;
    }
    if (params.provider?.trim()) {
      where.provider = params.provider.trim();
    }
    if (params.orderId) {
      where.orderId = params.orderId;
    }
    if (params.subscriptionId) {
      where.subscriptionId = params.subscriptionId;
    }
    if (params.lifecycleState && params.lifecycleState !== 'ALL') {
      where.lifecycleState = params.lifecycleState;
    }
    if (params.purpose && params.purpose !== 'ALL') {
      where.purpose = params.purpose;
    }
    if (params.createdFrom || params.createdTo) {
      where.createdAt = {};
      if (params.createdFrom) {
        where.createdAt.gte = new Date(params.createdFrom);
      }
      if (params.createdTo) {
        where.createdAt.lte = new Date(params.createdTo);
      }
    }
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { id: { equals: q } },
        { providerPaymentRef: { contains: q, mode: 'insensitive' } },
        { idempotencyKey: { contains: q, mode: 'insensitive' } },
        { order: { orderNumber: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          orderId: true,
          subscriptionId: true,
          amountCents: true,
          currency: true,
          status: true,
          lifecycleState: true,
          purpose: true,
          provider: true,
          createdAt: true,
          updatedAt: true,
          order: {
            select: {
              orderNumber: true,
              status: true,
              patientUserId: true,
              customerFirstName: true,
              customerLastName: true,
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  async getPaymentDetail(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        refunds: { orderBy: { createdAt: 'desc' } },
        webhookEvents: { orderBy: { createdAt: 'desc' } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            patientUserId: true,
            customerFirstName: true,
            customerLastName: true,
            customerEmail: true,
            totalCents: true,
            currency: true,
            statusHistory: {
              where: { source: 'payment' },
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                fromStatus: true,
                toStatus: true,
                source: true,
                reason: true,
                createdAt: true,
              },
            },
          },
        },
        subscription: {
          select: { id: true, status: true },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Payment not found',
      });
    }

    const refundBase = payment.capturedAmountCents ?? payment.amountCents;
    const reservation = computeRefundReservation(refundBase, payment.refunds);

    return {
      id: payment.id,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      purpose: payment.purpose,
      initiator: payment.initiator,
      amountCents: payment.amountCents,
      authorizedAmountCents: payment.authorizedAmountCents,
      capturedAmountCents: payment.capturedAmountCents,
      refundedAmountCents: payment.refundedAmountCents,
      currency: payment.currency,
      status: payment.status,
      lifecycleState: payment.lifecycleState,
      provider: payment.provider,
      providerPaymentRef: payment.providerPaymentRef,
      providerAuthorizationRef: payment.providerAuthorizationRef,
      providerCaptureRef: payment.providerCaptureRef,
      providerStatusRaw: payment.providerStatusRaw,
      authorizedAt: payment.authorizedAt,
      capturedAt: payment.capturedAt,
      authorizationExpiresAt: payment.authorizationExpiresAt,
      idempotencyKey: payment.idempotencyKey,
      lastErrorCode: this.publicLastErrorCode(payment.lastErrorCode),
      refundedCents: reservation.refundedCents,
      reservedRefundCents: reservation.reservedRefundCents,
      refundableCents: reservation.refundableCents,
      order: payment.order
        ? {
            id: payment.order.id,
            orderNumber: payment.order.orderNumber,
            status: payment.order.status,
            totalCents: payment.order.totalCents,
            currency: payment.order.currency,
          }
        : null,
      subscription: payment.subscription
        ? { id: payment.subscription.id, status: payment.subscription.status }
        : null,
      patient: payment.order
        ? {
            userId: payment.order.patientUserId,
            firstName: payment.order.customerFirstName,
            lastName: payment.order.customerLastName,
            email: payment.order.customerEmail,
          }
        : null,
      timeline: payment.order?.statusHistory ?? [],
      refunds: payment.refunds.map((r) => ({
        id: r.id,
        amountCents: r.amountCents,
        status: r.status,
        reason: r.reason,
        errorCode: r.errorCode,
        actorUserId: r.actorUserId,
        providerRefundRef: r.providerRefundRef,
        createdAt: r.createdAt,
      })),
      webhookEvents: payment.webhookEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        providerEventId: e.providerEventId,
        processingStatus: e.processingStatus,
        attemptCount: e.attemptCount,
        lastError: e.lastError,
        appliedAt: e.appliedAt,
        createdAt: e.createdAt,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Refunds
  // ---------------------------------------------------------------------------

  async initiateRefund(input: {
    paymentId: string;
    amountCents: number;
    reason: string;
    actorUserId?: string | null;
    idempotencyKey: string;
  }) {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new BadRequestException({
        code: ErrorCodes.PAY_REFUND_INELIGIBLE,
        message: 'Refund amount must be a positive integer (cents)',
      });
    }
    if (!input.reason?.trim()) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_MISSING_FIELD,
        message: 'reason is required',
      });
    }
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_MISSING_FIELD,
        message: 'Idempotency-Key is required',
      });
    }
    // Refund.idempotencyKey is globally unique (no separate idempotency table).
    // Clients prefix `{paymentId}:{uuid}` so operations cannot collide across payments.

    const existing = await this.prisma.refund.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      this.assertRefundIdempotencyReplay(existing, input);
      return this.reconcileRefundAndNotify(existing);
    }

    const started = await this.startRefund({
      paymentId: input.paymentId,
      amountCents: input.amountCents,
      reason: input.reason.trim(),
      actorUserId: input.actorUserId ?? null,
      idempotencyKey: input.idempotencyKey,
    });
    if (started.kind === 'replay') {
      this.assertRefundIdempotencyReplay(started.refund, input);
      return this.reconcileRefundAndNotify(started.refund);
    }
    if (started.kind === 'noop') {
      throw new BadRequestException({
        code: ErrorCodes.PAY_REFUND_INELIGIBLE,
        message: 'Nothing left to refund',
      });
    }

    // Gateway call is outside the DB transaction; FAILED state is committed
    // before the error is thrown.
    const settled = await this.settleRefund(started.payment, started.refund);
    if (settled.outcome === 'failed') {
      throw new BadRequestException({
        code: ErrorCodes.PAY_REFUND_INELIGIBLE,
        message: settled.errorMessage ?? 'Refund failed',
      });
    }
    if (settled.outcome === 'succeeded') {
      await this.afterRefundSucceeded(settled.refund);
    }
    return settled.refund;
  }

  /**
   * Locked transaction: validate, compute remaining, persist a PENDING refund and
   * move the payment to REFUND_PENDING. `amountCents === null` refunds the remainder.
   */
  private async startRefund(params: {
    paymentId: string;
    amountCents: number | null;
    reason: string | null;
    actorUserId: string | null;
    idempotencyKey: string;
  }): Promise<RefundStart> {
    return this.prisma.$transaction(async (tx): Promise<RefundStart> => {
      await this.lockPayment(tx, params.paymentId);

      const raced = await tx.refund.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (raced) {
        return { kind: 'replay', refund: raced };
      }

      const payment = await tx.payment.findUnique({
        where: { id: params.paymentId },
      });
      if (!payment) {
        throw new NotFoundException({
          code: ErrorCodes.RES_NOT_FOUND,
          message: 'Payment not found',
        });
      }
      if (
        payment.lifecycleState !== PaymentLifecycleState.CAPTURED ||
        !payment.providerPaymentRef ||
        !payment.providerCaptureRef
      ) {
        throw new BadRequestException({
          code: ErrorCodes.PAY_REFUND_INELIGIBLE,
          message: 'Payment is not eligible for refund',
        });
      }

      // remaining = captured − Σ(SUCCEEDED) − Σ(PENDING); FAILED is released.
      const remaining = await this.refundableRemainingCents(tx, payment);

      let amountCents: number;
      if (params.amountCents === null) {
        if (remaining <= 0) {
          return { kind: 'noop' };
        }
        amountCents = remaining;
      } else {
        if (params.amountCents > remaining) {
          throw new BadRequestException({
            code: ErrorCodes.PAY_REFUND_INELIGIBLE,
            message: 'Refund exceeds remaining refundable amount',
          });
        }
        amountCents = params.amountCents;
      }

      const refund = await tx.refund.create({
        data: {
          paymentId: payment.id,
          orderId: payment.orderId,
          amountCents,
          status: RefundStatus.PENDING,
          reason: params.reason,
          actorUserId: params.actorUserId,
          idempotencyKey: params.idempotencyKey,
        },
      });
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: { lifecycleState: PaymentLifecycleState.REFUND_PENDING },
      });
      return { kind: 'created', refund, payment: updated };
    });
  }

  /** Call the gateway for a PENDING refund and persist the outcome. */
  private async settleRefund(
    payment: Payment,
    refund: Refund,
  ): Promise<{
    outcome: 'succeeded' | 'pending' | 'failed';
    refund: Refund;
    errorMessage?: string;
  }> {
    const result = await this.callGateway(() =>
      this.gateway.refund({
        providerPaymentRef: payment.providerPaymentRef as string,
        providerCaptureRef: payment.providerCaptureRef as string,
        amountCents: refund.amountCents,
        idempotencyKey: refund.idempotencyKey,
        reason: refund.reason ?? undefined,
        metadata: {
          clinexa_payment_id: payment.id,
          clinexa_refund_id: refund.id,
        },
      }),
    );

    if (result.success) {
      const finalized = await this.finalizeRefundSuccess(
        refund.id,
        result.providerRefundRef ?? null,
      );
      if (finalized) {
        return { outcome: 'succeeded', refund: finalized };
      }
      const current = await this.prisma.refund.findUniqueOrThrow({
        where: { id: refund.id },
      });
      return {
        outcome:
          current.status === RefundStatus.SUCCEEDED ? 'succeeded' : 'pending',
        refund: current,
      };
    }

    const errorCode = result.errorCode ?? ErrorCodes.PAY_REFUND_INELIGIBLE;
    if (isAmbiguousOutcome(result)) {
      // Unknown provider state: leave Refund PENDING + payment REFUND_PENDING.
      // Persist re_… when the provider already returned one (pending / requires_action).
      const ambiguousCode =
        result.errorCode ?? ErrorCodes.PAY_PROVIDER_UNAVAILABLE;
      let pending: Refund;
      try {
        pending = await this.prisma.refund.update({
          where: { id: refund.id },
          data: {
            errorCode: ambiguousCode,
            ...(result.providerRefundRef
              ? { providerRefundRef: result.providerRefundRef }
              : {}),
          },
        });
      } catch (error) {
        if (
          result.providerRefundRef &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // providerRefundRef already bound elsewhere — keep PENDING without ref.
          this.logger.error(
            `providerRefundRef ${result.providerRefundRef} already bound; refund ${refund.id} left PENDING`,
          );
          pending = await this.prisma.refund.update({
            where: { id: refund.id },
            data: { errorCode: ambiguousCode },
          });
        } else {
          throw error;
        }
      }
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          lastErrorCode:
            result.errorCode ?? ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        },
      });
      return { outcome: 'pending', refund: pending };
    }

    // Conclusive gateway failure — write allow-listed code so reservation releases.
    const confirmedCode =
      result.outcomeClass === 'CONFIRMED_FAILURE'
        ? ErrorCodes.PAY_REFUND_PROVIDER_FAILED
        : errorCode;
    const failed = await this.finalizeRefundFailure(refund.id, confirmedCode);
    const current =
      failed ??
      (await this.prisma.refund.findUniqueOrThrow({
        where: { id: refund.id },
      }));
    return {
      outcome: 'failed',
      refund: current,
      errorMessage: result.errorMessage,
    };
  }

  private async finalizeRefundSuccess(
    refundId: string,
    providerRefundRef: string | null,
  ): Promise<Refund | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.refund.findUnique({ where: { id: refundId } });
      if (!current) {
        return null;
      }
      await this.lockPayment(tx, current.paymentId);
      const upd = await tx.refund.updateMany({
        where: { id: refundId, status: RefundStatus.PENDING },
        data: {
          status: RefundStatus.SUCCEEDED,
          errorCode: null,
          ...(providerRefundRef ? { providerRefundRef } : {}),
        },
      });
      if (upd.count === 0) {
        return null;
      }
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: current.paymentId },
      });
      const agg = await tx.refund.aggregate({
        where: { paymentId: payment.id, status: RefundStatus.SUCCEEDED },
        _sum: { amountCents: true },
      });
      const refundedTotal = agg._sum.amountCents ?? 0;
      const fullyRefunded =
        refundedTotal >= (payment.capturedAmountCents ?? payment.amountCents);
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmountCents: refundedTotal,
          lastErrorCode: null,
          ...(fullyRefunded
            ? {
                status: PaymentStatus.REFUNDED,
                lifecycleState: PaymentLifecycleState.REFUNDED,
              }
            : { lifecycleState: PaymentLifecycleState.CAPTURED }),
        },
      });
      return tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    });
  }

  private async finalizeRefundFailure(
    refundId: string,
    errorCode: string,
  ): Promise<Refund | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.refund.findUnique({ where: { id: refundId } });
      if (!current) {
        return null;
      }
      await this.lockPayment(tx, current.paymentId);
      const upd = await tx.refund.updateMany({
        where: { id: refundId, status: RefundStatus.PENDING },
        data: { status: RefundStatus.FAILED, errorCode },
      });
      if (upd.count === 0) {
        return null;
      }
      const stillPending = await tx.refund.count({
        where: { paymentId: current.paymentId, status: RefundStatus.PENDING },
      });
      if (stillPending === 0) {
        await tx.payment.updateMany({
          where: {
            id: current.paymentId,
            lifecycleState: PaymentLifecycleState.REFUND_PENDING,
          },
          data: {
            lifecycleState: PaymentLifecycleState.CAPTURED,
            lastErrorCode: errorCode,
          },
        });
      }
      return tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    });
  }

  /** Resolve a PENDING refund via provider retrieve (when supported). */
  private async reconcileRefund(initial: Refund): Promise<Refund> {
    let refund = initial;
    if (refund.status !== RefundStatus.PENDING) {
      return refund;
    }
    const canList = !!this.gateway.listRefundsByPaymentRef;
    if (!this.gateway.retrieveRefund && !canList) {
      return refund;
    }
    const payment = await this.prisma.payment.findUnique({
      where: { id: refund.paymentId },
    });
    if (!payment) {
      return refund;
    }

    // Phase 6F: PENDING without re_… (timeout before the id was persisted) —
    // bind via PaymentIntent refund list. Search/empty list is never proof of absence.
    let listedMatch: GatewayListedRefund | null = null;
    if (!refund.providerRefundRef && canList && payment.providerPaymentRef) {
      let listed;
      try {
        listed = await this.gateway.listRefundsByPaymentRef!({
          providerPaymentRef: payment.providerPaymentRef,
        });
      } catch {
        return refund; // inconclusive
      }
      if (listed.outcomeClass !== 'SUCCESS') {
        return refund; // network/timeout — inconclusive, leave PENDING
      }
      const match = await this.matchListedRefundForPending(
        refund,
        payment,
        listed.refunds ?? [],
      );
      if (match) {
        const bound = await this.bindProviderRefundRef(refund, match);
        if (!bound) {
          return this.prisma.refund.findUniqueOrThrow({
            where: { id: refund.id },
          });
        }
        refund = bound;
        listedMatch = match;
      }
      // No unique confident match: fall through (simulated retrieve by idempotencyKey,
      // Stripe retrieve without a ref is a no-op). Never fail the refund from absence.
    }

    let result: GatewayRetrieveResult;
    if (!this.gateway.retrieveRefund) {
      if (!listedMatch) {
        return refund;
      }
      result = this.listedRefundToRetrieveResult(listedMatch);
    } else {
      try {
        result = await this.gateway.retrieveRefund({
          providerPaymentRef: payment.providerPaymentRef,
          providerCaptureRef: payment.providerCaptureRef,
          providerRefundRef: refund.providerRefundRef,
          idempotencyKey: refund.idempotencyKey,
          operation: 'refund',
        });
      } catch {
        return refund;
      }
    }

    if (
      result.outcomeClass === 'SUCCESS' &&
      (result.lifecycleHint === undefined ||
        result.lifecycleHint === 'REFUNDED')
    ) {
      const finalized = await this.finalizeRefundSuccess(
        refund.id,
        result.providerRefundRef ?? null,
      );
      await this.notifyRefundSucceededIfNeeded(refund.id);
      if (finalized) {
        return finalized;
      }
    } else if (
      result.outcomeClass === 'CONFIRMED_FAILURE' &&
      (result.lifecycleHint === undefined ||
        result.lifecycleHint === 'REFUND_FAILED')
    ) {
      const failed = await this.finalizeRefundFailure(
        refund.id,
        result.errorCode ?? ErrorCodes.PAY_REFUND_INELIGIBLE,
      );
      if (failed) {
        return failed;
      }
    }
    return this.prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
  }

  private async reconcileRefundAndNotify(refund: Refund): Promise<Refund> {
    if (refund.status !== RefundStatus.PENDING) {
      return refund;
    }
    return this.reconcileRefund(refund);
  }

  /**
   * Confident correlation of a local PENDING refund (null re_…) with exactly one
   * unbound provider refund of equal amount (+ currency when listed). Amount alone
   * never correlates when more than one candidate (provider or local) exists.
   */
  private async matchListedRefundForPending(
    refund: Refund,
    payment: Payment,
    listed: GatewayListedRefund[],
  ): Promise<GatewayListedRefund | null> {
    const boundRows = await this.prisma.refund.findMany({
      where: { paymentId: payment.id, providerRefundRef: { not: null } },
      select: { providerRefundRef: true },
    });
    const bound = new Set(boundRows.map((r) => r.providerRefundRef as string));
    const currency = payment.currency.toUpperCase();

    const candidates = listed.filter(
      (l) =>
        !bound.has(l.providerRefundRef) &&
        (!l.paymentIntentRef ||
          l.paymentIntentRef === payment.providerPaymentRef) &&
        l.amountCents === refund.amountCents &&
        (!l.currency || l.currency.toUpperCase() === currency),
    );
    if (candidates.length !== 1) {
      return null;
    }

    // Other local in-flight refunds of the same amount make amount-only matching ambiguous.
    const siblings = await this.prisma.refund.count({
      where: {
        paymentId: payment.id,
        status: RefundStatus.PENDING,
        providerRefundRef: null,
        amountCents: refund.amountCents,
        id: { not: refund.id },
      },
    });
    if (siblings > 0) {
      return null;
    }
    return candidates[0];
  }

  /** Bind re_… to a still-PENDING refund; null when lost a race / unique conflict. */
  private async bindProviderRefundRef(
    refund: Refund,
    listed: GatewayListedRefund,
  ): Promise<Refund | null> {
    try {
      const res = await this.prisma.refund.updateMany({
        where: {
          id: refund.id,
          status: RefundStatus.PENDING,
          providerRefundRef: null,
        },
        data: { providerRefundRef: listed.providerRefundRef },
      });
      if (res.count !== 1) {
        return null;
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
    return this.prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
  }

  private listedRefundToRetrieveResult(
    listed: GatewayListedRefund,
  ): GatewayRetrieveResult {
    if (listed.status === 'succeeded') {
      return {
        outcomeClass: 'SUCCESS',
        lifecycleHint: 'REFUNDED',
        providerRefundRef: listed.providerRefundRef,
        providerStatusRaw: listed.status,
      };
    }
    if (listed.status === 'failed' || listed.status === 'canceled') {
      return {
        outcomeClass: 'CONFIRMED_FAILURE',
        lifecycleHint: 'REFUND_FAILED',
        providerRefundRef: listed.providerRefundRef,
        providerStatusRaw: listed.status,
      };
    }
    return {
      outcomeClass:
        listed.status === 'requires_action'
          ? 'ACTION_REQUIRED'
          : 'NETWORK_UNKNOWN',
      lifecycleHint: 'PENDING',
      providerRefundRef: listed.providerRefundRef,
      providerStatusRaw: listed.status,
    };
  }

  /**
   * Notify order totals/activity when refund is SUCCEEDED.
   * Safe to call after a null finalize (already SUCCEEDED) so missing
   * OrderActivity can recover on webhook/reconcile retry.
   */
  private async notifyRefundSucceededIfNeeded(refundId: string): Promise<void> {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
    });
    if (!refund || refund.status !== RefundStatus.SUCCEEDED) {
      return;
    }
    await this.afterRefundSucceeded(refund);
  }

  private async afterRefundSucceeded(refund: Refund): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: refund.paymentId },
    });
    if (payment?.orderId && this.handlers.onRefundSucceeded) {
      await this.handlers.onRefundSucceeded({
        orderId: payment.orderId,
        paymentId: payment.id,
        refundId: refund.id,
        refundedTotalCents: payment.refundedAmountCents,
        paymentStatusSummary: toSummary(payment.status),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Webhooks (lease protocol)
  // ---------------------------------------------------------------------------

  async ingestWebhook(input: {
    secretHeader: string | undefined;
    envelope: WebhookEnvelope;
    verificationMode?: WebhookVerificationMode;
    /** Unmapped Stripe events: accept + APPLIED with no financial mutation. */
    skipFinancialMutation?: boolean;
  }): Promise<{ accepted: true; duplicate: boolean }> {
    const mode = input.verificationMode ?? 'shared_secret';
    if (mode === 'shared_secret') {
      const expected = this.config.getOrThrow<string>('payments.webhookSecret');
      const valid = this.gateway.verifyWebhook({
        secretHeader: input.secretHeader,
        expectedSecret: expected,
      });
      if (!valid) {
        throw new UnauthorizedException({
          code: ErrorCodes.PAY_WEBHOOK_INVALID,
          message: 'Invalid payment webhook signature',
        });
      }
    }

    const provider = input.envelope.provider || this.getProviderName();
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(input.envelope))
      .digest('hex');

    // 1) Insert RECEIVED (or find the existing row).
    let event;
    try {
      event = await this.prisma.paymentWebhookEvent.create({
        data: {
          provider,
          providerEventId: input.envelope.providerEventId,
          eventType: input.envelope.type,
          payloadHash,
          processingStatus: PaymentWebhookProcessingStatus.RECEIVED,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        event = await this.prisma.paymentWebhookEvent.findUnique({
          where: {
            provider_providerEventId: {
              provider,
              providerEventId: input.envelope.providerEventId,
            },
          },
        });
        if (!event) {
          throw error;
        }
      } else {
        throw error;
      }
    }

    // 2) Already applied -> true duplicate.
    if (event.processingStatus === PaymentWebhookProcessingStatus.APPLIED) {
      return { accepted: true, duplicate: true };
    }

    // 3) Claim with a lease (RECEIVED | FAILED | expired PROCESSING).
    const claimToken = randomUUID();
    const rawLease = this.config.get<number>('payments.webhookLeaseSeconds');
    const leaseSeconds =
      typeof rawLease === 'number' && Number.isFinite(rawLease) && rawLease > 0
        ? rawLease
        : DEFAULT_WEBHOOK_LEASE_SECONDS;
    const claimed = await this.prisma.$executeRaw`
      UPDATE payment_webhook_events
      SET claim_token = ${claimToken},
          lease_expires_at = now() + (${leaseSeconds}::double precision * interval '1 second'),
          processing_status = 'PROCESSING',
          attempt_count = attempt_count + 1,
          updated_at = now()
      WHERE id = ${event.id}::uuid
        AND (
          processing_status IN ('RECEIVED', 'FAILED')
          OR (processing_status = 'PROCESSING' AND lease_expires_at < now())
        )
    `;

    if (claimed === 0) {
      const current = await this.prisma.paymentWebhookEvent.findUnique({
        where: { id: event.id },
        select: { processingStatus: true },
      });
      if (
        current?.processingStatus === PaymentWebhookProcessingStatus.APPLIED
      ) {
        return { accepted: true, duplicate: true };
      }
      // Another worker holds a live lease — ask the PSP to retry rather than
      // acknowledging an event that is not yet applied.
      throw new ConflictException({
        code: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        message: 'Webhook event is currently being processed; retry later',
      });
    }

    // 4) Apply business logic with state guards.
    let paymentId: string | null;
    try {
      if (input.skipFinancialMutation) {
        paymentId = null;
      } else {
        paymentId = await this.applyWebhookBusiness(input.envelope);
        // Event arrived before the Payment row/ref persisted (any provider) —
        // fail for redelivery rather than APPLIED-noop.
        if (paymentId == null && input.envelope.paymentRef) {
          throw new ConflictException({
            code: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
            message: 'uncorrelated: payment not found for provider ref yet',
          });
        }
      }
    } catch (error) {
      const message = (
        error instanceof Error ? error.message : String(error)
      ).slice(0, 1000);
      try {
        await this.prisma.$executeRaw`
          UPDATE payment_webhook_events
          SET processing_status = 'FAILED',
              last_error = ${message},
              claim_token = NULL,
              lease_expires_at = NULL,
              updated_at = now()
          WHERE id = ${event.id}::uuid
            AND claim_token = ${claimToken}
        `;
      } catch {
        // Preserve the original error.
      }
      throw error;
    }

    // 5) Finalize APPLIED only if we still own the lease.
    const finalized = await this.prisma.$executeRaw`
      UPDATE payment_webhook_events
      SET processing_status = 'APPLIED',
          applied_at = now(),
          payment_id = ${paymentId}::uuid,
          last_error = NULL,
          claim_token = NULL,
          lease_expires_at = NULL,
          updated_at = now()
      WHERE id = ${event.id}::uuid
        AND claim_token = ${claimToken}
    `;
    if (finalized !== 1) {
      // Lease lost (expired + reclaimed, or row changed) — do not ack as applied.
      throw new ConflictException({
        code: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        message:
          'Webhook lease lost before APPLIED finalize; retry later (lease_lost)',
      });
    }

    return { accepted: true, duplicate: false };
  }

  /** Apply a webhook to payment state; every branch is guarded and idempotent. */
  private async applyWebhookBusiness(
    envelope: WebhookEnvelope,
  ): Promise<string | null> {
    // Provider refund updates correlate by Refund object, not only paymentRef.
    if (envelope.type === 'refund.provider_update') {
      return this.applyProviderRefundWebhook(envelope);
    }
    if (envelope.type === 'refund.charge_refunded_notice') {
      // Never mark Payment fully REFUNDED from charge.refunded — optional no-op.
      if (envelope.paymentRef) {
        const payment = await this.findByProviderPaymentRef(
          envelope.paymentRef,
        );
        return payment?.id ?? null;
      }
      return null;
    }
    if (envelope.type === 'payment.requires_action') {
      return this.applyRequiresActionWebhook(envelope);
    }
    if (envelope.type === 'payment.authorized') {
      return this.applyAuthorizedWebhook(envelope);
    }

    if (!envelope.paymentRef) {
      return null;
    }
    let payment = await this.findByProviderPaymentRef(envelope.paymentRef);
    if (!payment) {
      payment = await this.findPaymentByStripeMetadata(envelope);
    }
    if (!payment) {
      return null;
    }
    // Persist ref if webhook arrived with PI id before API wrote it.
    if (!payment.providerPaymentRef && envelope.paymentRef) {
      payment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentRef: envelope.paymentRef,
          providerAuthorizationRef: envelope.paymentRef,
        },
      });
    }
    const paymentId = payment.id;

    if (envelope.type === 'payment.captured') {
      await this.applyCapturedWebhook(payment, envelope);
    } else if (envelope.type === 'payment.authorization_failed') {
      await this.applyAuthorizationFailedWebhook(payment, envelope);
    } else if (envelope.type === 'payment.refunded') {
      // D6: notice-only. Money moves only via refund.provider_update (Refund object)
      // or staff-initiated refunds — never from a payment-level refunded event.
    } else if (envelope.type === 'payment.voided') {
      await this.applyVoidedWebhook(payment, envelope);
    }

    return paymentId;
  }

  /** Classify a provider PaymentIntent retrieve for webhook/reconcile branching. */
  private async retrieveProviderPaymentState(
    payment: Payment,
  ): Promise<ProviderPaymentState> {
    const useAuthorization = !!this.gateway.retrieveAuthorization;
    if (
      (!useAuthorization && !this.gateway.retrieveCapture) ||
      !payment.providerPaymentRef
    ) {
      return { kind: 'unavailable' };
    }
    const retrieveInput = {
      providerPaymentRef: payment.providerPaymentRef,
      providerAuthorizationRef: payment.providerAuthorizationRef,
      providerCaptureRef: payment.providerCaptureRef,
      idempotencyKey: payment.idempotencyKey,
      operation: useAuthorization
        ? ('authorization' as const)
        : ('capture' as const),
    };
    let result: GatewayRetrieveResult;
    try {
      result = useAuthorization
        ? await this.gateway.retrieveAuthorization!(retrieveInput)
        : await this.gateway.retrieveCapture!(retrieveInput);
    } catch {
      return { kind: 'inconclusive' };
    }

    if (
      result.outcomeClass === 'SUCCESS' &&
      result.lifecycleHint === 'CAPTURED'
    ) {
      return { kind: 'captured', result };
    }
    if (
      result.outcomeClass === 'SUCCESS' &&
      (result.lifecycleHint === undefined ||
        result.lifecycleHint === 'AUTHORIZED')
    ) {
      return { kind: 'authorized', result };
    }
    if (result.outcomeClass === 'ACTION_REQUIRED') {
      return { kind: 'requires_action', result };
    }
    if (result.outcomeClass === 'CONFIRMED_FAILURE') {
      return {
        kind:
          (result.providerStatusRaw ?? '').toLowerCase() === 'canceled'
            ? 'canceled'
            : 'failed',
        result,
      };
    }
    return { kind: 'inconclusive', result };
  }

  /** Provider-confirmed capture: finalize locally without issuing gateway.capture. */
  private async finalizeCaptureFromProvider(
    payment: Payment,
    result: GatewayRetrieveResult | undefined,
  ): Promise<Payment> {
    return this.finalizeCaptureSuccess(
      payment,
      result?.providerCaptureRef ??
        payment.providerCaptureRef ??
        payment.providerPaymentRef,
      result?.providerStatusRaw,
    );
  }

  private retryableConflict(message: string): ConflictException {
    return new ConflictException({
      code: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
      message,
    });
  }

  /**
   * D12: retrieve the PI before capturing. A PI that already succeeded is finalized
   * locally (no gateway capture); requires_action stays pending (retryable);
   * canceled routes to void/fail instead of capture.
   */
  private async applyCapturedWebhook(
    initial: Payment,
    envelope: WebhookEnvelope,
  ): Promise<void> {
    let payment = initial;
    const lifecycle = payment.lifecycleState;
    const capturableStates: PaymentLifecycleState[] = [
      PaymentLifecycleState.PENDING_AUTHORIZATION,
      PaymentLifecycleState.AUTHORIZED,
      PaymentLifecycleState.CAPTURE_PENDING,
      PaymentLifecycleState.CAPTURE_FAILED,
    ];
    if (lifecycle === PaymentLifecycleState.CAPTURED) {
      return; // already applied — no gateway call
    }
    if (!capturableStates.includes(lifecycle)) {
      return; // terminal / refund states are never reopened
    }

    const state = await this.retrieveProviderPaymentState(payment);
    const direct: PaymentLifecycleState[] = [
      PaymentLifecycleState.PENDING_AUTHORIZATION,
      PaymentLifecycleState.AUTHORIZED,
      PaymentLifecycleState.CAPTURE_PENDING,
    ];

    switch (state.kind) {
      case 'captured':
        if (direct.includes(lifecycle)) {
          await this.finalizeCaptureFromProvider(payment, state.result);
          return;
        }
        break; // CAPTURE_FAILED: capturePayment claims + retrieves + finalizes
      case 'requires_action':
        throw this.retryableConflict(
          'Payment still requires customer action; capture webhook retry later',
        );
      case 'canceled':
      case 'failed':
        await this.routeCanceledProviderPayment(payment, envelope, state);
        return;
      case 'inconclusive':
        if (lifecycle === PaymentLifecycleState.PENDING_AUTHORIZATION) {
          throw this.retryableConflict(
            'Payment authorization is not yet confirmed',
          );
        }
        break; // Authorized rows: capturePayment retrieves again / reconciles
      case 'authorized':
      case 'unavailable':
      default:
        break;
    }

    if (lifecycle === PaymentLifecycleState.PENDING_AUTHORIZATION) {
      payment = await this.reconcileAuthorization(payment);
      if (
        payment.lifecycleState === PaymentLifecycleState.PENDING_AUTHORIZATION
      ) {
        throw this.retryableConflict(
          'Payment authorization is not yet confirmed',
        );
      }
    }
    if (capturableStates.includes(payment.lifecycleState)) {
      if (!payment.orderId) {
        // Cannot reconstruct canonical capture key — retrieve-only already tried.
        throw this.retryableConflict(
          'capture webhook missing orderId for canonical capture key; retry later',
        );
      }
      await this.capturePayment({
        paymentId: payment.id,
        idempotencyKey: canonicalCaptureIdempotencyKey(
          payment.orderId,
          payment.id,
        ),
      });
    }
  }

  /** Provider shows canceled / definitively failed: never capture; void or fail locally. */
  private async routeCanceledProviderPayment(
    payment: Payment,
    envelope: WebhookEnvelope,
    state: ProviderPaymentState,
  ): Promise<void> {
    if (
      payment.lifecycleState === PaymentLifecycleState.PENDING_AUTHORIZATION
    ) {
      await this.finalizeAuthorizationFailure(
        payment,
        ErrorCodes.PAY_AUTHORIZATION_FAILED,
        state.result?.providerStatusRaw,
      );
      return;
    }
    if (
      payment.lifecycleState === PaymentLifecycleState.AUTHORIZED ||
      payment.lifecycleState === PaymentLifecycleState.CAPTURE_PENDING ||
      payment.lifecycleState === PaymentLifecycleState.CAPTURE_FAILED
    ) {
      const ok = await this.voidAuthorization(
        payment,
        `webhook_canceled:${envelope.providerEventId}`,
        null,
      );
      if (!ok) {
        throw this.retryableConflict(
          'Provider PaymentIntent canceled but local void did not complete; retry later',
        );
      }
    }
  }

  /**
   * D14: never terminal-fail PENDING_AUTHORIZATION from the event alone — retrieve first.
   */
  private async applyAuthorizationFailedWebhook(
    payment: Payment,
    envelope: WebhookEnvelope,
  ): Promise<void> {
    if (
      payment.lifecycleState !== PaymentLifecycleState.PENDING_AUTHORIZATION
    ) {
      return; // already terminal/progressed — no-op
    }
    const state = await this.retrieveProviderPaymentState(payment);
    switch (state.kind) {
      case 'captured':
        await this.finalizeCaptureFromProvider(payment, state.result);
        return;
      case 'authorized':
        // requires_capture: authorization actually succeeded — do not terminal-fail.
        await this.reconcileAuthorization(payment);
        return;
      case 'requires_action':
        return; // not terminal; stays pending
      case 'canceled':
      case 'failed':
        await this.finalizeAuthorizationFailure(
          payment,
          ErrorCodes.PAY_AUTHORIZATION_FAILED,
          state.result?.providerStatusRaw,
        );
        return;
      case 'inconclusive':
        throw this.retryableConflict(
          `Authorization failure for ${envelope.providerEventId} could not be confirmed with the provider; retry later`,
        );
      case 'unavailable':
      default:
        // Gateway cannot retrieve — legacy behaviour.
        await this.finalizeAuthorizationFailure(
          payment,
          ErrorCodes.PAY_AUTHORIZATION_FAILED,
        );
    }
  }

  /** D13: payment.voided, including PENDING_AUTHORIZATION (retrieve-first). */
  private async applyVoidedWebhook(
    payment: Payment,
    envelope: WebhookEnvelope,
  ): Promise<void> {
    if (
      payment.lifecycleState === PaymentLifecycleState.PENDING_AUTHORIZATION
    ) {
      const state = await this.retrieveProviderPaymentState(payment);
      switch (state.kind) {
        case 'canceled':
        case 'failed':
          await this.finalizeAuthorizationFailure(
            payment,
            ErrorCodes.PAY_AUTHORIZATION_FAILED,
            state.result?.providerStatusRaw,
          );
          return;
        case 'captured':
          await this.finalizeCaptureFromProvider(payment, state.result);
          return;
        case 'authorized': {
          const ok = await this.voidAuthorization(
            payment,
            `webhook_void:${envelope.providerEventId}`,
            null,
          );
          if (!ok) {
            throw this.retryableConflict(
              'Void of authorized PaymentIntent did not complete; retry later',
            );
          }
          return;
        }
        case 'requires_action':
        case 'inconclusive':
          throw this.retryableConflict(
            'Voided event could not be confirmed with the provider; retry later',
          );
        case 'unavailable':
        default:
          return; // legacy: cannot verify, leave pending for reconcile
      }
    }

    if (
      payment.orderId &&
      (payment.lifecycleState === PaymentLifecycleState.AUTHORIZED ||
        payment.lifecycleState === PaymentLifecycleState.CAPTURE_PENDING ||
        payment.lifecycleState === PaymentLifecycleState.CAPTURE_FAILED)
    ) {
      await this.voidOrRefundForOrder({
        orderId: payment.orderId,
        reason: 'webhook_payment.voided',
        idempotencyKey: `webhook_void:${envelope.providerEventId}`,
      });
    }
  }

  private async findPaymentByStripeMetadata(
    envelope: WebhookEnvelope,
  ): Promise<Payment | null> {
    const obj = envelope.data?.object as
      { metadata?: { clinexa_payment_id?: string } } | undefined;
    const paymentId = obj?.metadata?.clinexa_payment_id;
    if (!paymentId) {
      return null;
    }
    return this.prisma.payment.findUnique({ where: { id: paymentId } });
  }

  private async applyRequiresActionWebhook(
    envelope: WebhookEnvelope,
  ): Promise<string | null> {
    if (!envelope.paymentRef) {
      return null;
    }
    let payment = await this.findByProviderPaymentRef(envelope.paymentRef);
    if (!payment) {
      payment = await this.findPaymentByStripeMetadata(envelope);
    }
    if (!payment) {
      return null;
    }
    // Never regress terminal / captured / refunded from a stale requires_action.
    if (
      payment.lifecycleState !== PaymentLifecycleState.PENDING_AUTHORIZATION
    ) {
      return payment.id;
    }

    // Bind PI ref if missing, then retrieve before stamping (Phase 6G R2).
    if (!payment.providerPaymentRef) {
      payment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentRef: envelope.paymentRef,
          providerAuthorizationRef: envelope.paymentRef,
        },
      });
    } else if (payment.providerPaymentRef !== envelope.paymentRef) {
      throw this.retryableConflict(
        'requires_action paymentRef does not match Payment.providerPaymentRef',
      );
    }

    const state = await this.retrieveProviderPaymentState(payment);
    switch (state.kind) {
      case 'requires_action':
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            providerPaymentRef: envelope.paymentRef,
            providerAuthorizationRef: envelope.paymentRef,
            providerStatusRaw:
              state.result?.providerStatusRaw ?? 'requires_action',
          },
        });
        return payment.id;
      case 'authorized':
        await this.reconcileAuthorization(payment);
        return payment.id;
      case 'captured':
        await this.finalizeCaptureFromProvider(payment, state.result);
        return payment.id;
      case 'canceled':
      case 'failed':
        await this.finalizeAuthorizationFailure(
          payment,
          ErrorCodes.PAY_AUTHORIZATION_FAILED,
          state.result?.providerStatusRaw,
        );
        return payment.id;
      case 'inconclusive':
      case 'unavailable':
      default:
        throw this.retryableConflict(
          'requires_action could not be confirmed with the provider; retry later',
        );
    }
  }

  private async applyAuthorizedWebhook(
    envelope: WebhookEnvelope,
  ): Promise<string | null> {
    if (!envelope.paymentRef) {
      return null;
    }
    let payment = await this.findByProviderPaymentRef(envelope.paymentRef);
    if (!payment) {
      payment = await this.findPaymentByStripeMetadata(envelope);
    }
    if (!payment) {
      return null;
    }
    if (
      payment.lifecycleState === PaymentLifecycleState.PENDING_AUTHORIZATION
    ) {
      payment = await this.reconcileAuthorization({
        ...payment,
        providerPaymentRef: payment.providerPaymentRef ?? envelope.paymentRef,
      });
    }
    return payment.id;
  }

  /**
   * refund.provider_update — Refund object is the money authority.
   *
   * - Exact `providerRefundRef` match finalizes monotonically (PENDING → SUCCEEDED/FAILED
   *   via finalizeRefundSuccess/Failure only; terminal rows are never rewritten).
   * - Before creating, under the payment lock: an in-flight staff PENDING refund with a null
   *   ref (or REFUND_PENDING that cannot be correlated) blocks creation with a retryable
   *   ConflictException (`in_flight_staff_refund` / `ambiguous_refund_correlation`).
   * - A single staff PENDING row is reused only on exact paymentId + amount (+ currency) match.
   * - Amount alone never correlates when multiple candidates exist.
   * - Never marks Payment REFUNDED from partials alone.
   */
  private async applyProviderRefundWebhook(
    envelope: WebhookEnvelope,
  ): Promise<string | null> {
    const obj = envelope.data?.object as
      | {
          id?: string;
          object?: string;
          amount?: number;
          currency?: string | null;
          status?: string | null;
          payment_intent?: string | { id?: string } | null;
        }
      | undefined;

    const providerRefundRef = typeof obj?.id === 'string' ? obj.id.trim() : '';
    const amountCents = obj?.amount;
    const piFromObject =
      typeof obj?.payment_intent === 'string'
        ? obj.payment_intent
        : (obj?.payment_intent?.id ?? null);
    const providerPiRefs = [envelope.paymentRef, piFromObject].filter(
      (r): r is string => typeof r === 'string' && r.length > 0,
    );

    // Resolve payment: paymentRef / payment_intent / metadata.clinexa_payment_id.
    let payment: Payment | null = null;
    if (envelope.paymentRef) {
      payment = await this.findByProviderPaymentRef(envelope.paymentRef);
    }
    if (!payment && piFromObject) {
      payment = await this.findByProviderPaymentRef(piFromObject);
    }
    if (!payment) {
      payment = await this.findPaymentByStripeMetadata(envelope);
    }

    if (
      !obj ||
      obj.object !== 'refund' ||
      !providerRefundRef ||
      typeof amountCents !== 'number' ||
      !Number.isInteger(amountCents) ||
      amountCents <= 0
    ) {
      this.logger.warn(
        `refund.provider_update ${envelope.providerEventId} missing refund id/amount; no mutation`,
      );
      return payment?.id ?? null;
    }

    const refundOutcome = this.classifyProviderRefundStatus(obj.status);

    const assertPaymentIntentMatches = (
      candidate: Payment,
      requireRef: boolean,
    ) => {
      if (providerPiRefs.length === 0) {
        if (requireRef) {
          throw this.ambiguousRefundConflict(
            'ambiguous_refund_correlation: refund has no payment_intent to verify',
          );
        }
        return;
      }
      if (
        !candidate.providerPaymentRef ||
        providerPiRefs.some((ref) => ref !== candidate.providerPaymentRef)
      ) {
        throw this.ambiguousRefundConflict(
          'ambiguous_refund_correlation: payment_intent does not match Payment.providerPaymentRef',
        );
      }
    };

    // Exact providerRefundRef lookup → monotonic finalize only.
    const existing = await this.prisma.refund.findFirst({
      where: { providerRefundRef },
    });
    if (existing) {
      if (!payment || payment.id !== existing.paymentId) {
        if (payment && payment.id !== existing.paymentId) {
          throw this.ambiguousRefundConflict(
            'ambiguous_refund_correlation: refund ref bound to a different payment',
          );
        }
        payment = await this.prisma.payment.findUnique({
          where: { id: existing.paymentId },
        });
      }
      if (payment) {
        assertPaymentIntentMatches(payment, false);
      }
      if (existing.amountCents !== amountCents) {
        throw this.ambiguousRefundConflict(
          'ambiguous_refund_correlation: refund amount mismatch for bound providerRefundRef',
        );
      }
      await this.applyProviderRefundOutcome(
        existing,
        providerRefundRef,
        refundOutcome,
      );
      return existing.paymentId;
    }

    if (!payment) {
      return null;
    }
    assertPaymentIntentMatches(payment, true);
    const listedCurrency =
      typeof obj.currency === 'string' ? obj.currency.toUpperCase() : null;
    if (listedCurrency && listedCurrency !== payment.currency.toUpperCase()) {
      throw this.ambiguousRefundConflict(
        'ambiguous_refund_correlation: refund currency does not match payment',
      );
    }

    const paymentId = payment.id;
    const paymentOrderId = payment.orderId;
    let target: Refund;
    try {
      target = await this.prisma.$transaction(async (tx): Promise<Refund> => {
        await this.lockPayment(tx, paymentId);

        const raced = await tx.refund.findFirst({
          where: { providerRefundRef },
        });
        if (raced) {
          if (
            raced.paymentId !== paymentId ||
            raced.amountCents !== amountCents
          ) {
            throw this.ambiguousRefundConflict(
              'ambiguous_refund_correlation: raced refund ref mismatch',
            );
          }
          return raced;
        }

        const locked = await tx.payment.findUniqueOrThrow({
          where: { id: paymentId },
        });
        const inFlightStaff = await tx.refund.findMany({
          where: {
            paymentId,
            status: RefundStatus.PENDING,
            providerRefundRef: null,
          },
          orderBy: { createdAt: 'asc' },
        });

        if (inFlightStaff.length > 0) {
          const sameAmount = inFlightStaff.filter(
            (r) => r.amountCents === amountCents,
          );
          if (inFlightStaff.length === 1 && sameAmount.length === 1) {
            // Single confident correlation: reuse the staff row (never create a duplicate).
            const bound = await tx.refund.updateMany({
              where: {
                id: sameAmount[0].id,
                paymentId,
                status: RefundStatus.PENDING,
                providerRefundRef: null,
              },
              data: { providerRefundRef },
            });
            if (bound.count !== 1) {
              throw this.ambiguousRefundConflict(
                'ambiguous_refund_correlation: staff refund changed during correlation',
              );
            }
            return tx.refund.findUniqueOrThrow({
              where: { id: sameAmount[0].id },
            });
          }
          throw this.ambiguousRefundConflict(
            'in_flight_staff_refund: ambiguous_refund_correlation — staff refund(s) awaiting provider ref cannot be confidently matched',
          );
        }

        if (locked.lifecycleState === PaymentLifecycleState.REFUND_PENDING) {
          const trackedPending = await tx.refund.count({
            where: { paymentId, status: RefundStatus.PENDING },
          });
          if (trackedPending === 0) {
            throw this.ambiguousRefundConflict(
              'in_flight_staff_refund: payment is REFUND_PENDING without a correlatable refund row',
            );
          }
        }

        return tx.refund.create({
          data: {
            paymentId,
            orderId: paymentOrderId,
            amountCents,
            status: RefundStatus.PENDING,
            providerRefundRef,
            reason: `webhook:${envelope.providerEventId}`,
            idempotencyKey: `stripe_refund:${providerRefundRef}`,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Concurrent writer won the unique constraint: verify before finalizing.
        const winner = await this.prisma.refund.findFirst({
          where: {
            OR: [
              { providerRefundRef },
              { idempotencyKey: `stripe_refund:${providerRefundRef}` },
            ],
          },
        });
        if (
          !winner ||
          winner.paymentId !== paymentId ||
          winner.amountCents !== amountCents ||
          (winner.providerRefundRef != null &&
            winner.providerRefundRef !== providerRefundRef)
        ) {
          throw this.ambiguousRefundConflict(
            'ambiguous_refund_correlation: unique conflict with a non-matching refund row',
          );
        }
        target = winner;
      } else {
        throw error;
      }
    }

    await this.applyProviderRefundOutcome(
      target,
      providerRefundRef,
      refundOutcome,
    );
    return paymentId;
  }

  private ambiguousRefundConflict(message: string): ConflictException {
    return new ConflictException({
      code: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
      message,
    });
  }

  private classifyProviderRefundStatus(
    status: string | null | undefined,
  ): 'succeeded' | 'failed' | 'pending' {
    const normalized = (status ?? '').toLowerCase();
    if (normalized === 'succeeded') {
      return 'succeeded';
    }
    if (normalized === 'failed' || normalized === 'canceled') {
      return 'failed';
    }
    return 'pending';
  }

  /**
   * Monotonic finalize after correlation. Envelope status is a hint only —
   * FAILED release requires retrieve CONFIRMED_FAILURE + allow-listed errorCode
   * (Phase 6G R1). Retrieve happens outside locks; finalizers re-lock.
   */
  private async applyProviderRefundOutcome(
    refund: Refund,
    providerRefundRef: string,
    outcome: 'succeeded' | 'failed' | 'pending',
  ): Promise<void> {
    if (outcome === 'pending') {
      return;
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: refund.paymentId },
    });

    let retrieved: GatewayRetrieveResult | null = null;
    if (this.gateway.retrieveRefund) {
      try {
        retrieved = await this.gateway.retrieveRefund({
          providerPaymentRef: payment?.providerPaymentRef,
          providerCaptureRef: payment?.providerCaptureRef,
          providerRefundRef,
          idempotencyKey: refund.idempotencyKey,
          operation: 'refund',
        });
      } catch {
        retrieved = null;
      }
    }

    const fresh = await this.prisma.refund.findUniqueOrThrow({
      where: { id: refund.id },
    });

    const retrieveSucceeded =
      !!retrieved &&
      retrieved.outcomeClass === 'SUCCESS' &&
      (retrieved.lifecycleHint === undefined ||
        retrieved.lifecycleHint === 'REFUNDED');
    const retrieveFailed =
      !!retrieved &&
      retrieved.outcomeClass === 'CONFIRMED_FAILURE' &&
      (retrieved.lifecycleHint === undefined ||
        retrieved.lifecycleHint === 'REFUND_FAILED');

    if (retrieveSucceeded) {
      if (fresh.status === RefundStatus.PENDING) {
        await this.finalizeRefundSuccess(fresh.id, providerRefundRef);
        await this.notifyRefundSucceededIfNeeded(fresh.id);
      } else if (fresh.status === RefundStatus.SUCCEEDED) {
        // Recovery: finalize already committed but OrderActivity may be missing.
        await this.notifyRefundSucceededIfNeeded(fresh.id);
      } else if (fresh.status === RefundStatus.FAILED) {
        this.logger.error(
          `Provider refund ${providerRefundRef} succeeded but local refund ${fresh.id} is FAILED; manual review`,
        );
      }
      return;
    }

    if (retrieveFailed) {
      const canceled =
        (retrieved?.providerStatusRaw ?? '').toLowerCase() === 'canceled';
      const code = canceled
        ? ErrorCodes.PAY_REFUND_PROVIDER_CANCELED
        : ErrorCodes.PAY_REFUND_PROVIDER_FAILED;
      if (fresh.status === RefundStatus.PENDING) {
        await this.finalizeRefundFailure(fresh.id, code);
      } else if (fresh.status === RefundStatus.SUCCEEDED) {
        this.logger.error(
          `Provider refund ${providerRefundRef} failed but local refund ${fresh.id} is SUCCEEDED; manual review`,
        );
      }
      return;
    }

    // FAILED must never release without CONFIRMED_FAILURE retrieve.
    // Already-terminal local rows: ignore contradictory envelope (no release).
    if (outcome === 'failed') {
      if (fresh.status === RefundStatus.SUCCEEDED) {
        this.logger.error(
          `Provider refund ${providerRefundRef} reported failed after local SUCCEEDED without retrieve confirm; reservation kept as SUCCEEDED; manual review`,
        );
        return;
      }
      if (fresh.status === RefundStatus.FAILED) {
        return;
      }
      this.logger.warn(
        `${PaymentLogCodes.REFUND_INCONCLUSIVE} cannot confirm failure for ${providerRefundRef}; reservation kept`,
      );
      throw this.retryableConflict(
        `refund_provider_inconclusive: cannot confirm failure for ${providerRefundRef}; reservation kept`,
      );
    }

    // Succeeded hint + inconclusive retrieve: finalize only when the unique
    // providerRefundRef is already bound on a PENDING row (correlation done).
    if (
      outcome === 'succeeded' &&
      fresh.status === RefundStatus.PENDING &&
      fresh.providerRefundRef === providerRefundRef
    ) {
      await this.finalizeRefundSuccess(fresh.id, providerRefundRef);
      await this.notifyRefundSucceededIfNeeded(fresh.id);
      return;
    }
    if (
      outcome === 'succeeded' &&
      fresh.status === RefundStatus.SUCCEEDED &&
      fresh.providerRefundRef === providerRefundRef
    ) {
      await this.notifyRefundSucceededIfNeeded(fresh.id);
      return;
    }

    throw this.retryableConflict(
      `refund_provider_inconclusive: cannot confirm ${providerRefundRef}; retry later`,
    );
  }

  // ---------------------------------------------------------------------------
  // Reconcile (Phase 6F) — public APIs for worker / staff triggers
  // ---------------------------------------------------------------------------

  /**
   * Reconcile one payment against the provider. Terminal states are never reopened;
   * renewal-owned payments are retrieve-only (`deferred_renewal*`). Unresolved
   * non-terminal rows are deferred with durable exponential backoff.
   */
  async reconcilePaymentById(
    paymentId: string,
  ): Promise<{ outcome: string; paymentId: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      return { outcome: 'not_found', paymentId };
    }
    const outcome = await this.reconcileOnePayment(payment);
    return { outcome, paymentId };
  }

  /**
   * Reconcile stuck PENDING_AUTHORIZATION / CAPTURE_PENDING / REFUND_PENDING payments
   * (and payments with PENDING refunds) whose durable backoff allows another try.
   * Bounded concurrency (≤ 5); per-payment failures never abort the batch.
   */
  async reconcileStuckBatch(input: {
    limit?: number;
    olderThanSeconds?: number;
  }): Promise<{
    processed: number;
    results: Array<{ paymentId: string; outcome: string }>;
  }> {
    const rawLimit = input.limit ?? RECONCILE_DEFAULT_LIMIT;
    const limit = Math.min(
      Math.max(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 1, 1),
      RECONCILE_MAX_LIMIT,
    );
    const rawOlder =
      input.olderThanSeconds ?? RECONCILE_DEFAULT_OLDER_THAN_SECONDS;
    const olderThanSeconds = Number.isFinite(rawOlder)
      ? Math.max(rawOlder, 0)
      : RECONCILE_DEFAULT_OLDER_THAN_SECONDS;
    const nowMs = Date.now();
    const cutoff = new Date(nowMs - olderThanSeconds * 1000);

    // Over-fetch: rows still inside their durable backoff window are skipped below.
    const candidates = await this.prisma.payment.findMany({
      where: {
        updatedAt: { lt: cutoff },
        OR: [
          {
            lifecycleState: {
              in: [
                PaymentLifecycleState.PENDING_AUTHORIZATION,
                PaymentLifecycleState.CAPTURE_PENDING,
                PaymentLifecycleState.REFUND_PENDING,
              ],
            },
          },
          { refunds: { some: { status: RefundStatus.PENDING } } },
        ],
      },
      orderBy: { updatedAt: 'asc' },
      take: Math.min(limit * 4, RECONCILE_MAX_LIMIT * 4),
    });

    const selected = candidates
      .filter((p) => {
        const defer = this.parseReconcileDefer(p.lastErrorCode);
        return !defer || defer.nextAtMs <= nowMs;
      })
      .slice(0, limit);

    const results: Array<{ paymentId: string; outcome: string }> = [];
    let cursor = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor++;
        if (index >= selected.length) {
          return;
        }
        const payment = selected[index];
        try {
          results[index] = {
            paymentId: payment.id,
            outcome: await this.reconcileOnePayment(payment),
          };
        } catch (error) {
          this.logger.warn(
            `reconcile failed for payment ${payment.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          results[index] = { paymentId: payment.id, outcome: 'error' };
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(RECONCILE_MAX_CONCURRENCY, selected.length) },
        () => worker(),
      ),
    );

    return { processed: results.length, results };
  }

  private async reconcileOnePayment(payment: Payment): Promise<string> {
    const pendingRefunds = await this.prisma.refund.findMany({
      where: { paymentId: payment.id, status: RefundStatus.PENDING },
    });
    const stuckLifecycle =
      payment.lifecycleState === PaymentLifecycleState.PENDING_AUTHORIZATION ||
      payment.lifecycleState === PaymentLifecycleState.CAPTURE_PENDING ||
      payment.lifecycleState === PaymentLifecycleState.REFUND_PENDING;

    // Recovery: SUCCEEDED refunds may lack OrderActivity if notify failed after
    // finalize. Idempotent handlers make this safe to retry on every reconcile.
    const succeededRefunds = await this.prisma.refund.findMany({
      where: { paymentId: payment.id, status: RefundStatus.SUCCEEDED },
      select: { id: true },
    });
    for (const row of succeededRefunds) {
      try {
        await this.notifyRefundSucceededIfNeeded(row.id);
      } catch (error) {
        this.logger.warn(
          `refund activity notify failed for ${row.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        if (!stuckLifecycle && pendingRefunds.length === 0) {
          await this.deferReconcile(payment);
          return 'error';
        }
      }
    }

    // Terminal (or otherwise not stuck): never reopened.
    if (!stuckLifecycle && pendingRefunds.length === 0) {
      await this.clearReconcileDefer(payment);
      return 'noop_terminal';
    }

    // Renewal-owned: retrieve-only, no lifecycle/money mutation from reconcile.
    const renewal = await this.isRenewalOwnedPayment(payment);
    if (renewal.owned) {
      if (!renewal.leaseHeld) {
        await this.retrieveOnlyForRenewal(payment);
      }
      await this.deferReconcile(payment);
      return renewal.leaseHeld
        ? 'deferred_renewal_lease_held'
        : 'deferred_renewal';
    }

    const before = payment.lifecycleState;
    try {
      if (before === PaymentLifecycleState.PENDING_AUTHORIZATION) {
        if (payment.providerPaymentRef) {
          await this.reconcileAuthorization(payment);
        } else {
          await this.recoverAuthorizeWithoutRef(payment);
        }
      } else if (before === PaymentLifecycleState.CAPTURE_PENDING) {
        await this.reconcileCapture(payment);
      }
      for (const refund of pendingRefunds) {
        await this.reconcileRefundAndNotify(refund);
      }
    } catch (error) {
      this.logger.warn(
        `reconcile step failed for payment ${payment.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      const stale = await this.prisma.payment.findUnique({
        where: { id: payment.id },
      });
      await this.deferReconcile(stale ?? payment);
      return 'error';
    }

    const fresh = await this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    const pendingAfter = await this.prisma.refund.count({
      where: { paymentId: payment.id, status: RefundStatus.PENDING },
    });

    if (
      fresh.lifecycleState === before &&
      pendingAfter >= pendingRefunds.length
    ) {
      await this.deferReconcile(fresh);
      if (
        before === PaymentLifecycleState.REFUND_PENDING &&
        pendingRefunds.length === 0
      ) {
        return 'refund_pending_without_refund';
      }
      if (
        before === PaymentLifecycleState.PENDING_AUTHORIZATION &&
        fresh.providerStatusRaw === 'requires_action'
      ) {
        return 'pending_action';
      }
      return 'pending';
    }

    await this.clearReconcileDefer(fresh);
    if (fresh.lifecycleState === before) {
      return 'refund_reconciled';
    }
    switch (fresh.lifecycleState) {
      case PaymentLifecycleState.AUTHORIZED:
        return 'authorized';
      case PaymentLifecycleState.AUTHORIZATION_FAILED:
        return 'authorization_failed';
      case PaymentLifecycleState.CAPTURED:
        return before === PaymentLifecycleState.REFUND_PENDING
          ? 'refund_reconciled'
          : 'captured';
      case PaymentLifecycleState.CAPTURE_FAILED:
        return 'capture_failed';
      case PaymentLifecycleState.REFUNDED:
        return 'refunded';
      case PaymentLifecycleState.VOIDED:
        return 'voided';
      default:
        return 'progressed';
    }
  }

  /**
   * Renewal-owned = purpose RENEWAL or referenced by a SubscriptionRenewalAttempt.
   * leaseHeld = a referencing attempt has a live claimToken + leaseExpiresAt > now.
   */
  private async isRenewalOwnedPayment(
    payment: Pick<Payment, 'id' | 'purpose'>,
  ): Promise<{ owned: boolean; leaseHeld: boolean }> {
    const attempts = await this.prisma.subscriptionRenewalAttempt.findMany({
      where: { paymentId: payment.id },
      select: { claimToken: true, leaseExpiresAt: true },
    });
    const now = Date.now();
    const leaseHeld = attempts.some(
      (a) =>
        a.claimToken != null &&
        a.leaseExpiresAt != null &&
        a.leaseExpiresAt.getTime() > now,
    );
    return {
      owned: payment.purpose === PaymentPurpose.RENEWAL || attempts.length > 0,
      leaseHeld,
    };
  }

  /** Observe provider state for a renewal-owned payment without persisting anything. */
  private async retrieveOnlyForRenewal(payment: Payment): Promise<void> {
    try {
      if (
        payment.lifecycleState ===
          PaymentLifecycleState.PENDING_AUTHORIZATION &&
        this.gateway.retrieveAuthorization
      ) {
        const r = await this.gateway.retrieveAuthorization({
          providerPaymentRef: payment.providerPaymentRef,
          providerAuthorizationRef: payment.providerAuthorizationRef,
          idempotencyKey: payment.idempotencyKey,
          operation: 'authorization',
        });
        this.logger.debug(
          `renewal payment ${payment.id} provider=${r.providerStatusRaw ?? r.outcomeClass} (retrieve-only)`,
        );
      } else if (
        payment.lifecycleState === PaymentLifecycleState.CAPTURE_PENDING &&
        this.gateway.retrieveCapture
      ) {
        const r = await this.gateway.retrieveCapture({
          providerPaymentRef: payment.providerPaymentRef,
          providerAuthorizationRef: payment.providerAuthorizationRef,
          providerCaptureRef: payment.providerCaptureRef,
          idempotencyKey: payment.idempotencyKey,
          operation: 'capture',
        });
        this.logger.debug(
          `renewal payment ${payment.id} provider=${r.providerStatusRaw ?? r.outcomeClass} (retrieve-only)`,
        );
      }
    } catch {
      // retrieve-only is best-effort
    }
  }

  /** `RECONCILE_DEFER|{epochMs}|{attempt}|{originalCode?}` */
  private parseReconcileDefer(
    code: string | null | undefined,
  ): { nextAtMs: number; attempt: number; original: string | null } | null {
    if (!code || !code.startsWith(RECONCILE_DEFER_PREFIX)) {
      return null;
    }
    const parts = code.split('|');
    const nextAtMs = Number(parts[1]);
    const attempt = Number(parts[2]);
    if (!Number.isFinite(nextAtMs) || !Number.isFinite(attempt)) {
      return null;
    }
    const original = parts.slice(3).join('|');
    return { nextAtMs, attempt, original: original || null };
  }

  /** Write the next exponential-backoff eligibility into lastErrorCode (non-terminal only). */
  private async deferReconcile(payment: Payment): Promise<void> {
    const parsed = this.parseReconcileDefer(payment.lastErrorCode);
    const attempt = (parsed?.attempt ?? 0) + 1;
    const delayMs = Math.min(
      RECONCILE_BACKOFF_BASE_MS * 2 ** (attempt - 1),
      RECONCILE_BACKOFF_MAX_MS,
    );
    const original = parsed ? parsed.original : (payment.lastErrorCode ?? null);
    const marker = `${RECONCILE_DEFER_PREFIX}${Date.now() + delayMs}|${attempt}|${original ?? ''}`;
    await this.prisma.payment.updateMany({
      where: { id: payment.id, lifecycleState: payment.lifecycleState },
      data: { lastErrorCode: marker },
    });
  }

  /** Remove the defer marker, restoring any original error code. */
  private async clearReconcileDefer(payment: Payment): Promise<void> {
    const parsed = this.parseReconcileDefer(payment.lastErrorCode);
    if (!parsed) {
      return;
    }
    await this.prisma.payment.updateMany({
      where: { id: payment.id, lastErrorCode: payment.lastErrorCode },
      data: { lastErrorCode: parsed.original },
    });
  }

  /** Hide the internal defer marker from API consumers. */
  private publicLastErrorCode(code: string | null): string | null {
    const parsed = this.parseReconcileDefer(code);
    return parsed ? parsed.original : code;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async lockPayment(
    tx: Prisma.TransactionClient,
    paymentId: string,
  ): Promise<void> {
    await tx.$executeRaw`
      SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE
    `;
  }

  private async lockOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    await tx.$executeRaw`
      SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE
    `;
  }

  /** Convert thrown gateway errors into an unknown-outcome result. */
  private async callGateway<T extends { success: boolean }>(
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      return {
        success: false,
        outcomeClass: 'NETWORK_UNKNOWN',
        errorCode: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        errorMessage:
          error instanceof Error
            ? error.message
            : 'Payment gateway call failed',
      } as unknown as T;
    }
  }

  private assertRefundIdempotencyReplay(
    existing: {
      paymentId: string;
      amountCents: number;
      reason: string | null;
      actorUserId: string | null;
    },
    input: {
      paymentId: string;
      amountCents: number;
      reason: string;
      actorUserId?: string | null;
    },
  ): void {
    if (
      existing.paymentId !== input.paymentId ||
      existing.amountCents !== input.amountCents ||
      (existing.reason ?? '') !== input.reason.trim() ||
      (existing.actorUserId ?? null) !== (input.actorUserId ?? null)
    ) {
      throw new ConflictException({
        code: ErrorCodes.PAY_IDEMPOTENCY_CONFLICT,
        message: 'Refund idempotency key replay with mismatched body',
      });
    }
  }

  private async emitOrderRefs(
    orderId: string,
    paymentId: string,
    paymentStatusSummary: PaymentOutcomeSummary['paymentStatusSummary'],
    paymentIntentId: string | null | undefined,
  ): Promise<void> {
    if (this.handlers.onOrderPaymentRefs) {
      await this.handlers.onOrderPaymentRefs({
        orderId,
        paymentId,
        paymentStatusSummary,
        paymentIntentId: paymentIntentId ?? null,
      });
    }
  }

  private async emitSubscriptionSnapshot(
    subscriptionId: string,
    paymentId: string,
    paymentStatusSummary: PaymentOutcomeSummary['paymentStatusSummary'],
  ): Promise<void> {
    if (this.handlers.onSubscriptionPaymentSnapshot) {
      await this.handlers.onSubscriptionPaymentSnapshot({
        subscriptionId,
        paymentId,
        paymentStatusSummary,
      });
    }
  }
}
