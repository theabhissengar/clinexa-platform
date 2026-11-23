import {
  OrderStatus,
  OrderType,
  PaymentLifecycleState,
  PaymentStatus,
} from '../../../generated/prisma';

import { OrdersService } from './orders.service';

describe('OrdersService.advanceAfterConfirmedAuthorization', () => {
  function buildService(opts?: {
    transitionReject?: unknown;
    voidOrRefund?: jest.Mock;
  }) {
    const payments = {
      capturePayment: jest.fn().mockResolvedValue({
        lifecycleState: PaymentLifecycleState.CAPTURED,
      }),
      voidOrRefundForOrder:
        opts?.voidOrRefund ?? jest.fn().mockResolvedValue(undefined),
    };
    const service = Object.create(OrdersService.prototype) as OrdersService;
    Object.assign(service, {
      payments,
      transitionOrder: opts?.transitionReject
        ? jest.fn().mockRejectedValue(opts.transitionReject)
        : jest.fn().mockResolvedValue({
            id: 'ord-1',
            status: OrderStatus.AWAITING_CLINICAL_REVIEW,
          }),
    });
    return { service, payments };
  }

  it('does not advance on ACTION_REQUIRED / pending authorization', async () => {
    const { service, payments } = buildService();
    const order = {
      id: 'ord-1',
      status: OrderStatus.PAYMENT_PENDING,
      isRxOrder: true,
      totalCents: 1000,
      orderType: OrderType.ONE_TIME,
      subscriptionId: null,
    };
    const result = await service.advanceAfterConfirmedAuthorization({
      order,
      auth: {
        paymentId: 'pay-1',
        status: PaymentStatus.PENDING,
        lifecycleState: PaymentLifecycleState.PENDING_AUTHORIZATION,
        requiresAction: true,
      },
      actorUserId: 'u1',
      source: 'checkout',
      reasonPrefix: 'checkout',
      voidOnInventoryFailure: true,
    });
    expect(result.transitioned).toBe(false);
    expect(payments.voidOrRefundForOrder).not.toHaveBeenCalled();
  });

  it('voids ONE_TIME payment when inventory transition fails after auth', async () => {
    const err = new Error('INV_INSUFFICIENT');
    const { service, payments } = buildService({ transitionReject: err });
    const order = {
      id: 'ord-1',
      status: OrderStatus.PAYMENT_PENDING,
      isRxOrder: true,
      totalCents: 1000,
      orderType: OrderType.ONE_TIME,
      subscriptionId: null,
    };

    await expect(
      service.advanceAfterConfirmedAuthorization({
        order,
        auth: {
          paymentId: 'pay-1',
          status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
          lifecycleState: PaymentLifecycleState.AUTHORIZED,
          requiresAction: false,
        },
        actorUserId: 'u1',
        source: 'checkout',
        reasonPrefix: 'checkout',
        voidOnInventoryFailure: true,
      }),
    ).rejects.toBe(err);

    expect(payments.voidOrRefundForOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ord-1',
        reason: 'checkout_advance_inventory_or_transition_failed',
      }),
    );
  });
});
