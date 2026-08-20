import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  ProductType,
  UserStatus,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OrderEditPolicyService } from './order-edit-policy.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrderSnapshotService } from './order-snapshot.service';
import { OrderTotalsService } from './order-totals.service';
import { OrdersService } from './orders.service';

type TxMock = {
  user: { findUnique: jest.Mock };
  productVariant: { findUnique: jest.Mock };
  order: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  orderItem: { findMany: jest.Mock };
  orderAddress: { update: jest.Mock };
  orderStatusHistory: { create: jest.Mock };
  orderActivity: { create: jest.Mock };
  orderNote: { create: jest.Mock };
  orderAdjustment: { create: jest.Mock; findMany: jest.Mock };
};

describe('OrdersService', () => {
  const patient = {
    id: 'user-1',
    email: 'patient@example.com',
    firstName: 'Pat',
    lastName: 'Ent',
    phone: '555',
    status: UserStatus.ACTIVE,
    deletedAt: null,
  };

  const product = {
    id: 'prod-1',
    name: 'Widget',
    productType: ProductType.STANDARD,
    isRxEligible: false,
    brandName: 'Brand',
    deletedAt: null,
  };

  const variant = {
    id: 'var-1',
    productId: 'prod-1',
    sku: 'W-1',
    label: 'Default',
    priceCents: 1000,
    salePriceCents: 900,
    currency: 'USD',
    isFulfillable: true,
    optionValues: null,
    deletedAt: null,
    product,
  };

  function buildPrismaMock() {
    const createdOrder = {
      id: 'ord-1',
      orderNumber: 'ORD-TEST',
      status: OrderStatus.DRAFT,
      patientUserId: patient.id,
      deletedAt: null,
      archivedAt: null,
      shippingTotalCents: 0,
      discountTotalCents: 0,
      taxTotalCents: 0,
      refundedTotalCents: 0,
      items: [],
      addresses: [],
      statusHistory: [],
      activities: [],
    };

    const tx: TxMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue(patient),
      },
      productVariant: {
        findUnique: jest.fn().mockResolvedValue(variant),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(createdOrder),
        create: jest.fn().mockResolvedValue(createdOrder),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...createdOrder, ...data }),
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            unitPriceCents: 1000,
            salePriceCents: 900,
            quantity: 1,
            discountCents: 0,
            taxCents: 0,
            lineSubtotalCents: 900,
            lineTotalCents: 900,
          },
        ]),
      },
      orderAddress: {
        update: jest.fn().mockResolvedValue({}),
      },
      orderStatusHistory: {
        create: jest.fn().mockResolvedValue({}),
      },
      orderActivity: {
        create: jest.fn().mockResolvedValue({}),
      },
      orderNote: {
        create: jest.fn().mockResolvedValue({
          id: 'note-1',
          orderId: 'ord-1',
          body: 'hello',
        }),
      },
      orderAdjustment: {
        create: jest.fn().mockResolvedValue({
          id: 'adj-1',
          kind: 'CORRECTION',
          amountCents: -100,
        }),
        findMany: jest.fn().mockResolvedValue([{ amountCents: -100 }]),
      },
    };

    const prisma = {
      $transaction: jest.fn((fn: (client: TxMock) => Promise<unknown>) =>
        fn(tx),
      ),
      orderStatusHistory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    return { prisma, tx, createdOrder };
  }

  function buildService(prisma: unknown) {
    return new OrdersService(
      prisma as PrismaService,
      new OrderLifecycleService(),
      new OrderTotalsService(),
      new OrderSnapshotService(),
      new OrderEditPolicyService(),
    );
  }

  const baseCreateInput = {
    patientUserId: patient.id,
    lines: [{ variantId: variant.id, quantity: 2 }],
    shippingAddress: {
      line1: '1 Main',
      city: 'Austin',
      region: 'TX',
      postalCode: '78701',
    },
    billingAddress: {
      line1: '1 Main',
      city: 'Austin',
      region: 'TX',
      postalCode: '78701',
    },
    actorUserId: 'staff-1',
    source: 'test',
  };

  it('creates an order with snapshots, totals, history, and activity', async () => {
    const { prisma, tx } = buildPrismaMock();
    tx.order.findUnique = jest.fn().mockResolvedValue(null);

    const service = buildService(prisma);
    const order = await service.createOrder(baseCreateInput);

    expect(order.id).toBe('ord-1');
    expect(tx.order.create).toHaveBeenCalled();
    const createCalls = tx.order.create.mock.calls as Array<
      [
        {
          data: {
            items: { create: Array<Record<string, unknown>> };
            subtotalCents: number;
            totalCents: number;
            customerEmail: string;
            addresses: { create: unknown[] };
            statusHistory: { create: { toStatus: OrderStatus } };
            activities: { create: { kind: string } };
          };
        },
      ]
    >;
    const createArg = createCalls[0][0];
    const firstItem = createArg.data.items.create[0];
    expect(firstItem.productName).toBe('Widget');
    expect(firstItem.sku).toBe('W-1');
    expect(firstItem.salePriceCents).toBe(900);
    expect(firstItem.quantity).toBe(2);
    expect(createArg.data.subtotalCents).toBe(1800);
    expect(createArg.data.totalCents).toBe(1800);
    expect(createArg.data.customerEmail).toBe('patient@example.com');
    expect(createArg.data.addresses.create).toHaveLength(2);
    expect(createArg.data.statusHistory.create.toStatus).toBe(
      OrderStatus.DRAFT,
    );
    expect(createArg.data.activities.create.kind).toBe('order_created');
  });

  it('rejects invalid variant and quantity', async () => {
    const { prisma, tx } = buildPrismaMock();
    tx.productVariant.findUnique = jest.fn().mockResolvedValue(null);
    const service = buildService(prisma);

    await expect(service.createOrder(baseCreateInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const { prisma: prisma2, tx: tx2 } = buildPrismaMock();
    tx2.order.findUnique = jest.fn().mockResolvedValue(null);
    const service2 = buildService(prisma2);
    await expect(
      service2.createOrder({
        ...baseCreateInput,
        lines: [{ variantId: variant.id, quantity: 0 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rolls back via transaction when create fails mid-flight', async () => {
    const { prisma, tx } = buildPrismaMock();
    tx.order.findUnique = jest.fn().mockResolvedValue(null);
    tx.order.create = jest.fn().mockRejectedValue(new Error('db down'));
    const service = buildService(prisma);

    await expect(service.createOrder(baseCreateInput)).rejects.toThrow(
      'db down',
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('transitions with history and rejects illegal/concurrent updates', async () => {
    const { prisma, tx, createdOrder } = buildPrismaMock();
    createdOrder.status = OrderStatus.PAYMENT_PENDING;
    tx.order.findUnique = jest.fn().mockResolvedValue(createdOrder);
    tx.order.findUniqueOrThrow = jest.fn().mockResolvedValue({
      ...createdOrder,
      status: OrderStatus.AWAITING_FULFILLMENT,
      statusHistory: [],
    });

    const service = buildService(prisma);
    const hooks = {
      onInventory: jest.fn(),
      onPayment: jest.fn(),
    };
    service.setSideEffectHooks(hooks);

    await service.transitionOrder({
      orderId: 'ord-1',
      toStatus: OrderStatus.AWAITING_FULFILLMENT,
      source: 'system',
    });

    expect(tx.orderStatusHistory.create).toHaveBeenCalled();
    expect(tx.orderActivity.create).toHaveBeenCalled();
    expect(hooks.onInventory).toHaveBeenCalledWith(
      'reserve_on_auth_success',
      'ord-1',
    );

    await expect(
      service.transitionOrder({
        orderId: 'ord-1',
        toStatus: OrderStatus.FULFILLED,
        source: 'ops',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    tx.order.updateMany = jest.fn().mockResolvedValue({ count: 0 });
    createdOrder.status = OrderStatus.AWAITING_FULFILLMENT;
    await expect(
      service.transitionOrder({
        orderId: 'ord-1',
        toStatus: OrderStatus.FULFILLED,
        source: 'ops',
        expectedStatus: OrderStatus.AWAITING_FULFILLMENT,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('adds notes and records activity without storing note body on activity', async () => {
    const { prisma, tx, createdOrder } = buildPrismaMock();
    tx.order.findUnique = jest.fn().mockResolvedValue(createdOrder);
    const service = buildService(prisma);

    const note = await service.addNote({
      orderId: 'ord-1',
      authorUserId: 'staff-1',
      body: 'Call patient',
    });
    expect(note.id).toBe('note-1');
    const activityCalls = tx.orderActivity.create.mock.calls as Array<
      [{ data: { kind: string; metadata: { noteId: string } } }]
    >;
    const noteActivity = activityCalls.find(
      (call) => call[0].data.kind === 'note_added',
    );
    expect(noteActivity?.[0]?.data.metadata).toEqual({ noteId: 'note-1' });
  });

  it('requires Class D for adjustments and soft-delete', async () => {
    const { prisma, tx, createdOrder } = buildPrismaMock();
    tx.order.findUnique = jest.fn().mockResolvedValue(createdOrder);
    const service = buildService(prisma);

    await expect(
      service.addAdjustment({
        orderId: 'ord-1',
        amountCents: -100,
        classDAuthorized: true,
      }),
    ).resolves.toBeDefined();

    const deleted = await service.softDeleteOrder({
      orderId: 'ord-1',
      classDAuthorized: true,
    });
    expect(deleted.deletedAt).toBeInstanceOf(Date);
  });

  it('rejects missing patient', async () => {
    const { prisma, tx } = buildPrismaMock();
    tx.user.findUnique = jest.fn().mockResolvedValue(null);
    const service = buildService(prisma);
    await expect(service.createOrder(baseCreateInput)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('applies edit policy for CRM operational fields', async () => {
    const { prisma, tx, createdOrder } = buildPrismaMock();
    createdOrder.status = OrderStatus.AWAITING_FULFILLMENT;
    tx.order.findUnique = jest.fn().mockResolvedValue(createdOrder);
    tx.order.update = jest.fn().mockResolvedValue({
      ...createdOrder,
      trackingNumber: '1Z',
      addresses: [],
    });
    const service = buildService(prisma);

    await service.updateOrderFields({
      orderId: 'ord-1',
      context: 'crm',
      trackingNumber: '1Z',
    });

    try {
      await service.updateOrderFields({
        orderId: 'ord-1',
        context: 'crm',
        adminTags: { x: 1 },
      });
      fail('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({ code: ErrorCodes.ORD_EDIT_FORBIDDEN }),
      );
    }
  });

  it('lists and loads orders for CRM query surfaces', async () => {
    const listItem = {
      id: 'ord-1',
      orderNumber: 'ORD-TEST',
      status: OrderStatus.AWAITING_FULFILLMENT,
      orderType: 'ONE_TIME',
      patientUserId: patient.id,
      customerFirstName: 'Pat',
      customerLastName: 'Ent',
      customerEmail: patient.email,
      customerPhone: '555',
      currency: 'USD',
      totalCents: 900,
      paymentStatusSummary: null,
      subscriptionId: null,
      requiresClinicalReview: false,
      isRxOrder: false,
      trackingNumber: null,
      shippedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const prisma = {
      $transaction: jest.fn(),
      order: {
        findMany: jest.fn().mockResolvedValue([listItem]),
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest
          .fn()
          .mockResolvedValue([
            { status: OrderStatus.AWAITING_FULFILLMENT, _count: { _all: 1 } },
          ]),
        findUnique: jest.fn().mockResolvedValue({
          ...listItem,
          deletedAt: null,
          items: [],
          addresses: [],
          adjustments: [],
          patient: {
            id: patient.id,
            email: patient.email,
            firstName: patient.firstName,
            lastName: patient.lastName,
            displayName: null,
            phone: patient.phone,
            status: patient.status,
          },
          subtotalCents: 900,
          discountTotalCents: 0,
          shippingTotalCents: 0,
          taxTotalCents: 0,
          adjustmentTotalCents: 0,
          refundedTotalCents: 0,
        }),
      },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      orderNote: { findMany: jest.fn().mockResolvedValue([]) },
      orderStatusHistory: { findMany: jest.fn().mockResolvedValue([]) },
      orderActivity: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const service = buildService(prisma);
    const listed = await service.listOrders({
      status: OrderStatus.AWAITING_FULFILLMENT,
      take: 10,
    });
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.orderNumber).toBe('ORD-TEST');
    expect(listed.statusCounts.AWAITING_FULFILLMENT).toBe(1);

    const detail = await service.getOrderById('ord-1');
    expect(detail.canFulfill).toBe(true);
    expect(detail.canCancel).toBe(true);
    expect(detail.allowedNextStatuses).toContain(OrderStatus.FULFILLED);

    await expect(service.listNotes('ord-1')).resolves.toEqual([]);
    await expect(service.listStatusHistory('ord-1')).resolves.toEqual([]);
    await expect(service.listActivity('ord-1')).resolves.toEqual([]);
  });

  it('rejects Class D soft-delete without authorization flag', async () => {
    const { prisma } = buildPrismaMock();
    const service = buildService(prisma);
    await expect(
      service.softDeleteOrder({
        orderId: 'ord-1',
        classDAuthorized: false as unknown as true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('override bypasses normal graph but requires reason and Class D', async () => {
    const { prisma, tx, createdOrder } = buildPrismaMock();
    createdOrder.status = OrderStatus.DRAFT;
    tx.order.findUnique = jest.fn().mockResolvedValue(createdOrder);
    tx.order.update = jest.fn().mockResolvedValue({
      ...createdOrder,
      status: OrderStatus.FULFILLED,
    });
    const service = buildService(prisma);

    await expect(
      service.overrideOrder({
        orderId: 'ord-1',
        toStatus: OrderStatus.FULFILLED,
        reason: '',
        classDAuthorized: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.overrideOrder({
      orderId: 'ord-1',
      toStatus: OrderStatus.FULFILLED,
      reason: 'documented exception',
      classDAuthorized: true,
      actorUserId: 'admin-1',
    });

    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'guardian_override',
          toStatus: OrderStatus.FULFILLED,
        }) as Record<string, unknown>,
      }),
    );
  });
});
