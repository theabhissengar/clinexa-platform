import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentLifecycleState,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PaymentsService } from './payments.service';
import { SimulatedPaymentAdapter } from './simulated-payment.adapter';

type StoreRow = {
  id?: string;
  deletedAt?: Date | null;
  idempotencyKey?: string;
  orderId?: string;
  provider?: string;
  providerEventId?: string;
  lifecycleState?: PaymentLifecycleState;
};

type PrismaMock = {
  savedPaymentMethod: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  payment: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  refund: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  paymentWebhookEvent: {
    create: jest.Mock;
    update: jest.Mock;
  };
  order: {
    findUnique: jest.Mock;
  };
  $transaction: jest.Mock;
  _store: {
    payments: StoreRow[];
    methods: StoreRow[];
    refunds: StoreRow[];
    webhooks: StoreRow[];
  };
};

function createPrismaMock(): PrismaMock {
  const store = {
    payments: [] as StoreRow[],
    methods: [] as StoreRow[],
    refunds: [] as StoreRow[],
    webhooks: [] as StoreRow[],
  };

  const prisma: PrismaMock = {
    savedPaymentMethod: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          store.methods.find((m) => m.id === where.id && m.deletedAt == null) ??
            null,
        ),
      ),
      create: jest.fn(({ data }: { data: StoreRow }) => {
        const row: StoreRow = { id: 'spm-1', deletedAt: null, ...data };
        store.methods.push(row);
        return Promise.resolve(row);
      }),
    },
    payment: {
      findUnique: jest.fn(
        ({ where }: { where: { idempotencyKey?: string; id?: string } }) => {
          if (where.idempotencyKey) {
            return Promise.resolve(
              store.payments.find(
                (p) => p.idempotencyKey === where.idempotencyKey,
              ) ?? null,
            );
          }
          return Promise.resolve(
            store.payments.find((p) => p.id === where.id) ?? null,
          );
        },
      ),
      findFirst: jest.fn(({ where }: { where: { orderId?: string } }) =>
        Promise.resolve(
          store.payments.find((p) => p.orderId === where.orderId) ?? null,
        ),
      ),
      create: jest.fn(({ data }: { data: StoreRow }) => {
        const dup = store.payments.find(
          (p) => p.idempotencyKey === data.idempotencyKey,
        );
        if (dup) {
          throw new Prisma.PrismaClientKnownRequestError('Unique', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const row: StoreRow = {
          id: `pay-${store.payments.length + 1}`,
          lifecycleState: PaymentLifecycleState.PENDING_AUTHORIZATION,
          ...data,
        };
        store.payments.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: StoreRow }) => {
          const idx = store.payments.findIndex((p) => p.id === where.id);
          store.payments[idx] = { ...store.payments[idx], ...data };
          return Promise.resolve(store.payments[idx]);
        },
      ),
    },
    refund: {
      findUnique: jest.fn(() => Promise.resolve(null)),
      create: jest.fn(({ data }: { data: StoreRow }) => {
        store.refunds.push(data);
        return Promise.resolve(data);
      }),
    },
    paymentWebhookEvent: {
      create: jest.fn(({ data }: { data: StoreRow }) => {
        const dup = store.webhooks.find(
          (w) =>
            w.provider === data.provider &&
            w.providerEventId === data.providerEventId,
        );
        if (dup) {
          throw new Prisma.PrismaClientKnownRequestError('Unique', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const row: StoreRow = {
          id: `wh-${store.webhooks.length + 1}`,
          ...data,
        };
        store.webhooks.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ data }: { data: StoreRow }) => Promise.resolve(data)),
    },
    order: {
      findUnique: jest.fn(() => Promise.resolve(null)),
    },
    $transaction: jest.fn((fn: (tx: PrismaMock) => Promise<unknown>) =>
      fn(prisma),
    ),
    _store: store,
  };

  return prisma;
}

