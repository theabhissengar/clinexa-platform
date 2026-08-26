import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  PaymentLifecycleState,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
  RefundStatus,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { PaymentGateway } from './payment.gateway';
import { PaymentProviderRegistry } from './payment-provider.registry';
import {
  PAYMENT_GATEWAY,
  type AuthorizeForOrderInput,
  type CapturePaymentInput,
  type PaymentOutcomeSummary,
  type VoidOrRefundInput,
  type WebhookEnvelope,
} from './payment.types';

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

@Injectable()
export class PaymentsService {
  private handlers: PaymentOutcomeHandlers = {};

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly registry: PaymentProviderRegistry,
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
    return this.prisma.savedPaymentMethod.create({
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

  async authorizeForOrder(
    input: AuthorizeForOrderInput,
  ): Promise<PaymentOutcomeSummary> {
    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (
        existing.orderId !== input.orderId ||
        existing.amountCents !== input.amountCents
      ) {
        throw new ConflictException({
          code: ErrorCodes.PAY_IDEMPOTENCY_CONFLICT,
          message: 'Payment idempotency key replay with mismatched body',
        });
      }
      return {
        paymentId: existing.id,
        status: existing.status,
        lifecycleState: existing.lifecycleState,
        paymentStatusSummary: toSummary(existing.status),
      };
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

    const purpose = input.purpose ?? PaymentPurpose.RENEWAL;
    const currency = input.currency ?? 'USD';
    const provider = this.getProviderName();

    let payment;
    try {
      payment = await this.prisma.payment.create({
        data: {
          orderId: input.orderId,
          subscriptionId: input.subscriptionId ?? null,
          savedPaymentMethodId: method.id,
          amountCents: input.amountCents,
          currency,
          status: PaymentStatus.PENDING,
          lifecycleState: PaymentLifecycleState.PENDING_AUTHORIZATION,
          purpose,
          provider,
          idempotencyKey: input.idempotencyKey,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.payment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (raced) {
          return {
            paymentId: raced.id,
            status: raced.status,
            lifecycleState: raced.lifecycleState,
            paymentStatusSummary: toSummary(raced.status),
          };
        }
      }
      throw error;
    }

    const gatewayResult = await this.gateway.authorize({
      amountCents: input.amountCents,
      currency,
      providerMethodRef: method.providerMethodRef,
      idempotencyKey: input.idempotencyKey,
      forceOutcome: input.forceOutcome,
    });

    if (!gatewayResult.success) {
      const failed = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          lifecycleState: PaymentLifecycleState.AUTHORIZATION_FAILED,
          lastErrorCode:
            gatewayResult.errorCode ?? ErrorCodes.PAY_AUTHORIZATION_FAILED,
        },
      });
      const summary = toSummary(failed.status);
      await this.emitOrderRefs(input.orderId, failed.id, summary, null);
      if (input.subscriptionId) {
        await this.emitSubscriptionSnapshot(
          input.subscriptionId,
          failed.id,
          summary,
        );
      }
      if (this.handlers.onRenewalAuthorizationFailed) {
        await this.handlers.onRenewalAuthorizationFailed({
          orderId: input.orderId,
          subscriptionId: input.subscriptionId ?? null,
          paymentId: failed.id,
          errorCode:
            gatewayResult.errorCode ?? ErrorCodes.PAY_AUTHORIZATION_FAILED,
        });
      }
      return {
        paymentId: failed.id,
        status: failed.status,
        lifecycleState: failed.lifecycleState,
        paymentStatusSummary: summary,
      };
    }

    const authorized = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
        lifecycleState: PaymentLifecycleState.AUTHORIZED,
        providerPaymentRef: gatewayResult.providerPaymentRef ?? null,
        providerAuthorizationRef:
          gatewayResult.providerAuthorizationRef ?? null,
      },
    });
    const summary = toSummary(authorized.status);
    await this.emitOrderRefs(
      input.orderId,
      authorized.id,
      summary,
      authorized.providerPaymentRef,
    );
    if (input.subscriptionId) {
      await this.emitSubscriptionSnapshot(
        input.subscriptionId,
        authorized.id,
        summary,
      );
    }
    return {
      paymentId: authorized.id,
      status: authorized.status,
      lifecycleState: authorized.lifecycleState,
      paymentStatusSummary: summary,
    };
  }

  async capturePayment(
    input: CapturePaymentInput,
  ): Promise<PaymentOutcomeSummary> {
    const payment = await this.prisma.payment.findUnique({
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
      return {
        paymentId: payment.id,
        status: payment.status,
        lifecycleState: payment.lifecycleState,
        paymentStatusSummary: toSummary(payment.status),
      };
    }

    if (
      !payment.providerPaymentRef ||
      !payment.providerAuthorizationRef ||
      payment.lifecycleState === PaymentLifecycleState.AUTHORIZATION_FAILED ||
      payment.lifecycleState === PaymentLifecycleState.VOIDED ||
      payment.status === PaymentStatus.FAILED
    ) {
      throw new BadRequestException({
        code: ErrorCodes.PAY_REFUND_INELIGIBLE,
        message: 'Payment is not eligible for capture',
      });
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { lifecycleState: PaymentLifecycleState.CAPTURE_PENDING },
    });

    const result = await this.gateway.capture({
      providerPaymentRef: payment.providerPaymentRef,
      providerAuthorizationRef: payment.providerAuthorizationRef,
      amountCents: payment.amountCents,
      idempotencyKey: input.idempotencyKey,
      forceOutcome: input.forceOutcome,
    });

    if (!result.success) {
      const failed = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          lifecycleState: PaymentLifecycleState.CAPTURE_FAILED,
          lastErrorCode:
            result.errorCode ?? ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
        },
      });
      return {
        paymentId: failed.id,
        status: failed.status,
        lifecycleState: failed.lifecycleState,
        paymentStatusSummary: toSummary(failed.status),
      };
    }

    const captured = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
        lifecycleState: PaymentLifecycleState.CAPTURED,
        providerCaptureRef: result.providerCaptureRef ?? null,
        lastErrorCode: null,
      },
    });
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
    return {
      paymentId: captured.id,
      status: captured.status,
      lifecycleState: captured.lifecycleState,
      paymentStatusSummary: summary,
    };
  }

  async voidOrRefundForOrder(input: VoidOrRefundInput): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId: input.orderId },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) {
      return;
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
        return;
      }
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { lifecycleState: PaymentLifecycleState.REFUND_PENDING },
      });
      const refundResult = await this.gateway.refund({
        providerPaymentRef: payment.providerPaymentRef,
        providerCaptureRef: payment.providerCaptureRef,
        amountCents: payment.amountCents,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
      });
      if (!refundResult.success) {
        throw new BadRequestException({
          code: ErrorCodes.PAY_REFUND_INELIGIBLE,
          message: refundResult.errorMessage ?? 'Refund failed',
        });
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.refund.create({
          data: {
            paymentId: payment.id,
            orderId: payment.orderId,
            amountCents: payment.amountCents,
            status: RefundStatus.SUCCEEDED,
            providerRefundRef: refundResult.providerRefundRef ?? null,
            reason: input.reason ?? null,
            actorUserId: input.actorUserId ?? null,
            idempotencyKey: input.idempotencyKey,
          },
        });
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.REFUNDED,
            lifecycleState: PaymentLifecycleState.REFUNDED,
          },
        });
      });
      const summary = toSummary(PaymentStatus.REFUNDED);
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
      return;
    }

    if (
      payment.lifecycleState === PaymentLifecycleState.AUTHORIZED ||
      payment.lifecycleState === PaymentLifecycleState.CAPTURE_FAILED ||
      payment.lifecycleState === PaymentLifecycleState.CAPTURE_PENDING
    ) {
      if (payment.providerPaymentRef && payment.providerAuthorizationRef) {
        await this.gateway.void({
          providerPaymentRef: payment.providerPaymentRef,
          providerAuthorizationRef: payment.providerAuthorizationRef,
          idempotencyKey: input.idempotencyKey,
        });
      }
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          lifecycleState: PaymentLifecycleState.VOIDED,
        },
      });
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
  }

  async cancelProviderRecurring(
    _subscriptionId: string,
    providerSubscriptionRef?: string | null,
  ): Promise<void> {
    if (!providerSubscriptionRef) {
      return;
    }
    await this.gateway.cancelRecurring({
      providerSubscriptionRef,
    });
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
      const payment = await this.findLatestForOrder(orderId);
      if (!payment) {
        return;
      }
      await this.capturePayment({
        paymentId: payment.id,
        idempotencyKey: `capture:${orderId}:${payment.id}`,
      });
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

    const succeededRefunded = payment.refunds
      .filter((r) => r.status === RefundStatus.SUCCEEDED)
      .reduce((sum, r) => sum + r.amountCents, 0);

    return {
      id: payment.id,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      purpose: payment.purpose,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: payment.status,
      lifecycleState: payment.lifecycleState,
      provider: payment.provider,
      providerPaymentRef: payment.providerPaymentRef,
      providerAuthorizationRef: payment.providerAuthorizationRef,
      providerCaptureRef: payment.providerCaptureRef,
      idempotencyKey: payment.idempotencyKey,
      lastErrorCode: payment.lastErrorCode,
      refundedCents: succeededRefunded,
      refundableCents: Math.max(0, payment.amountCents - succeededRefunded),
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
        actorUserId: r.actorUserId,
        providerRefundRef: r.providerRefundRef,
        createdAt: r.createdAt,
      })),
      webhookEvents: payment.webhookEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        providerEventId: e.providerEventId,
        appliedAt: e.appliedAt,
        createdAt: e.createdAt,
      })),
    };
  }

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
      return existing;
    }

    const refund = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM payments WHERE id = ${input.paymentId}::uuid FOR UPDATE
      `;

      const raced = await tx.refund.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (raced) {
        this.assertRefundIdempotencyReplay(raced, input);
        return raced;
      }

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
        payment.lifecycleState !== PaymentLifecycleState.CAPTURED ||
        !payment.providerPaymentRef ||
        !payment.providerCaptureRef
      ) {
        throw new BadRequestException({
          code: ErrorCodes.PAY_REFUND_INELIGIBLE,
          message: 'Payment is not eligible for refund',
        });
      }

      const consumed = await tx.refund.aggregate({
        where: {
          paymentId: payment.id,
          status: RefundStatus.SUCCEEDED,
        },
        _sum: { amountCents: true },
      });
      const alreadyRefunded = consumed._sum.amountCents ?? 0;
      if (alreadyRefunded + input.amountCents > payment.amountCents) {
        throw new BadRequestException({
          code: ErrorCodes.PAY_REFUND_INELIGIBLE,
          message: 'Refund exceeds remaining refundable amount',
        });
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: { lifecycleState: PaymentLifecycleState.REFUND_PENDING },
      });

      const gatewayResult = await this.gateway.refund({
        providerPaymentRef: payment.providerPaymentRef,
        providerCaptureRef: payment.providerCaptureRef,
        amountCents: input.amountCents,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
      });
      if (!gatewayResult.success) {
        await tx.refund.create({
          data: {
            paymentId: payment.id,
            orderId: payment.orderId,
            amountCents: input.amountCents,
            status: RefundStatus.FAILED,
            reason: input.reason,
            actorUserId: input.actorUserId ?? null,
            idempotencyKey: input.idempotencyKey,
          },
        });
        await tx.payment.update({
          where: { id: payment.id },
          data: { lifecycleState: PaymentLifecycleState.CAPTURED },
        });
        throw new BadRequestException({
          code: ErrorCodes.PAY_REFUND_INELIGIBLE,
          message: gatewayResult.errorMessage ?? 'Refund failed',
        });
      }

      const fullyRefunded =
        alreadyRefunded + input.amountCents === payment.amountCents;
      const created = await tx.refund.create({
        data: {
          paymentId: payment.id,
          orderId: payment.orderId,
          amountCents: input.amountCents,
          status: RefundStatus.SUCCEEDED,
          providerRefundRef: gatewayResult.providerRefundRef ?? null,
          reason: input.reason,
          actorUserId: input.actorUserId ?? null,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: fullyRefunded
          ? {
              status: PaymentStatus.REFUNDED,
              lifecycleState: PaymentLifecycleState.REFUNDED,
            }
          : { lifecycleState: PaymentLifecycleState.CAPTURED },
      });
      return created;
    });

    if (refund.status === RefundStatus.SUCCEEDED) {
      const payment = await this.prisma.payment.findUnique({
        where: { id: input.paymentId },
      });
      const agg = await this.prisma.refund.aggregate({
        where: {
          paymentId: input.paymentId,
          status: RefundStatus.SUCCEEDED,
        },
        _sum: { amountCents: true },
      });
      const refundedTotalCents = agg._sum.amountCents ?? 0;
      if (payment?.orderId && this.handlers.onRefundSucceeded) {
        await this.handlers.onRefundSucceeded({
          orderId: payment.orderId,
          paymentId: payment.id,
          refundId: refund.id,
          refundedTotalCents,
          paymentStatusSummary: toSummary(payment.status),
        });
      }
    }

    return refund;
  }

  async ingestWebhook(input: {
    secretHeader: string | undefined;
    envelope: WebhookEnvelope;
  }): Promise<{ accepted: true; duplicate: boolean }> {
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

    const provider = input.envelope.provider || this.getProviderName();
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(input.envelope))
      .digest('hex');

    try {
      await this.prisma.paymentWebhookEvent.create({
        data: {
          provider,
          providerEventId: input.envelope.providerEventId,
          eventType: input.envelope.type,
          payloadHash,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { accepted: true, duplicate: true };
      }
      throw error;
    }

    // Simulated webhook apply: if paymentRef provided, mark applied.
    let paymentId: string | null = null;
    if (input.envelope.paymentRef) {
      const payment = await this.findByProviderPaymentRef(
        input.envelope.paymentRef,
      );
      paymentId = payment?.id ?? null;
      if (payment && input.envelope.type === 'payment.captured') {
        await this.capturePayment({
          paymentId: payment.id,
          idempotencyKey: `webhook_capture:${input.envelope.providerEventId}`,
        });
      } else if (
        payment &&
        input.envelope.type === 'payment.authorization_failed'
      ) {
        if (
          payment.lifecycleState !==
            PaymentLifecycleState.AUTHORIZATION_FAILED &&
          payment.lifecycleState !== PaymentLifecycleState.VOIDED &&
          payment.lifecycleState !== PaymentLifecycleState.REFUNDED
        ) {
          const failed = await this.prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.FAILED,
              lifecycleState: PaymentLifecycleState.AUTHORIZATION_FAILED,
              lastErrorCode: ErrorCodes.PAY_AUTHORIZATION_FAILED,
            },
          });
          if (failed.orderId) {
            await this.emitOrderRefs(
              failed.orderId,
              failed.id,
              toSummary(failed.status),
              null,
            );
          }
        }
      } else if (payment && input.envelope.type === 'payment.refunded') {
        if (
          payment.lifecycleState === PaymentLifecycleState.CAPTURED &&
          payment.orderId
        ) {
          const consumed = await this.prisma.refund.aggregate({
            where: {
              paymentId: payment.id,
              status: RefundStatus.SUCCEEDED,
            },
            _sum: { amountCents: true },
          });
          const remaining =
            payment.amountCents - (consumed._sum.amountCents ?? 0);
          if (remaining > 0) {
            await this.initiateRefund({
              paymentId: payment.id,
              amountCents: remaining,
              reason: 'webhook_payment.refunded',
              actorUserId: null,
              idempotencyKey: `webhook_refund:${input.envelope.providerEventId}`,
            });
          }
        }
      } else if (payment && input.envelope.type === 'payment.voided') {
        if (payment.orderId) {
          await this.voidOrRefundForOrder({
            orderId: payment.orderId,
            reason: 'webhook_payment.voided',
            idempotencyKey: `webhook_void:${input.envelope.providerEventId}`,
          });
        }
      }
    }

    await this.prisma.paymentWebhookEvent.update({
      where: {
        provider_providerEventId: {
          provider,
          providerEventId: input.envelope.providerEventId,
        },
      },
      data: {
        paymentId,
        appliedAt: new Date(),
      },
    });

    return { accepted: true, duplicate: false };
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
