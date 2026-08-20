import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { AdminOrdersController } from './admin-orders.controller';
import type { OrdersService } from './orders.service';

describe('AdminOrdersController', () => {
  const orders = {
    listOrders: jest.fn(),
    getOrderById: jest.fn(),
    createOrder: jest.fn(),
    updateOrderFields: jest.fn(),
    softDeleteOrder: jest.fn(),
    archiveOrder: jest.fn(),
    restoreOrder: jest.fn(),
    addAdjustment: jest.fn(),
    overrideOrder: jest.fn(),
    transitionOrder: jest.fn(),
    listNotes: jest.fn(),
    addNote: jest.fn(),
    listStatusHistory: jest.fn(),
    listActivity: jest.fn(),
    listOrderItems: jest.fn(),
  };

  const controller = new AdminOrdersController(
    orders as unknown as OrdersService,
  );
  const actor = { id: 'admin-1' } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates via shared domain with guardian source', async () => {
    orders.createOrder.mockResolvedValue({ id: 'ord-1' });
    await controller.create(
      {
        patientUserId: 'u1',
        lines: [{ variantId: 'v1', quantity: 1 }],
        shippingAddress: { line1: '1 Main', city: 'Austin' },
        billingAddress: { line1: '1 Main', city: 'Austin' },
      },
      actor,
    );
    expect(orders.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        patientUserId: 'u1',
        source: 'guardian',
        actorUserId: 'admin-1',
      }),
    );
  });

  it('edits with guardian context', async () => {
    orders.updateOrderFields.mockResolvedValue({});
    await controller.update(
      'ord-1',
      { adminTags: { flagged: true }, trackingNumber: '1Z' },
      actor,
    );
    expect(orders.updateOrderFields).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'guardian',
        adminTags: { flagged: true },
      }),
    );
  });

  it('Class D delete/archive/restore require classDAuthorized', async () => {
    orders.softDeleteOrder.mockResolvedValue({});
    orders.archiveOrder.mockResolvedValue({});
    orders.restoreOrder.mockResolvedValue({});

    await controller.softDelete('ord-1', { reason: 'cleanup' }, actor);
    await controller.archive('ord-1', { reason: 'archive' }, actor);
    await controller.restore('ord-1', { reason: 'restore' }, actor);

    expect(orders.softDeleteOrder).toHaveBeenCalledWith(
      expect.objectContaining({ classDAuthorized: true }),
    );
    expect(orders.archiveOrder).toHaveBeenCalledWith(
      expect.objectContaining({ classDAuthorized: true }),
    );
    expect(orders.restoreOrder).toHaveBeenCalledWith(
      expect.objectContaining({ classDAuthorized: true }),
    );
  });

  it('corrections call addAdjustment without Payments execution', async () => {
    orders.addAdjustment.mockResolvedValue({ id: 'adj-1' });
    await controller.correct(
      'ord-1',
      { amountCents: -500, reason: 'write-off' },
      actor,
    );
    expect(orders.addAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: -500,
        classDAuthorized: true,
      }),
    );
  });

  it('overrides via overrideOrder', async () => {
    orders.overrideOrder.mockResolvedValue({
      status: OrderStatus.AWAITING_FULFILLMENT,
    });
    await controller.override(
      'ord-1',
      { toStatus: OrderStatus.AWAITING_FULFILLMENT, reason: 'ops exception' },
      actor,
    );
    expect(orders.overrideOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        toStatus: OrderStatus.AWAITING_FULFILLMENT,
        reason: 'ops exception',
        classDAuthorized: true,
      }),
    );
  });

  it('rejects invalid list status', () => {
    expect(() => {
      void controller.list(undefined, 'NOPE');
    }).toThrow(BadRequestException);
    try {
      void controller.list(undefined, 'NOPE');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: ErrorCodes.VAL_INVALID_FORMAT }),
      );
    }
  });
});
