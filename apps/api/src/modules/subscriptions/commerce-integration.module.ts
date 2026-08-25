import { Module, OnModuleInit, forwardRef } from '@nestjs/common';

import { OrderStatus, OrderType } from '../../../generated/prisma';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';
import { RenewalAddressResolver } from './renewal-address.resolver';
import { SubscriptionsModule } from './subscriptions.module';
import { SubscriptionsRenewalProcessor } from './subscriptions-renewal.processor';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Composition root: wires Subscriptions ↔ Orders ↔ Payments side-effect hooks
 * without circular Nest imports inside domain service constructors.
 */
@Module({
  imports: [
    forwardRef(() => SubscriptionsModule),
    forwardRef(() => OrdersModule),
    forwardRef(() => PaymentsModule),
  ],
})
export class CommerceIntegrationModule implements OnModuleInit {
  constructor(
    private readonly payments: PaymentsService,
    private readonly orders: OrdersService,
    private readonly subscriptions: SubscriptionsService,
    private readonly processor: SubscriptionsRenewalProcessor,
    private readonly addresses: RenewalAddressResolver,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.subscriptions.setSideEffectHooks({
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
      // Inventory mutations are in-txn via OrderInventoryOrchestrator (P13e).
      // Do not register onInventory write path here — merge preserves any existing.
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
          source: 'payment',
        });
      },
      onClinicalDeclineHold: async (input) => {
        await this.processor.onClinicalDecline(input);
      },
    });
  }
}
