import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { CrmOrdersController } from './crm-orders.controller';
import type { OrdersService } from './orders.service';

describe('CrmOrdersController', () => {
  const orders = {
    listOrders: jest.fn(),
    getOrderById: jest.fn(),
    listOrderItems: jest.fn(),
    listNotes: jest.fn(),
    addNote: jest.fn(),
    listStatusHistory: jest.fn(),
    listActivity: jest.fn(),
    updateOrderFields: jest.fn(),
    transitionOrder: jest.fn(),
  };

  const controller = new CrmOrdersController(
    orders as unknown as OrdersService,
  );

  const actor = { id: 'staff-1' } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid status filter', () => {
    expect(() => {
      void controller.list(undefined, 'NOT_A_STATUS');
    }).toThrow(BadRequestException);
    try {
      void controller.list(undefined, 'NOT_A_STATUS');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: ErrorCodes.VAL_INVALID_FORMAT }),
      );
    }
  });

  it('cancels via lifecycle transition (never direct status write)', async () => {
    orders.transitionOrder.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'ORD-1',
      status: OrderStatus.CANCELLED,
      orderType: 'ONE_TIME',
      totalCents: 100,
      currency: 'USD',
      updatedAt: new Date(),
    });

    await controller.cancel('ord-1', { reason: 'customer request' }, actor);

    expect(orders.transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ord-1',
        toStatus: OrderStatus.CANCELLED,
        source: 'crm',
        actorUserId: 'staff-1',
        reason: 'customer request',
      }),
    );
  });

  it('fulfills via lifecycle transition', async () => {
    orders.updateOrderFields.mockResolvedValue({});
    orders.transitionOrder.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'ORD-1',
      status: OrderStatus.FULFILLED,
      orderType: 'ONE_TIME',
      totalCents: 100,
      currency: 'USD',
      updatedAt: new Date(),
    });

    await controller.fulfill(
      'ord-1',
      { trackingNumber: '1Z', carrier: 'UPS' },
      actor,
    );

    expect(orders.updateOrderFields).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ord-1',
        context: 'crm',
        trackingNumber: '1Z',
        carrier: 'UPS',
      }),
    );
    expect(orders.transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        toStatus: OrderStatus.FULFILLED,
        source: 'crm',
      }),
    );
  });

  it('strips admin metadata from CRM detail responses', async () => {
    orders.getOrderById.mockResolvedValue({
      id: 'ord-1',
      orderNumber: 'ORD-1',
      status: OrderStatus.DRAFT,
      adminTags: { secret: true },
      reconciliationFlags: { flag: 1 },
      items: [],
      addresses: [],
      patient: { id: 'u1' },
      canCancel: true,
      canFulfill: false,
      allowedNextStatuses: [],
    });

    const result = await controller.get('ord-1');
    expect(result).not.toHaveProperty('adminTags');
    expect(result).not.toHaveProperty('reconciliationFlags');
    expect(result).toHaveProperty('orderNumber', 'ORD-1');
  });
});
