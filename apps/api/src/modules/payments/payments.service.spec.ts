import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentLifecycleState,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PaymentProviderRegistry } from './payment-provider.registry';
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
  userId?: string;
  amountCents?: number;
  status?: string;
  reason?: string | null;
  actorUserId?: string | null;
  paymentId?: string;
  providerPaymentRef?: string;
  providerCaptureRef?: string;
  providerAuthorizationRef?: string;
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
    aggregate: jest.Mock;
  };
  paymentWebhookEvent: {
    create: jest.Mock;
    update: jest.Mock;
  };
  order: {
    findUnique: jest.Mock;
  };
  $transaction: jest.Mock;
  $executeRaw: jest.Mock;
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
        ({
          where,
        }: {
          where: {
            idempotencyKey?: string;
            id?: string;
            providerPaymentRef?: string;
          };
        }) => {
          if (where.idempotencyKey) {
            return Promise.resolve(
              store.payments.find(
                (p) => p.idempotencyKey === where.idempotencyKey,
              ) ?? null,
            );
          }
          if (where.providerPaymentRef) {
            return Promise.resolve(
              store.payments.find(
                (p) => p.providerPaymentRef === where.providerPaymentRef,
              ) ?? null,
            );
          }
          return Promise.resolve(
            store.payments.find((p) => p.id === where.id) ?? null,
          );
        },
      ),
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: { orderId?: string; providerPaymentRef?: string };
        }) => {
          if (where.providerPaymentRef) {
            return Promise.resolve(
              store.payments.find(
                (p) => p.providerPaymentRef === where.providerPaymentRef,
              ) ?? null,
            );
          }
          return Promise.resolve(
            store.payments.find((p) => p.orderId === where.orderId) ?? null,
          );
        },
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
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: { idempotencyKey?: string; id?: string };
        }) => {
          if (where.idempotencyKey) {
            return Promise.resolve(
              store.refunds.find(
                (r) => r.idempotencyKey === where.idempotencyKey,
              ) ?? null,
            );
          }
          return Promise.resolve(null);
        },
      ),
      create: jest.fn(({ data }: { data: StoreRow }) => {
        const row: StoreRow = {
          id: `ref-${store.refunds.length + 1}`,
          status: 'SUCCEEDED',
          ...data,
        };
        store.refunds.push(row);
        return Promise.resolve(row);
      }),
      aggregate: jest.fn(
        ({
          where,
        }: {
          where?: { paymentId?: string; status?: string };
        } = {}) => {
          const sum = store.refunds
            .filter((r) => {
              if (where?.paymentId && r.paymentId !== where.paymentId) {
                return false;
              }
              if (where?.status) {
                return r.status === where.status;
              }
              return r.status === 'SUCCEEDED';
            })
            .reduce((acc, r) => acc + (r.amountCents ?? 0), 0);
          return Promise.resolve({ _sum: { amountCents: sum } });
        },
      ),
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
      findUnique: jest.fn(() =>
        Promise.resolve({ patientUserId: 'user-1' }),
      ),
    },
    $transaction: jest.fn((fn: (tx: PrismaMock) => Promise<unknown>) =>
      fn(prisma),
    ),
    $executeRaw: jest.fn(() => Promise.resolve(1)),
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
    const registry = new PaymentProviderRegistry(config);
    service = new PaymentsService(
      prisma as never,
      config,
      adapter,
      registry,
    );

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

  it('P14g: void_or_refund hook does not invoke clinical decline hold', async () => {
    const onClinicalDeclineHold = jest.fn();
    service.setOutcomeHandlers({ onClinicalDeclineHold });

    await service.authorizeForOrder({
      orderId: 'ord-clin-void',
      paymentMethodId: 'spm-1',
      amountCents: 2000,
      purpose: PaymentPurpose.RENEWAL,
      idempotencyKey: 'renewal:sub:clin-void:authorize',
    });

    await service.handleOrderPaymentHook(
      'void_or_refund_required',
      'ord-clin-void',
    );

    expect(onClinicalDeclineHold).not.toHaveBeenCalled();
    const payment = prisma._store.payments.find(
      (p) => p.orderId === 'ord-clin-void',
    );
    expect(payment?.lifecycleState).toBe(PaymentLifecycleState.VOIDED);
  });

  it('rejects saved method ownership mismatch with ERR-PAY-005', async () => {
    prisma.order.findUnique.mockResolvedValueOnce({
      patientUserId: 'other-user',
    });
    await expect(
      service.authorizeForOrder({
        orderId: 'ord-own',
        paymentMethodId: 'spm-1',
        amountCents: 1000,
        idempotencyKey: 'own:mismatch',
      }),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.PAY_METHOD_INVALID },
    });
  });

  it('issues full and partial refunds with cumulative limits and idempotency', async () => {
    const auth = await service.authorizeForOrder({
      orderId: 'ord-ref',
      paymentMethodId: 'spm-1',
      amountCents: 1000,
      idempotencyKey: 'ref:auth',
    });
    await service.capturePayment({
      paymentId: auth.paymentId,
      idempotencyKey: 'ref:cap',
    });
    const refundSpy = jest.spyOn(adapter, 'refund');

    const first = await service.initiateRefund({
      paymentId: auth.paymentId,
      amountCents: 400,
      reason: 'partial',
      actorUserId: 'staff-1',
      idempotencyKey: `${auth.paymentId}:partial-1`,
    });
    expect(first.status).toBe('SUCCEEDED');

    const replay = await service.initiateRefund({
      paymentId: auth.paymentId,
      amountCents: 400,
      reason: 'partial',
      actorUserId: 'staff-1',
      idempotencyKey: `${auth.paymentId}:partial-1`,
    });
    expect(replay.id).toBe(first.id);

    await expect(
      service.initiateRefund({
        paymentId: auth.paymentId,
        amountCents: 500,
        reason: 'conflict',
        actorUserId: 'staff-1',
        idempotencyKey: `${auth.paymentId}:partial-1`,
      }),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.PAY_IDEMPOTENCY_CONFLICT },
    });
    expect(refundSpy).toHaveBeenCalledTimes(1);

    await service.initiateRefund({
      paymentId: auth.paymentId,
      amountCents: 600,
      reason: 'remainder',
      actorUserId: 'staff-1',
      idempotencyKey: `${auth.paymentId}:partial-2`,
    });

    await expect(
      service.initiateRefund({
        paymentId: auth.paymentId,
        amountCents: 1,
        reason: 'over',
        actorUserId: 'staff-1',
        idempotencyKey: `${auth.paymentId}:over`,
      }),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.PAY_REFUND_INELIGIBLE },
    });

    await expect(
      service.initiateRefund({
        paymentId: auth.paymentId,
        amountCents: 0,
        reason: 'zero',
        actorUserId: 'staff-1',
        idempotencyKey: `${auth.paymentId}:zero`,
      }),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.PAY_REFUND_INELIGIBLE },
    });
  });

  it('does not count failed refunds toward the refundable amount', async () => {
    const auth = await service.authorizeForOrder({
      orderId: 'ord-fail-ref',
      paymentMethodId: 'spm-1',
      amountCents: 500,
      idempotencyKey: 'failref:auth',
    });
    await service.capturePayment({
      paymentId: auth.paymentId,
      idempotencyKey: 'failref:cap',
    });
    prisma._store.refunds.push({
      paymentId: auth.paymentId,
      amountCents: 500,
      status: 'FAILED',
      idempotencyKey: 'failed-key',
    });
    const refund = await service.initiateRefund({
      paymentId: auth.paymentId,
      amountCents: 500,
      reason: 'retry',
      actorUserId: 'staff-1',
      idempotencyKey: `${auth.paymentId}:retry`,
    });
    expect(refund.status).toBe('SUCCEEDED');
  });

  it('exposes non-secret provider config', () => {
    const config = service.getProviderConfig();
    expect(config.provider).toBe('simulated');
    expect(config.mode).toBe('sandbox');
    expect(config.webhookEndpointUrl).toContain('/v1/webhooks/payments');
    expect(JSON.stringify(config)).not.toContain('secret');
  });

  it('serializes concurrent refunds so they cannot over-refund', async () => {
    const auth = await service.authorizeForOrder({
      orderId: 'ord-conc-ref',
      paymentMethodId: 'spm-1',
      amountCents: 1000,
      idempotencyKey: 'conc:auth',
    });
    await service.capturePayment({
      paymentId: auth.paymentId,
      idempotencyKey: 'conc:cap',
    });

    let chain = Promise.resolve();
    prisma.$transaction.mockImplementation(
      (fn: (tx: PrismaMock) => Promise<unknown>) => {
        const run = chain.then(() => fn(prisma));
        chain = run.then(
          () => undefined,
          () => undefined,
        );
        return run;
      },
    );

    const results = await Promise.allSettled([
      service.initiateRefund({
        paymentId: auth.paymentId,
        amountCents: 600,
        reason: 'first',
        actorUserId: 'staff-1',
        idempotencyKey: `${auth.paymentId}:conc-a`,
      }),
      service.initiateRefund({
        paymentId: auth.paymentId,
        amountCents: 600,
        reason: 'second',
        actorUserId: 'staff-1',
        idempotencyKey: `${auth.paymentId}:conc-b`,
      }),
    ]);
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it('does not emit capture-success handlers on failed authorization', async () => {
    const onPaymentCaptured = jest.fn();
    service.setOutcomeHandlers({ onPaymentCaptured });
    await service.authorizeForOrder({
      orderId: 'ord-no-redeem',
      paymentMethodId: 'spm-1',
      amountCents: 1000,
      idempotencyKey: 'noredeem:auth',
      forceOutcome: 'decline',
    });
    expect(onPaymentCaptured).not.toHaveBeenCalled();
  });

  it('does not emit onPaymentCaptured when capture fails', async () => {
    const onPaymentCaptured = jest.fn();
    service.setOutcomeHandlers({ onPaymentCaptured });
    const auth = await service.authorizeForOrder({
      orderId: 'ord-cap-fail',
      paymentMethodId: 'spm-1',
      amountCents: 1000,
      idempotencyKey: 'capfail:auth',
    });
    const result = await service.capturePayment({
      paymentId: auth.paymentId,
      idempotencyKey: 'capfail:cap',
      forceOutcome: 'decline',
    });
    expect(result.lifecycleState).toBe(PaymentLifecycleState.CAPTURE_FAILED);
    expect(onPaymentCaptured).not.toHaveBeenCalled();
  });

  it('does not re-fire onPaymentCaptured for already-CAPTURED capture or webhook', async () => {
    const onPaymentCaptured = jest.fn();
    service.setOutcomeHandlers({ onPaymentCaptured });
    const auth = await service.authorizeForOrder({
      orderId: 'ord-cap-once',
      paymentMethodId: 'spm-1',
      amountCents: 700,
      idempotencyKey: 'caponce:auth',
    });
    await service.capturePayment({
      paymentId: auth.paymentId,
      idempotencyKey: 'caponce:cap',
    });
    expect(onPaymentCaptured).toHaveBeenCalledTimes(1);

    await service.capturePayment({
      paymentId: auth.paymentId,
      idempotencyKey: 'caponce:cap-again',
    });
    expect(onPaymentCaptured).toHaveBeenCalledTimes(1);

    const payment = prisma._store.payments.find((p) => p.id === auth.paymentId);
    await service.ingestWebhook({
      secretHeader: 'test-webhook-secret-16',
      envelope: {
        provider: 'simulated',
        providerEventId: 'evt-captured-replay',
        type: 'payment.captured',
        paymentRef: payment?.providerPaymentRef,
      },
    });
    expect(onPaymentCaptured).toHaveBeenCalledTimes(1);
  });

  it('accepts expanded simulated webhook event types', async () => {
    const auth = await service.authorizeForOrder({
      orderId: 'ord-wh',
      paymentMethodId: 'spm-1',
      amountCents: 800,
      idempotencyKey: 'wh:auth',
    });
    const payment = prisma._store.payments.find((p) => p.id === auth.paymentId);
    expect(payment?.providerPaymentRef).toBeTruthy();

    const captured = await service.ingestWebhook({
      secretHeader: 'test-webhook-secret-16',
      envelope: {
        provider: 'simulated',
        providerEventId: 'evt-captured',
        type: 'payment.captured',
        paymentRef: payment?.providerPaymentRef,
      },
    });
    expect(captured.duplicate).toBe(false);
    expect(
      prisma._store.payments.find((p) => p.id === auth.paymentId)
        ?.lifecycleState,
    ).toBe(PaymentLifecycleState.CAPTURED);

    const refunded = await service.ingestWebhook({
      secretHeader: 'test-webhook-secret-16',
      envelope: {
        provider: 'simulated',
        providerEventId: 'evt-refunded',
        type: 'payment.refunded',
        paymentRef: payment?.providerPaymentRef,
      },
    });
    expect(refunded.duplicate).toBe(false);
    expect(
      prisma._store.payments.find((p) => p.id === auth.paymentId)
        ?.lifecycleState,
    ).toBe(PaymentLifecycleState.REFUNDED);

    const failedAuth = await service.authorizeForOrder({
      orderId: 'ord-wh-fail',
      paymentMethodId: 'spm-1',
      amountCents: 200,
      idempotencyKey: 'wh:fail-auth',
    });
    const failedPayment = prisma._store.payments.find(
      (p) => p.id === failedAuth.paymentId,
    );
    await service.ingestWebhook({
      secretHeader: 'test-webhook-secret-16',
      envelope: {
        provider: 'simulated',
        providerEventId: 'evt-auth-failed',
        type: 'payment.authorization_failed',
        paymentRef: failedPayment?.providerPaymentRef,
      },
    });
    expect(
      prisma._store.payments.find((p) => p.id === failedAuth.paymentId)
        ?.lifecycleState,
    ).toBe(PaymentLifecycleState.AUTHORIZATION_FAILED);
  });
});
