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

type TxMock = Record<string, unknown>;

function createPrismaMock() {
  const store = {
    payments: [] as Array<Record<string, unknown>>,
    methods: [] as Array<Record<string, unknown>>,
    refunds: [] as Array<Record<string, unknown>>,
    webhooks: [] as Array<Record<string, unknown>>,
  };

  const prisma = {
    savedPaymentMethod: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        store.methods.find(
          (m) => m.id === where.id && m.deletedAt == null,
        ) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'spm-1', deletedAt: null, ...data };
        store.methods.push(row);
        return row;
      }),
    },
    payment: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: { idempotencyKey?: string; id?: string };
        }) => {
          if (where.idempotencyKey) {
            return (
              store.payments.find(
                (p) => p.idempotencyKey === where.idempotencyKey,
              ) ?? null
            );
          }
          return store.payments.find((p) => p.id === where.id) ?? null;
        },
      ),
      findFirst: jest.fn(
        async ({ where }: { where: { orderId?: string } }) =>
          store.payments.find((p) => p.orderId === where.orderId) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const dup = store.payments.find(
          (p) => p.idempotencyKey === data.idempotencyKey,
        );
        if (dup) {
          throw new Prisma.PrismaClientKnownRequestError('Unique', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const row = {
          id: `pay-${store.payments.length + 1}`,
          status: PaymentStatus.PENDING,
          lifecycleState: PaymentLifecycleState.PENDING_AUTHORIZATION,
          providerPaymentRef: null,
          providerAuthorizationRef: null,
          providerCaptureRef: null,
          ...data,
        };
        store.payments.push(row);
        return row;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const idx = store.payments.findIndex((p) => p.id === where.id);
          store.payments[idx] = { ...store.payments[idx], ...data };
          return store.payments[idx];
        },
      ),
    },
    refund: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        store.refunds.push(data);
        return data;
      }),
    },
    paymentWebhookEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const dup = store.webhooks.find(
          (w) =>
            w.provider === data.provider &&
            w.providerEventId === data.providerEventId,
        );
        if (dup) {
          throw Object.assign(new Error('Unique'), {
            code: 'P2002',
            name: 'PrismaClientKnownRequestError',
            clientVersion: 'test',
          });
        }
        const row = { id: `wh-${store.webhooks.length + 1}`, ...data };
        store.webhooks.push(row);
        return row;
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    },
    order: {
      findUnique: jest.fn(async () => null),
    },
    $transaction: jest.fn(async (fn: (tx: TxMock) => Promise<unknown>) =>
      fn(prisma as unknown as TxMock),
    ),
    _store: store,
  };

  return prisma;
}

describe('PaymentsService (simulated gateway)', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
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
    service = new PaymentsService(
      prisma as never,
      config,
      adapter,
    );

    await prisma.savedPaymentMethod.create({
      data: {
        userId: 'user-1',
        provider: 'simulated',
        providerMethodRef: 'tok_test_1',
      },
    });
    // fix id
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

    // Second create throws P2002 — need PrismaClientKnownRequestError
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
