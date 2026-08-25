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
  ) {}

  setOutcomeHandlers(handlers: PaymentOutcomeHandlers): void {
    this.handlers = handlers;
  }

  getProviderName(): string {
    return this.config.get<string>('payments.provider') ?? 'simulated';
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
