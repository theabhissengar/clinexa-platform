import { OrdersService } from './orders.service';

describe('OrdersService.recordRefundedTotal (Phase 7 audit)', () => {
  it('attributes actor from Refund.actorUserId and is idempotent per refundId', async () => {
    const activities: Array<Record<string, unknown>> = [];
    const prisma = {
      refund: {
        findUnique: jest.fn().mockResolvedValue({ actorUserId: 'staff-actor' }),
      },
      $transaction: async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          order: {
            update: jest.fn().mockResolvedValue({}),
          },
          orderActivity: {
            findMany: jest.fn().mockImplementation(() =>
              Promise.resolve(
                activities.map((a) => ({
                  id: a.id,
                  metadata: a.metadata,
                })),
              ),
            ),
            create: jest
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  activities.push({
                    id: `act-${activities.length + 1}`,
                    ...data,
                  });
                  return Promise.resolve(data);
                },
              ),
          },
        };
        await fn(tx);
      },
    };

    const service = Object.create(OrdersService.prototype) as OrdersService;
    (service as unknown as { prisma: typeof prisma }).prisma = prisma;

    const input = {
      orderId: 'ord-1',
      refundedTotalCents: 500,
      paymentId: 'pay-1',
      refundId: 'ref-1',
    };

    await service.recordRefundedTotal(input);
    await service.recordRefundedTotal(input);

    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      orderId: 'ord-1',
      actorUserId: 'staff-actor',
      kind: 'payment_refunded',
      metadata: {
        paymentId: 'pay-1',
        refundId: 'ref-1',
        refundedTotalCents: 500,
        actorUserId: 'staff-actor',
      },
    });
  });

  it('preserves null actor for system-originated refunds', async () => {
    const activities: Array<Record<string, unknown>> = [];
    const prisma = {
      refund: {
        findUnique: jest.fn().mockResolvedValue({ actorUserId: null }),
      },
      $transaction: async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          order: { update: jest.fn().mockResolvedValue({}) },
          orderActivity: {
            findMany: jest.fn().mockResolvedValue([]),
            create: jest
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  activities.push(data);
                  return Promise.resolve(data);
                },
              ),
          },
        };
        await fn(tx);
      },
    };

    const service = Object.create(OrdersService.prototype) as OrdersService;
    (service as unknown as { prisma: typeof prisma }).prisma = prisma;

    await service.recordRefundedTotal({
      orderId: 'ord-2',
      refundedTotalCents: 100,
      paymentId: 'pay-2',
      refundId: 'ref-2',
    });

    expect(activities[0]).toMatchObject({
      actorUserId: null,
      metadata: { actorUserId: null, refundId: 'ref-2' },
    });
  });
});