describe('PaymentsService (simulated gateway)', () => {
  let prisma: PrismaMock;
  let service: PaymentsService;
  let adapter: SimulatedPaymentAdapter;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'payments.provider') return 'simulated';
        if (key === 'payments.simulatedForce') return null;
        return undefined;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'payments.webhookSecret') {
          return 'test-webhook-secret-16';
        }
        throw new Error(`missing ${key}`);
      }),
    } as unknown as ConfigService;

    adapter = new SimulatedPaymentAdapter(config);
    service = new PaymentsService(prisma as never, config, adapter);

    await prisma.savedPaymentMethod.create({
      data: {
        userId: 'user-1',
        provider: 'simulated',
        providerMethodRef: 'tok_test_1',
      },
    });
    prisma._store.methods[0].id = 'spm-1';
  });

  it('authorizes and captures idempotently', async () => {
    const auth = await service.authorizeForOrder({
      orderId: 'ord-1',
      subscriptionId: 'sub-1',
      paymentMethodId: 'spm-1',
      amountCents: 5000,
      idempotencyKey: 'renewal:sub-1:key:authorize',
    });
    expect(auth.status).toBe(PaymentStatus.AUTHORIZED_OR_CAPTURED);
    expect(auth.lifecycleState).toBe(PaymentLifecycleState.AUTHORIZED);

    const replay = await service.authorizeForOrder({
      orderId: 'ord-1',
      subscriptionId: 'sub-1',
      paymentMethodId: 'spm-1',
      amountCents: 5000,
      idempotencyKey: 'renewal:sub-1:key:authorize',
    });
    expect(replay.paymentId).toBe(auth.paymentId);
    expect(prisma._store.payments).toHaveLength(1);

    const capture = await service.capturePayment({
      paymentId: auth.paymentId,
      idempotencyKey: 'renewal:sub-1:key:capture',
    });
    expect(capture.lifecycleState).toBe(PaymentLifecycleState.CAPTURED);

    const captureReplay = await service.capturePayment({
      paymentId: auth.paymentId,
      idempotencyKey: 'renewal:sub-1:key:capture',
    });
    expect(captureReplay.lifecycleState).toBe(PaymentLifecycleState.CAPTURED);
  });

  it('fails authorization on simulated decline', async () => {
    const result = await service.authorizeForOrder({
      orderId: 'ord-2',
      paymentMethodId: 'spm-1',
      amountCents: 1000,
      idempotencyKey: 'renewal:sub:decline:authorize',
      forceOutcome: 'decline',
    });
    expect(result.status).toBe(PaymentStatus.FAILED);
    expect(result.lifecycleState).toBe(
      PaymentLifecycleState.AUTHORIZATION_FAILED,
    );
  });

  it('rejects missing payment method', async () => {
    await expect(
      service.authorizeForOrder({
        orderId: 'ord-3',
        paymentMethodId: 'missing',
        amountCents: 1000,
        idempotencyKey: 'renewal:sub:missing:authorize',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects idempotency key body mismatch', async () => {
    await service.authorizeForOrder({
      orderId: 'ord-4',
      paymentMethodId: 'spm-1',
      amountCents: 1000,
      idempotencyKey: 'renewal:sub:mismatch:authorize',
    });
    await expect(
      service.authorizeForOrder({
        orderId: 'ord-OTHER',
        paymentMethodId: 'spm-1',
        amountCents: 1000,
        idempotencyKey: 'renewal:sub:mismatch:authorize',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('verifies webhook secret and dedupes events', async () => {
    const first = await service.ingestWebhook({
      secretHeader: 'test-webhook-secret-16',
      envelope: {
        provider: 'simulated',
        providerEventId: 'evt-1',
        type: 'payment.authorized',
      },
    });
    expect(first.duplicate).toBe(false);

    prisma.paymentWebhookEvent.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const second = await service.ingestWebhook({
      secretHeader: 'test-webhook-secret-16',
      envelope: {
        provider: 'simulated',
        providerEventId: 'evt-1',
        type: 'payment.authorized',
      },
    });
    expect(second.duplicate).toBe(true);

    await expect(
      service.ingestWebhook({
        secretHeader: 'wrong',
        envelope: {
          provider: 'simulated',
          providerEventId: 'evt-2',
          type: 'payment.authorized',
        },
      }),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.PAY_WEBHOOK_INVALID },
    });
  });

  it('voids authorized payment', async () => {
    const auth = await service.authorizeForOrder({
      orderId: 'ord-void',
      paymentMethodId: 'spm-1',
      amountCents: 2000,
      purpose: PaymentPurpose.RENEWAL,
      idempotencyKey: 'renewal:sub:void:authorize',
    });
    await service.voidOrRefundForOrder({
      orderId: 'ord-void',
      idempotencyKey: 'void_refund:ord-void',
    });
    const payment = prisma._store.payments.find((p) => p.id === auth.paymentId);
    expect(payment?.lifecycleState).toBe(PaymentLifecycleState.VOIDED);
  });
});
