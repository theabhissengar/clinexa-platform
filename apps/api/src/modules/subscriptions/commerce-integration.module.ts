import { Module, OnModuleInit, forwardRef } from '@nestjs/common';

import { OrderStatus, OrderType } from '../../../generated/prisma';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ClinicalModule } from '../clinical/clinical.module';
import { ClinicalOutcomesService } from '../clinical/clinical-outcomes.service';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';
import { PromotionsModule } from '../promotions/promotions.module';
import { CouponsService } from '../promotions/coupons.service';
import { shouldSkipOpenOrderCancel } from './open-order-cancel.policy';
import { RenewalAddressResolver } from './renewal-address.resolver';
import type {
  CancelOpenOrdersRequest,
  InitialOrderRequest,
} from './subscription.types';
import { SubscriptionsModule } from './subscriptions.module';
import { SubscriptionsRenewalProcessor } from './subscriptions-renewal.processor';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Composition root: wires Subscriptions ↔ Orders ↔ Payments ↔ Clinical hooks
 * without circular Nest imports inside domain service constructors.
 */
@Module({
  imports: [
    forwardRef(() => SubscriptionsModule),
    forwardRef(() => OrdersModule),
    forwardRef(() => PaymentsModule),
    forwardRef(() => PromotionsModule),
    ClinicalModule,
  ],
})
export class CommerceIntegrationModule implements OnModuleInit {
  constructor(
    private readonly payments: PaymentsService,
    private readonly orders: OrdersService,
    private readonly subscriptions: SubscriptionsService,
    private readonly processor: SubscriptionsRenewalProcessor,
    private readonly addresses: RenewalAddressResolver,
    private readonly clinical: ClinicalOutcomesService,
    private readonly prisma: PrismaService,
    private readonly coupons: CouponsService,
  ) {}

