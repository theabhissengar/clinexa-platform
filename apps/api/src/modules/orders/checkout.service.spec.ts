import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  OrderStatus,
  OrderType,
  PaymentLifecycleState,
  PaymentStatus,
} from '../../../generated/prisma';

import { CheckoutService } from './checkout.service';

describe('CheckoutService', () => {
  const userId = '11111111-1111-1111-1111-111111111111';
  const orderId = '22222222-2222-2222-2222-222222222222';

  function build(overrides?: {
    createOrder?: jest.Mock;
    authorizeForOrder?: jest.Mock;
    advance?: jest.Mock;
    getLatest?: jest.Mock;
    isSafe?: jest.Mock;
  }) {
    const orders = {
      createOrder:
        overrides?.createOrder ??
        jest.fn().mockResolvedValue({
          id: orderId,
          patientUserId: userId,
          status: OrderStatus.PAYMENT_PENDING,
          totalCents: 1000,
          currency: 'USD',
          isRxOrder: false,
          orderType: OrderType.ONE_TIME,
          subscriptionId: null,
        }),
      advanceAfterConfirmedAuthorization:
        overrides?.advance ??
        jest
          .fn()
          .mockImplementation(
            ({
              order,
              auth,
            }: {
              order: { status: OrderStatus };
              auth: unknown;
            }) =>
              Promise.resolve({
                order: { ...order, status: OrderStatus.AWAITING_FULFILLMENT },
                auth,
                transitioned: true,
              }),
          ),
      transitionOrder: jest.fn(),
    };
    const payments = {
      authorizeForOrder:
        overrides?.authorizeForOrder ??
        jest.fn().mockResolvedValue({
          paymentId: 'pay-1',
          status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
          lifecycleState: PaymentLifecycleState.AUTHORIZED,
          paymentStatusSummary: 'authorized_or_captured',
          requiresAction: false,
        }),
      getLatestPaymentLifecycleForOrder:
        overrides?.getLatest ?? jest.fn().mockResolvedValue(null),
      isSafeForNewAuthorization:
        overrides?.isSafe ?? jest.fn().mockReturnValue(true),
      capturePayment: jest.fn(),
      reconcileCustomerPaymentAction: jest.fn(),
      voidOrRefundForOrder: jest.fn(),
    };
    const prisma = {
      order: { findUnique: jest.fn() },
      payment: { findUnique: jest.fn() },
    };
    const service = new CheckoutService(
      prisma as never,
      orders as never,
      payments as never,
    );
    return { service, orders, payments, prisma };
  }

  it('checkouts with store catalog flags and returns non-secret success', async () => {
    const { service, orders, payments } = build();
    const result = await service.checkout(
      userId,
      {
        lines: [
          { variantId: '33333333-3333-3333-3333-333333333333', quantity: 1 },
        ],
        shippingAddress: { line1: '1 Main', city: 'Austin' },
        billingAddress: { line1: '1 Main', city: 'Austin' },
        paymentMethodId: '44444444-4444-4444-4444-444444444444',
      },
      'client-key-1',
    );

    expect(orders.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        requireStoreCatalog: true,
        initialStatus: OrderStatus.PAYMENT_PENDING,
        orderType: OrderType.ONE_TIME,
      }),
    );
    expect(payments.authorizeForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ includeCustomerAction: true }),
    );
    expect(result.requiresAction).toBe(false);
    expect(result.clientSecret).toBeUndefined();
    expect(result.orderStatus).toBe(OrderStatus.AWAITING_FULFILLMENT);
  });

  it('returns clientSecret only on ACTION_REQUIRED and does not advance', async () => {
    const { service, orders } = build({
      authorizeForOrder: jest.fn().mockResolvedValue({
        paymentId: 'pay-1',
        status: PaymentStatus.PENDING,
        lifecycleState: PaymentLifecycleState.PENDING_AUTHORIZATION,
        paymentStatusSummary: 'pending',
        requiresAction: true,
        clientSecret: 'pi_secret_test',
      }),
      advance: jest
        .fn()
        .mockImplementation(
          ({ order, auth }: { order: unknown; auth: unknown }) =>
            Promise.resolve({
              order,
              auth,
              transitioned: false,
            }),
        ),
    });

    const result = await service.checkout(
      userId,
      {
        lines: [
          { variantId: '33333333-3333-3333-3333-333333333333', quantity: 1 },
        ],
        shippingAddress: { line1: '1 Main', city: 'Austin' },
        billingAddress: { line1: '1 Main', city: 'Austin' },
        paymentMethodId: '44444444-4444-4444-4444-444444444444',
      },
      'client-key-sca',
    );

    expect(result.requiresAction).toBe(true);
    expect(result.clientSecret).toBe('pi_secret_test');
    expect(result.transitioned).toBe(false);
    expect(orders.advanceAfterConfirmedAuthorization).toHaveBeenCalled();
  });

  it('rejects paymentMethodId on zero-total checkout', async () => {
    const { service } = build({
      createOrder: jest.fn().mockResolvedValue({
        id: orderId,
        patientUserId: userId,
        status: OrderStatus.PAYMENT_PENDING,
        totalCents: 0,
        currency: 'USD',
        isRxOrder: false,
        orderType: OrderType.ONE_TIME,
        subscriptionId: null,
      }),
    });

    await expect(
      service.checkout(
        userId,
        {
          lines: [
            { variantId: '33333333-3333-3333-3333-333333333333', quantity: 1 },
          ],
          shippingAddress: { line1: '1 Main', city: 'Austin' },
          billingAddress: { line1: '1 Main', city: 'Austin' },
          paymentMethodId: '44444444-4444-4444-4444-444444444444',
        },
        'zero-key',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propagates fingerprint conflict from createOrder', async () => {
    const { service } = build({
      createOrder: jest.fn().mockRejectedValue(
        new ConflictException({
          code: 'ERR-ORD-CONFLICT',
          message: 'Order idempotency key replay with mismatched body',
        }),
      ),
    });

    await expect(
      service.checkout(
        userId,
        {
          lines: [
            { variantId: '33333333-3333-3333-3333-333333333333', quantity: 1 },
          ],
          shippingAddress: { line1: '1 Main', city: 'Austin' },
          billingAddress: { line1: '1 Main', city: 'Austin' },
          paymentMethodId: '44444444-4444-4444-4444-444444444444',
        },
        'dup-key',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
