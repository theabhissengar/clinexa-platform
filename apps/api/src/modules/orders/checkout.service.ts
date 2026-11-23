import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  OrderType,
  PaymentInitiator,
  PaymentLifecycleState,
  PaymentPurpose,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { assertIdempotencyKey } from '../payments/money';
import { PaymentsService } from '../payments/payments.service';
import type { CustomerActionAuthResult } from '../payments/payment.types';
import {
  checkoutAuthorizeIdempotencyKey,
  checkoutOrderIdempotencyKey,
  computeCheckoutRequestHash,
  reauthAuthorizeIdempotencyKey,
} from './checkout-fingerprint';
import {
  mapCustomerCheckoutResponse,
  type CustomerCheckoutResponse,
} from './customer-checkout-response';
import type { CheckoutRequestDto, PayOrderDto } from './dto/checkout.dto';
import { OrdersService } from './orders.service';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}

  async checkout(
    userId: string,
    dto: CheckoutRequestDto,
    rawIdempotencyKey: string | undefined,
  ): Promise<CustomerCheckoutResponse> {
    const clientKey = assertIdempotencyKey(rawIdempotencyKey);
    const paymentMethodId = dto.paymentMethodId?.trim() || null;
    const fingerprint = computeCheckoutRequestHash({
      userId,
      lines: dto.lines,
      shippingAddress: dto.shippingAddress,
      billingAddress: dto.billingAddress,
      paymentMethodId,
    });
    const orderKey = checkoutOrderIdempotencyKey(userId, clientKey);
    const authorizeKey = checkoutAuthorizeIdempotencyKey(userId, clientKey);

    const order = await this.orders.createOrder({
      patientUserId: userId,
      lines: dto.lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
      })),
      shippingAddress: dto.shippingAddress,
      billingAddress: dto.billingAddress,
      orderType: OrderType.ONE_TIME,
      initialStatus: OrderStatus.PAYMENT_PENDING,
      source: 'checkout',
      actorUserId: userId,
      idempotencyKey: orderKey,
      idempotencyRequestHash: fingerprint,
      requireStoreCatalog: true,
    });

    if (order.patientUserId !== userId) {
      throw new ForbiddenException({
        code: ErrorCodes.AUTHZ_OBJECT_SCOPE_DENIED,
        message: 'Not allowed to pay for this order',
      });
    }

    if (order.totalCents === 0) {
      if (paymentMethodId) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_INVALID_FORMAT,
          message: 'paymentMethodId must not be sent for zero-total checkout',
        });
      }
    } else if (!paymentMethodId) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_MISSING_FIELD,
        message: 'paymentMethodId is required for non-zero checkout',
      });
    }

    const auth = (await this.payments.authorizeForOrder({
      orderId: order.id,
      paymentMethodId,
      amountCents: order.totalCents,
      currency: order.currency,
      purpose: PaymentPurpose.CHECKOUT,
      initiator: PaymentInitiator.CHECKOUT,
      idempotencyKey: authorizeKey,
      includeCustomerAction: true,
    })) as CustomerActionAuthResult;

    const advanced = await this.orders.advanceAfterConfirmedAuthorization({
      order,
      auth,
      actorUserId: userId,
      source: 'checkout',
      reasonPrefix: 'checkout',
      voidOnInventoryFailure: true,
    });

    return mapCustomerCheckoutResponse({
      orderId: order.id,
      orderStatus: advanced.order.status,
      totalCents: order.totalCents,
      currency: order.currency,
      transitioned: advanced.transitioned,
      auth,
    });
  }

  async payOrder(
    userId: string,
    orderId: string,
    dto: PayOrderDto,
    rawIdempotencyKey: string | undefined,
  ): Promise<CustomerCheckoutResponse> {
    const clientKey = assertIdempotencyKey(rawIdempotencyKey);
    const order = await this.requireOwnedOrder(userId, orderId);
    const paymentMethodId = dto.paymentMethodId?.trim() || null;

    if (order.totalCents === 0) {
      if (paymentMethodId) {
        throw new BadRequestException({
          code: ErrorCodes.VAL_INVALID_FORMAT,
          message: 'paymentMethodId must not be sent for zero-total orders',
        });
      }
    } else if (!paymentMethodId) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_MISSING_FIELD,
        message: 'paymentMethodId is required',
      });
    }

    const latest = await this.payments.getLatestPaymentLifecycleForOrder(
      order.id,
    );

    const isPendingPay = order.status === OrderStatus.PAYMENT_PENDING;
    const isReauth =
      (order.status === OrderStatus.AWAITING_CLINICAL_REVIEW ||
        order.status === OrderStatus.CLINICAL_APPROVED ||
        order.status === OrderStatus.AWAITING_FULFILLMENT) &&
      this.payments.isSafeForNewAuthorization(latest) &&
      latest !== PaymentLifecycleState.CAPTURED;

    if (!isPendingPay && !isReauth) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_TRANSITION,
        message:
          'Order is not eligible for payment or reauthorization in its current state',
      });
    }

    if (
      order.status === OrderStatus.AWAITING_FULFILLMENT &&
      latest === PaymentLifecycleState.CAPTURED
    ) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_TRANSITION,
        message: 'Order payment is already captured',
      });
    }

    const authorizeKey = isPendingPay
      ? checkoutAuthorizeIdempotencyKey(userId, clientKey)
      : reauthAuthorizeIdempotencyKey(userId, order.id, clientKey);

    const auth = (await this.payments.authorizeForOrder({
      orderId: order.id,
      paymentMethodId,
      amountCents: order.totalCents,
      currency: order.currency,
      purpose: PaymentPurpose.CHECKOUT,
      initiator: PaymentInitiator.CHECKOUT,
      idempotencyKey: authorizeKey,
      includeCustomerAction: true,
    })) as CustomerActionAuthResult;

    if (isPendingPay) {
      const advanced = await this.orders.advanceAfterConfirmedAuthorization({
        order,
        auth,
        actorUserId: userId,
        source: 'checkout',
        reasonPrefix: 'checkout_pay',
        voidOnInventoryFailure: true,
      });
      return mapCustomerCheckoutResponse({
        orderId: order.id,
        orderStatus: advanced.order.status,
        totalCents: order.totalCents,
        currency: order.currency,
        transitioned: advanced.transitioned,
        auth,
      });
    }

    // Reauth after clinical: capture once on AUTHORIZED; do not re-run clinical.
    let transitioned = false;
    let orderStatus = order.status;
    if (
      auth.lifecycleState === PaymentLifecycleState.AUTHORIZED &&
      auth.paymentId &&
      !auth.requiresAction
    ) {
      const capture = await this.payments.capturePayment({
        paymentId: auth.paymentId,
        idempotencyKey: `capture:${order.id}:${auth.paymentId}`,
      });
      if (
        capture.lifecycleState === PaymentLifecycleState.CAPTURED &&
        order.status === OrderStatus.CLINICAL_APPROVED
      ) {
        const updated = await this.orders.transitionOrder({
          orderId: order.id,
          toStatus: OrderStatus.AWAITING_FULFILLMENT,
          actorUserId: userId,
          source: 'checkout',
          reason: 'reauth_captured',
          expectedStatus: OrderStatus.CLINICAL_APPROVED,
        });
        transitioned = true;
        orderStatus = updated.status;
      }
    }

    return mapCustomerCheckoutResponse({
      orderId: order.id,
      orderStatus,
      totalCents: order.totalCents,
      currency: order.currency,
      transitioned,
      auth,
    });
  }

  async reconcilePayment(
    userId: string,
    orderId: string,
    paymentId: string,
  ): Promise<CustomerCheckoutResponse> {
    const order = await this.requireOwnedOrder(userId, orderId);
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.orderId !== order.id) {
      throw new NotFoundException({
        code: ErrorCodes.RES_NOT_FOUND,
        message: 'Payment not found for order',
      });
    }

    const auth = await this.payments.reconcileCustomerPaymentAction(paymentId);

    let transitioned = false;
    let orderStatus = order.status;
    if (
      order.status === OrderStatus.PAYMENT_PENDING &&
      !auth.requiresAction &&
      (auth.lifecycleState === PaymentLifecycleState.AUTHORIZED ||
        auth.lifecycleState === PaymentLifecycleState.CAPTURED)
    ) {
      const advanced = await this.orders.advanceAfterConfirmedAuthorization({
        order,
        auth,
        actorUserId: userId,
        source: 'checkout',
        reasonPrefix: 'checkout_reconcile',
        voidOnInventoryFailure: true,
      });
      transitioned = advanced.transitioned;
      orderStatus = advanced.order.status;
    } else if (
      auth.lifecycleState === PaymentLifecycleState.AUTHORIZED &&
      auth.paymentId &&
      (order.status === OrderStatus.CLINICAL_APPROVED ||
        order.status === OrderStatus.AWAITING_FULFILLMENT)
    ) {
      const capture = await this.payments.capturePayment({
        paymentId: auth.paymentId,
        idempotencyKey: `capture:${order.id}:${auth.paymentId}`,
      });
      if (
        capture.lifecycleState === PaymentLifecycleState.CAPTURED &&
        order.status === OrderStatus.CLINICAL_APPROVED
      ) {
        const updated = await this.orders.transitionOrder({
          orderId: order.id,
          toStatus: OrderStatus.AWAITING_FULFILLMENT,
          actorUserId: userId,
          source: 'checkout',
          reason: 'reconcile_captured',
          expectedStatus: OrderStatus.CLINICAL_APPROVED,
        });
        transitioned = true;
        orderStatus = updated.status;
      }
    }

    return mapCustomerCheckoutResponse({
      orderId: order.id,
      orderStatus,
      totalCents: order.totalCents,
      currency: order.currency,
      transitioned,
      auth,
    });
  }

  async getOwnedOrder(userId: string, orderId: string) {
    const order = await this.requireOwnedOrder(userId, orderId);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalCents: order.totalCents,
      currency: order.currency,
      isRxOrder: order.isRxOrder,
      latestPaymentId: order.latestPaymentId,
      paymentStatusSummary: order.paymentStatusSummary,
      items: order.items.map((i) => ({
        variantId: i.variantId,
        productName: i.productName,
        quantity: i.quantity,
        lineTotalCents: i.lineTotalCents,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private async requireOwnedOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || order.deletedAt != null) {
      throw new NotFoundException({
        code: ErrorCodes.ORD_NOT_FOUND,
        message: 'Order not found',
      });
    }
    if (order.patientUserId !== userId) {
      throw new NotFoundException({
        code: ErrorCodes.ORD_NOT_FOUND,
        message: 'Order not found',
      });
    }
    return order;
  }
}