  onModuleInit(): void {
    this.subscriptions.setSideEffectHooks({
      onPreflightInitialOrderAddresses: async (patientUserId) => {
        await this.addresses.resolveFromPatientUser(patientUserId);
      },
      onRequestInitialOrder: async (request) =>
        this.createInitialOrder(request),
      onRequestRenewalOrder: async (request) => {
        const addrs = await this.addresses.resolve(
          request.subscriptionId,
          request.patientUserId,
        );
        const sub = await this.prisma.subscription.findUnique({
          where: { id: request.subscriptionId },
        });
        const order = await this.orders.createOrderFromSnapshots({
          patientUserId: request.patientUserId,
          subscriptionId: request.subscriptionId,
          orderType: OrderType.SUBSCRIPTION_RENEWAL,
          lines: request.lines,
          shippingAddress: addrs.shipping,
          billingAddress: addrs.billing,
          customer: sub
            ? {
                firstName: sub.customerFirstName,
                lastName: sub.customerLastName,
                email: sub.customerEmail,
                phone: sub.customerPhone,
              }
            : undefined,
          initialStatus: OrderStatus.PAYMENT_PENDING,
          idempotencyKey: `renewal:${request.subscriptionId}:${request.billingPeriodKey}`,
          source: 'system',
        });
        return order.id;
      },
      onSubscriptionCancelled: async (request) =>
        this.cancelOpenOrders(request),
      onPayment: async (event, subscriptionId, providerSubscriptionRef) => {
        if (event === 'cancel_provider_recurring') {
          await this.payments.cancelProviderRecurring(
            subscriptionId,
            providerSubscriptionRef,
          );
        }
      },
    });

    this.orders.setSideEffectHooks({
      onPayment: async (event, orderId) => {
        await this.payments.handleOrderPaymentHook(event, orderId);
        // P14g: composition root owns subscription decline reaction (once).
        // Payments executes void/refund only — does not call clinical handlers.
        if (event === 'void_or_refund_required') {
          const order = await this.prisma.order.findUnique({
            where: { id: orderId },
          });
          if (
            order?.subscriptionId &&
            order.status === OrderStatus.CLINICAL_DECLINED
          ) {
            await this.processor.onClinicalDecline({
              orderId,
              subscriptionId: order.subscriptionId,
            });
          }
        }
      },
      onEnteredClinicalReview: async (orderId) => {
        await this.clinical.ensureOpaqueConsultationRef(orderId);
      },
      // Inventory mutations are in-txn via OrderInventoryOrchestrator (P13e).
    });

    this.payments.setOutcomeHandlers({
      onOrderPaymentRefs: async (input) => {
        await this.orders.recordPaymentRefs(input);
      },
      onSubscriptionPaymentSnapshot: async (input) => {
        await this.subscriptions.recordPaymentSnapshot({
          subscriptionId: input.subscriptionId,
          paymentStatusSummary: input.paymentStatusSummary,
          latestPaymentId: input.paymentId,
          source: 'payment',
        });
      },
      onRenewalCaptureSucceeded: async (input) => {
        if (!input.subscriptionId) {
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
        await this.processor.completeRenewalOnCapture({
          subscriptionId: input.subscriptionId,
          billingPeriodKey: attempt.billingPeriodKey,
          paymentId: input.paymentId,
          orderId: input.orderId,
          source: 'payment',
        });
      },
      onPaymentCaptured: async (input) => {
        if (!input.orderId) {
          return;
        }
        const result = await this.coupons.recordRedemption({
          orderId: input.orderId,
          paymentId: input.paymentId,
        });
        if (result.outcome === 'limit_exceeded') {
          await this.orders.recordCouponRedemptionFailure({
            orderId: result.orderId,
            couponId: result.couponId,
            paymentId: result.paymentId,
            errorCode: result.errorCode,
          });
        }
      },
      onRefundSucceeded: async (input) => {
        if (!input.orderId) {
          return;
        }
        await this.orders.recordRefundedTotal({
          orderId: input.orderId,
          refundedTotalCents: input.refundedTotalCents,
          paymentId: input.paymentId,
          refundId: input.refundId,
        });
      },
      // P14g: do not wire onClinicalDeclineHold — composition root owns decline.
    });
  }

  /** P3-SUB-001: SUBSCRIPTION_INITIAL DRAFT from snapshotted lines; no coupon. */
  private async createInitialOrder(
    request: InitialOrderRequest,
  ): Promise<string | null> {
    const addrs = await this.addresses.resolve(
      request.subscriptionId,
      request.patientUserId,
    );
    const order = await this.orders.createOrderFromSnapshots({
      patientUserId: request.patientUserId,
      subscriptionId: request.subscriptionId,
      orderType: OrderType.SUBSCRIPTION_INITIAL,
      lines: request.lines,
      shippingAddress: addrs.shipping,
      billingAddress: addrs.billing,
      customer: request.customer,
      initialStatus: OrderStatus.DRAFT,
      idempotencyKey: `initial:${request.subscriptionId}`,
      actorUserId: request.actorUserId ?? null,
      source: request.source,
    });
    return order.id;
  }

  /**
   * P3-SUB-002: cancel DRAFT / PAYMENT_PENDING INITIAL|RENEWAL orders.
   * Skip PAYMENT_PENDING when latest payment is CAPTURED / REFUND_PENDING / REFUNDED
   * (P14f: do not auto-refund captured payments).
   * Order transition failures are recorded and skipped — subscription cancel stands.
   */
  private async cancelOpenOrders(
    request: CancelOpenOrdersRequest,
  ): Promise<void> {
    const candidates = await this.prisma.order.findMany({
      where: {
        subscriptionId: request.subscriptionId,
        deletedAt: null,
        orderType: {
          in: [OrderType.SUBSCRIPTION_INITIAL, OrderType.SUBSCRIPTION_RENEWAL],
        },
        status: {
          in: [OrderStatus.DRAFT, OrderStatus.PAYMENT_PENDING],
        },
      },
      select: { id: true, status: true },
    });

    const cancelledIds: string[] = [];
    const skippedIds: string[] = [];
    const failedIds: string[] = [];

    for (const order of candidates) {
      const lifecycle =
        order.status === OrderStatus.PAYMENT_PENDING
          ? await this.payments.getLatestPaymentLifecycleForOrder(order.id)
          : null;
      if (shouldSkipOpenOrderCancel(order.status, lifecycle)) {
        skippedIds.push(order.id);
        continue;
      }

      try {
        await this.orders.transitionOrder({
          orderId: order.id,
          toStatus: OrderStatus.CANCELLED,
          actorUserId: request.actorUserId ?? null,
          source: request.source,
          reason: 'Subscription cancelled',
        });
        cancelledIds.push(order.id);
      } catch {
        failedIds.push(order.id);
      }
    }

    if (
      cancelledIds.length > 0 ||
      skippedIds.length > 0 ||
      failedIds.length > 0
    ) {
      await this.prisma.subscriptionActivity.create({
        data: {
          subscriptionId: request.subscriptionId,
          actorUserId: request.actorUserId ?? null,
          kind: 'open_orders_cancelled_on_sub_cancel',
          summary: `Cancelled ${cancelledIds.length} open order(s); skipped ${skippedIds.length} captured/refund payment order(s); failed ${failedIds.length}`,
          metadata: {
            cancelledOrderIds: cancelledIds,
            skippedOrderIds: skippedIds,
            failedOrderIds: failedIds,
            source: request.source,
          },
        },
      });
    }
  }
}
