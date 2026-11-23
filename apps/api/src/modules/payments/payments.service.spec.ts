import {
  BadRequestException,
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentLifecycleState,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PaymentProviderRegistry } from './payment-provider.registry';
import {
  canonicalCaptureIdempotencyKey,
  isConfirmedRefundFailureCode,
  PaymentsService,
} from './payments.service';
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
  processingStatus?: string;
  claimToken?: string | null;
  leaseExpiresAt?: Date | null;
  attemptCount?: number;
  lastError?: string | null;
  appliedAt?: Date | null;
  providerRefundRef?: string | null;
  lastErrorCode?: string | null;
  purpose?: string;
  currency?: string;
  errorCode?: string | null;
  createdAt?: Date;
};

type RefundWhere = {
  id?: string | { not: string };
  paymentId?: string;
  status?: string | { in: string[] };
  providerRefundRef?: string | null | { not: null };
  idempotencyKey?: string | { startsWith: string };
  amountCents?: number;
  OR?: RefundWhere[];
};

function matchRefundWhere(r: StoreRow, where: RefundWhere = {}): boolean {
  if (where.OR && !where.OR.some((w) => matchRefundWhere(r, w))) {
    return false;
  }
  if (where.id !== undefined) {
    if (
      typeof where.id === 'string' ? r.id !== where.id : r.id === where.id.not
    ) {
      return false;
    }
  }
  if (where.paymentId !== undefined && r.paymentId !== where.paymentId) {
    return false;
  }
  if (where.status !== undefined) {
    if (typeof where.status === 'string') {
      if (r.status !== where.status) return false;
    } else if (!where.status.in.includes(r.status as string)) {
      return false;
    }
  }
  if (where.providerRefundRef !== undefined) {
    const ref = r.providerRefundRef ?? null;
    if (where.providerRefundRef === null) {
      if (ref !== null) return false;
    } else if (typeof where.providerRefundRef === 'string') {
      if (ref !== where.providerRefundRef) return false;
    } else if (ref === null) {
      return false; // { not: null }
    }
  }
  if (where.idempotencyKey !== undefined) {
    if (typeof where.idempotencyKey === 'string') {
      if (r.idempotencyKey !== where.idempotencyKey) return false;
    } else if (!r.idempotencyKey?.startsWith(where.idempotencyKey.startsWith)) {
      return false;
    }
  }
  if (where.amountCents !== undefined && r.amountCents !== where.amountCents) {
    return false;
  }
  return true;
}

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
    updateMany: jest.Mock;
    findMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  refund: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
    aggregate: jest.Mock;
  };
  subscriptionRenewalAttempt: {
    findMany: jest.Mock;
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
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) => {
        const row = store.payments.find((p) => p.id === where.id);
        if (!row) {
          throw new Error(`payment ${where.id} not found`);
        }
        return Promise.resolve(row);
      }),
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
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: {
            id: string;
            lifecycleState?: string | { in?: string[] };
            lastErrorCode?: string | null;
          };
          data: StoreRow;
        }) => {
          const idx = store.payments.findIndex((p) => {
            if (p.id !== where.id) {
              return false;
            }
            if (
              where.lastErrorCode !== undefined &&
              (p.lastErrorCode ?? null) !== where.lastErrorCode
            ) {
              return false;
            }
            if (where.lifecycleState == null) {
              return true;
            }
            if (typeof where.lifecycleState === 'string') {
              return p.lifecycleState === where.lifecycleState;
            }
            if (where.lifecycleState.in) {
              return where.lifecycleState.in.includes(
                p.lifecycleState as string,
              );
            }
            return true;
          });
          if (idx < 0) {
            return Promise.resolve({ count: 0 });
          }
          store.payments[idx] = { ...store.payments[idx], ...data };
          return Promise.resolve({ count: 1 });
        },
      ),
      findMany: jest.fn(({ where }: { where?: { orderId?: string } } = {}) => {
        const rows = where?.orderId
          ? store.payments.filter((p) => p.orderId === where.orderId)
          : store.payments;
        return Promise.resolve([...rows]);
      }),
    },
    subscriptionRenewalAttempt: {
      findMany: jest.fn(() => Promise.resolve([])),
    },
    refund: {
      findUnique: jest.fn(
        ({ where }: { where: { idempotencyKey?: string; id?: string } }) => {
          if (where.idempotencyKey) {
            return Promise.resolve(
              store.refunds.find(
                (r) => r.idempotencyKey === where.idempotencyKey,
              ) ?? null,
            );
          }
          if (where.id) {
            return Promise.resolve(
              store.refunds.find((r) => r.id === where.id) ?? null,
            );
          }
          return Promise.resolve(null);
        },
      ),
      findFirst: jest.fn(({ where }: { where?: RefundWhere } = {}) =>
        Promise.resolve(
          store.refunds.find((r) => matchRefundWhere(r, where)) ?? null,
        ),
      ),
      findMany: jest.fn(({ where }: { where?: RefundWhere } = {}) =>
        Promise.resolve(
          store.refunds.filter((r) => matchRefundWhere(r, where)),
        ),
      ),
      create: jest.fn(({ data }: { data: StoreRow }) => {
        const dup = store.refunds.find(
          (r) =>
            r.idempotencyKey === data.idempotencyKey ||
            (data.providerRefundRef != null &&
              r.providerRefundRef === data.providerRefundRef),
        );
        if (dup) {
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError('Unique', {
              code: 'P2002',
              clientVersion: 'test',
            }),
          );
        }
        const row: StoreRow = {
          id: `ref-${store.refunds.length + 1}`,
          providerRefundRef: null,
          createdAt: new Date(),
          ...data,
          status: data.status ?? 'SUCCEEDED',
        };
        store.refunds.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: StoreRow }) => {
          const idx = store.refunds.findIndex((r) => r.id === where.id);
          store.refunds[idx] = { ...store.refunds[idx], ...data };
          return Promise.resolve(store.refunds[idx]);
        },
      ),
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) => {
        const row = store.refunds.find((r) => r.id === where.id);
        if (!row) {
          throw new Error(`refund ${where.id} not found`);
        }
        return Promise.resolve(row);
      }),
      updateMany: jest.fn(
        ({ where, data }: { where: RefundWhere; data: StoreRow }) => {
          const idx = store.refunds.findIndex((r) =>
            matchRefundWhere(r, where),
          );
          if (idx < 0) {
            return Promise.resolve({ count: 0 });
          }
          const nextRef = data.providerRefundRef;
          if (
            nextRef != null &&
            store.refunds.some(
              (r, i) => i !== idx && r.providerRefundRef === nextRef,
            )
          ) {
            return Promise.reject(
              new Prisma.PrismaClientKnownRequestError('Unique', {
                code: 'P2002',
                clientVersion: 'test',
              }),
            );
          }
          store.refunds[idx] = { ...store.refunds[idx], ...data };
          return Promise.resolve({ count: 1 });
        },
      ),
      count: jest.fn(({ where }: { where?: RefundWhere } = {}) =>
        Promise.resolve(
          store.refunds.filter((r) => matchRefundWhere(r, where)).length,
        ),
      ),
      aggregate: jest.fn(({ where }: { where?: RefundWhere } = {}) => {
        const sum = store.refunds
          .filter((r) => matchRefundWhere(r, where))
          .reduce((acc, r) => acc + (r.amountCents ?? 0), 0);
        return Promise.resolve({ _sum: { amountCents: sum } });
      }),
    },
    paymentWebhookEvent: {
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: {
            id?: string;
            provider_providerEventId?: {
              provider: string;
              providerEventId: string;
            };
          };
        }) => {
          if (where.id) {
            return Promise.resolve(
              store.webhooks.find((w) => w.id === where.id) ?? null,
            );
          }
          if (where.provider_providerEventId) {
            return Promise.resolve(
              store.webhooks.find(
                (w) =>
                  w.provider === where.provider_providerEventId!.provider &&
                  w.providerEventId ===
                    where.provider_providerEventId!.providerEventId,
              ) ?? null,
            );
          }
          return Promise.resolve(null);
        },
      ),
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
          processingStatus: 'RECEIVED',
          attemptCount: 0,
          ...data,
        };
        store.webhooks.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ data }: { data: StoreRow }) => Promise.resolve(data)),
    },
    order: {
      findUnique: jest.fn(() => Promise.resolve({ patientUserId: 'user-1' })),
    },
    $transaction: jest.fn((fn: (tx: PrismaMock) => Promise<unknown>) =>
      fn(prisma),
    ),
    $executeRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = Array.from(strings).join(' ').toLowerCase();
        if (sql.includes('select id from payments')) {
          return Promise.resolve(1);
        }
        if (!sql.includes('payment_webhook_events')) {
          return Promise.resolve(1);
        }

        const isClaimable = (wh: StoreRow) =>
          wh.processingStatus === 'RECEIVED' ||
          wh.processingStatus === 'FAILED' ||
          (wh.processingStatus === 'PROCESSING' &&
            wh.leaseExpiresAt != null &&
            wh.leaseExpiresAt < new Date());

        if (sql.includes("processing_status = 'processing'")) {
          // claimToken, leaseSeconds, event.id
          const claimToken = values[0] as string;
          const eventId = values[2] as string;
          const wh = store.webhooks.find((w) => w.id === eventId);
          if (!wh || !isClaimable(wh)) {
            return Promise.resolve(0);
          }
          wh.claimToken = claimToken;
          wh.processingStatus = 'PROCESSING';
          wh.attemptCount = (wh.attemptCount ?? 0) + 1;
          wh.leaseExpiresAt = new Date(Date.now() + 45_000);
          return Promise.resolve(1);
        }

        if (sql.includes("processing_status = 'applied'")) {
          // paymentId, event.id, claimToken
          const paymentId = values[0] as string | null;
          const eventId = values[1] as string;
          const token = values[2] as string;
          const wh = store.webhooks.find((w) => w.id === eventId);
          if (
            !wh ||
            wh.claimToken !== token ||
            wh.processingStatus !== 'PROCESSING'
          ) {
            return Promise.resolve(0);
          }
          wh.processingStatus = 'APPLIED';
          wh.appliedAt = new Date();
          wh.paymentId = paymentId ?? wh.paymentId;
          wh.lastError = null;
          wh.claimToken = null;
          wh.leaseExpiresAt = null;
          return Promise.resolve(1);
        }

        if (sql.includes("processing_status = 'failed'")) {
          // message, event.id, claimToken
          const message = values[0] as string;
          const eventId = values[1] as string;
          const token = values[2] as string;
          const wh = store.webhooks.find((w) => w.id === eventId);
          if (!wh || wh.claimToken !== token) {
            return Promise.resolve(0);
          }
          wh.processingStatus = 'FAILED';
          wh.lastError = message;
          wh.claimToken = null;
          wh.leaseExpiresAt = null;
          return Promise.resolve(1);
        }

        return Promise.resolve(1);
      },
    ),
    _store: store,
  };

  return prisma;
}

describe('PaymentsService (simulated gateway)', () => {
  let prisma: PrismaMock;
  let service: PaymentsService;
  let adapter: SimulatedPaymentAdapter;
  // Mutable per-test: lets Phase 6F tests force the simulated gateway mid-flow.
  let simulatedForce: 'decline' | 'timeout' | 'action_required' | null = null;

  beforeEach(async () => {
    simulatedForce = null;
    prisma = createPrismaMock();
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'payments.provider') return 'simulated';
        if (key === 'payments.simulatedForce') return simulatedForce;
        if (key === 'payments.webhookLeaseSeconds') return 45;
        if (key === 'payments.simulatedAuthHoldHours') return 168;
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
      null,
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

  it('skips gateway for zero-total authorize', async () => {
    const result = await service.authorizeForOrder({
      orderId: 'ord-zero',
      paymentMethodId: 'spm-1',
      currency: 'USD',
      amountCents: 0,
      idempotencyKey: 'zero:authorize',
    });
    expect(result.paymentId).toBeNull();
    expect(result.lifecycleState).toBe(PaymentLifecycleState.CAPTURED);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('authorizes and captures idempotently', async () => {
    const auth = await service.authorizeForOrder({
      orderId: 'ord-1',
      subscriptionId: 'sub-1',
      paymentMethodId: 'spm-1',
      currency: 'USD',
      amountCents: 5000,
      idempotencyKey: 'renewal:sub-1:key:authorize',
    });
    expect(auth.status).toBe(PaymentStatus.AUTHORIZED_OR_CAPTURED);
    expect(auth.lifecycleState).toBe(PaymentLifecycleState.AUTHORIZED);

    const replay = await service.authorizeForOrder({
      orderId: 'ord-1',
      subscriptionId: 'sub-1',
      paymentMethodId: 'spm-1',
      currency: 'USD',
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
      currency: 'USD',
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
        currency: 'USD',
        amountCents: 1000,
        idempotencyKey: 'renewal:sub:missing:authorize',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects idempotency key body mismatch', async () => {
    await service.authorizeForOrder({
      orderId: 'ord-4',
      paymentMethodId: 'spm-1',
      currency: 'USD',
      amountCents: 1000,
      idempotencyKey: 'renewal:sub:mismatch:authorize',
    });
    await expect(
      service.authorizeForOrder({
        orderId: 'ord-OTHER',
        paymentMethodId: 'spm-1',
        currency: 'USD',
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
      currency: 'USD',
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
      currency: 'USD',
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
        currency: 'USD',
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
      currency: 'USD',
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

  it('does not count confirmed-failure refunds toward the refundable amount', async () => {
    const auth = await service.authorizeForOrder({
      orderId: 'ord-fail-ref',
      paymentMethodId: 'spm-1',
      currency: 'USD',
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
      errorCode: ErrorCodes.PAY_REFUND_PROVIDER_FAILED,
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

  it('keeps uncertain FAILED refunds reserved against the refundable amount', async () => {
    const auth = await service.authorizeForOrder({
      orderId: 'ord-fail-uncertain',
      paymentMethodId: 'spm-1',
      currency: 'USD',
      amountCents: 500,
      idempotencyKey: 'failunc:auth',
    });
    await service.capturePayment({
      paymentId: auth.paymentId,
      idempotencyKey: 'failunc:cap',
    });
    prisma._store.refunds.push({
      paymentId: auth.paymentId,
      amountCents: 500,
      status: 'FAILED',
      idempotencyKey: 'failed-uncertain-key',
      errorCode: null,
    });
    await expect(
      service.initiateRefund({
        paymentId: auth.paymentId,
        amountCents: 500,
        reason: 'retry',
        actorUserId: 'staff-1',
        idempotencyKey: `${auth.paymentId}:retry`,
      }),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.PAY_REFUND_INELIGIBLE },
    });
  });

  it('exposes non-secret provider config', () => {
    const config = service.getProviderConfig();
    expect(config.provider).toBe('simulated');
    expect(config.mode).toBe('sandbox');
    expect(config.webhookEndpointUrl).toContain('/v1/webhooks/payments');
    expect(JSON.stringify(config)).not.toContain('secret');
  });

  it('cancelProviderRecurring returns unsupported without throwing', async () => {
    const result = await service.cancelProviderRecurring('sub-1', 'prov_sub_1');
    expect(result).toEqual({ ok: false, unsupported: true });
  });

  it('cancelProviderRecurring no-ops when ref missing', async () => {
    await expect(
      service.cancelProviderRecurring('sub-1', null),
    ).resolves.toEqual({ ok: true });
  });

  it('serializes concurrent refunds so they cannot over-refund', async () => {
    const auth = await service.authorizeForOrder({
      orderId: 'ord-conc-ref',
      paymentMethodId: 'spm-1',
      currency: 'USD',
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
      currency: 'USD',
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
      currency: 'USD',
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
      currency: 'USD',
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
      currency: 'USD',
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
    // D6: payment.refunded is notice-only — it never moves money or state.
    expect(
      prisma._store.payments.find((p) => p.id === auth.paymentId)
        ?.lifecycleState,
    ).toBe(PaymentLifecycleState.CAPTURED);
    expect(prisma._store.refunds).toHaveLength(0);

    const failedAuth = await service.authorizeForOrder({
      orderId: 'ord-wh-fail',
      paymentMethodId: 'spm-1',
      currency: 'USD',
      amountCents: 200,
      idempotencyKey: 'wh:fail-auth',
      forceOutcome: 'timeout',
    });
    expect(failedAuth.lifecycleState).toBe(
      PaymentLifecycleState.PENDING_AUTHORIZATION,
    );
    const failedPayment = prisma._store.payments.find(
      (p) => p.id === failedAuth.paymentId,
    );
    // Timeout leaves no provider ref; attach one so the webhook can target the row.
    expect(failedPayment).toBeTruthy();
    failedPayment!.providerPaymentRef = 'sim_wh_fail_ref';
    const failedEnvelope = {
      provider: 'simulated',
      providerEventId: 'evt-auth-failed',
      type: 'payment.authorization_failed',
      paymentRef: 'sim_wh_fail_ref',
    };
    // D14: the provider still reports an unknown (timeout) state — the event alone
    // must not terminal-fail the payment; it is retried instead.
    await expect(
      service.ingestWebhook({
        secretHeader: 'test-webhook-secret-16',
        envelope: failedEnvelope,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      prisma._store.payments.find((p) => p.id === failedAuth.paymentId)
        ?.lifecycleState,
    ).toBe(PaymentLifecycleState.PENDING_AUTHORIZATION);

    // Redelivery after the provider confirms the failure finalizes it.
    jest.spyOn(adapter, 'retrieveAuthorization').mockResolvedValue({
      outcomeClass: 'CONFIRMED_FAILURE',
      lifecycleHint: 'AUTHORIZATION_FAILED',
      providerStatusRaw: 'failed',
    });
    await service.ingestWebhook({
      secretHeader: 'test-webhook-secret-16',
      envelope: failedEnvelope,
    });
    expect(
      prisma._store.payments.find((p) => p.id === failedAuth.paymentId)
        ?.lifecycleState,
    ).toBe(PaymentLifecycleState.AUTHORIZATION_FAILED);
  });

  // ---------------------------------------------------------------------------
  // Phase 6F
  // ---------------------------------------------------------------------------
  describe('Phase 6F', () => {
    const SECRET = 'test-webhook-secret-16';

    const paymentRow = (id: string | null | undefined): StoreRow => {
      const row = prisma._store.payments.find((p) => p.id === id);
      if (!row) {
        throw new Error(`payment ${id} missing from store`);
      }
      return row;
    };

    // NOTE: the prisma mock replaces store rows on update, so always re-read via
    // paymentRow()/refundRow() after service calls instead of holding a reference.
    const refundRow = (id: string | null | undefined): StoreRow => {
      const row = prisma._store.refunds.find((r) => r.id === id);
      if (!row) {
        throw new Error(`refund ${id} missing from store`);
      }
      return row;
    };

    async function capturedPayment(
      orderId: string,
      amountCents = 1000,
    ): Promise<StoreRow> {
      const auth = await service.authorizeForOrder({
        orderId,
        paymentMethodId: 'spm-1',
        currency: 'USD',
        amountCents,
        idempotencyKey: `${orderId}:auth`,
      });
      await service.capturePayment({
        paymentId: auth.paymentId,
        idempotencyKey: `${orderId}:cap`,
      });
      const row = paymentRow(auth.paymentId);
      // authorizeForOrder defaults to RENEWAL; reconcile treats that as renewal-owned.
      row.purpose = PaymentPurpose.CHECKOUT;
      return row;
    }

    /** PENDING_AUTHORIZATION row (timeout leaves no provider refs). */
    async function pendingAuthPayment(
      orderId: string,
      purpose: PaymentPurpose = PaymentPurpose.CHECKOUT,
    ): Promise<StoreRow> {
      simulatedForce = 'timeout';
      const result = await service.authorizeForOrder({
        orderId,
        paymentMethodId: 'spm-1',
        currency: 'USD',
        amountCents: 500,
        idempotencyKey: `${orderId}:auth`,
      });
      simulatedForce = null;
      const row = paymentRow(result.paymentId);
      expect(row.lifecycleState).toBe(
        PaymentLifecycleState.PENDING_AUTHORIZATION,
      );
      row.purpose = purpose;
      return row;
    }

    function webhook(envelope: {
      providerEventId: string;
      type: string;
      paymentRef?: string;
      data?: Record<string, unknown>;
    }) {
      return service.ingestWebhook({
        secretHeader: SECRET,
        envelope: { provider: 'simulated', ...envelope },
      });
    }

    function refundUpdate(
      eventId: string,
      payment: StoreRow,
      refund: { id: string; amount: number; status: string },
    ) {
      return webhook({
        providerEventId: eventId,
        type: 'refund.provider_update',
        paymentRef: payment.providerPaymentRef,
        data: {
          object: {
            id: refund.id,
            object: 'refund',
            amount: refund.amount,
            currency: 'usd',
            status: refund.status,
            payment_intent: payment.providerPaymentRef,
          },
        },
      });
    }

    function seedStaffPending(
      payment: StoreRow,
      key: string,
      amountCents: number,
    ): StoreRow {
      const row: StoreRow = {
        id: `ref-${key}`,
        paymentId: payment.id,
        amountCents,
        status: 'PENDING',
        providerRefundRef: null,
        idempotencyKey: key,
        reason: 'staff',
        actorUserId: 'staff-1',
      };
      prisma._store.refunds.push(row);
      paymentRow(payment.id).lifecycleState =
        PaymentLifecycleState.REFUND_PENDING;
      return row;
    }

    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    // ----- D1 / D2 ---------------------------------------------------------
    describe('D1/D2: ambiguous refund persists + recovers providerRefundRef', () => {
      it('D1: a timed-out refund stays PENDING and persists providerRefundRef', async () => {
        const payment = await capturedPayment('ord-d1');
        simulatedForce = 'timeout';

        const refund = await service.initiateRefund({
          paymentId: payment.id!,
          amountCents: 600,
          reason: 'timeout',
          actorUserId: 'staff-1',
          idempotencyKey: `${payment.id}:d1`,
        });

        expect(refund.status).toBe('PENDING');
        expect(refund.providerRefundRef).toMatch(/^sim_ref_/);
        expect(refund.errorCode).toBe(ErrorCodes.PAY_PROVIDER_UNAVAILABLE);
        const stored = prisma._store.refunds.find((r) => r.id === refund.id);
        expect(stored?.providerRefundRef).toBe(refund.providerRefundRef);
        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.REFUND_PENDING,
        );
      });

      it('D2: re-binds a PENDING refund with a null ref via listRefundsByPaymentRef', async () => {
        const payment = await capturedPayment('ord-d2');
        simulatedForce = 'timeout';
        const refund = await service.initiateRefund({
          paymentId: payment.id!,
          amountCents: 600,
          reason: 'timeout',
          actorUserId: 'staff-1',
          idempotencyKey: `${payment.id}:d2`,
        });
        simulatedForce = null;
        const originalRef = refund.providerRefundRef;
        // Simulate the ref never having been persisted locally.
        refundRow(refund.id).providerRefundRef = null;
        const listSpy = jest.spyOn(adapter, 'listRefundsByPaymentRef');

        const replay = await service.initiateRefund({
          paymentId: payment.id!,
          amountCents: 600,
          reason: 'timeout',
          actorUserId: 'staff-1',
          idempotencyKey: `${payment.id}:d2`,
        });

        expect(listSpy).toHaveBeenCalledWith({
          providerPaymentRef: payment.providerPaymentRef,
        });
        expect(refundRow(refund.id).providerRefundRef).toBe(originalRef);
        // Provider still reports pending/unknown: never failed from absence.
        expect(replay.status).toBe('PENDING');
      });

      it('D2: an inconclusive provider list leaves the refund PENDING without binding', async () => {
        const payment = await capturedPayment('ord-d2-inc');
        const row = seedStaffPending(payment, `${payment.id}:inc`, 300);
        jest.spyOn(adapter, 'listRefundsByPaymentRef').mockResolvedValue({
          outcomeClass: 'TIMEOUT',
          refunds: [],
        });

        const result = await service.initiateRefund({
          paymentId: payment.id!,
          amountCents: 300,
          reason: 'staff',
          actorUserId: 'staff-1',
          idempotencyKey: `${payment.id}:inc`,
        });

        expect(result.status).toBe('PENDING');
        expect(refundRow(row.id).providerRefundRef).toBeNull();
        expect(refundRow(row.id).status).toBe('PENDING');
      });
    });

    // ----- D3 --------------------------------------------------------------
    describe('D3: monotonic refund statuses', () => {
      it('webhook cannot regress a SUCCEEDED refund to PENDING or FAILED', async () => {
        const payment = await capturedPayment('ord-d3');
        const refund = await service.initiateRefund({
          paymentId: payment.id!,
          amountCents: 400,
          reason: 'partial',
          actorUserId: 'staff-1',
          idempotencyKey: `${payment.id}:d3`,
        });
        expect(refund.status).toBe('SUCCEEDED');
        const ref = refund.providerRefundRef as string;

        await refundUpdate('evt-d3-pending', payment, {
          id: ref,
          amount: 400,
          status: 'pending',
        });
        await refundUpdate('evt-d3-failed', payment, {
          id: ref,
          amount: 400,
          status: 'failed',
        });

        const stored = prisma._store.refunds.find((r) => r.id === refund.id);
        expect(stored?.status).toBe('SUCCEEDED');
        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.CAPTURED,
        );
        expect(paymentRow(payment.id)).toMatchObject({
          refundedAmountCents: 400,
        });
        expect(prisma._store.refunds).toHaveLength(1);
      });

      it('a PENDING refund finalizes once on succeeded and ignores later failed/pending', async () => {
        const payment = await capturedPayment('ord-d3b');
        simulatedForce = 'timeout';
        const refund = await service.initiateRefund({
          paymentId: payment.id!,
          amountCents: 500,
          reason: 'timeout',
          actorUserId: 'staff-1',
          idempotencyKey: `${payment.id}:d3b`,
        });
        simulatedForce = null;
        const ref = refund.providerRefundRef as string;
        const stored = {
          get status() {
            return refundRow(refund.id).status;
          },
        };

        await refundUpdate('evt-d3b-pending', payment, {
          id: ref,
          amount: 500,
          status: 'pending',
        });
        expect(stored.status).toBe('PENDING');

        await refundUpdate('evt-d3b-ok', payment, {
          id: ref,
          amount: 500,
          status: 'succeeded',
        });
        expect(stored.status).toBe('SUCCEEDED');
        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.CAPTURED,
        );

        await refundUpdate('evt-d3b-late-fail', payment, {
          id: ref,
          amount: 500,
          status: 'failed',
        });
        await refundUpdate('evt-d3b-late-pending', payment, {
          id: ref,
          amount: 500,
          status: 'pending',
        });
        expect(stored.status).toBe('SUCCEEDED');
        expect(prisma._store.refunds).toHaveLength(1);
      });

      it('an externally created refund is created PENDING then finalized exactly once', async () => {
        const payment = await capturedPayment('ord-d3c');

        await refundUpdate('evt-d3c-1', payment, {
          id: 're_ext_1',
          amount: 250,
          status: 'succeeded',
        });
        await refundUpdate('evt-d3c-2', payment, {
          id: 're_ext_1',
          amount: 250,
          status: 'pending',
        });

        expect(prisma._store.refunds).toHaveLength(1);
        expect(prisma._store.refunds[0]).toMatchObject({
          providerRefundRef: 're_ext_1',
          status: 'SUCCEEDED',
          amountCents: 250,
        });
      });
    });

    // ----- D4 --------------------------------------------------------------
    describe('D4: strict refund webhook correlation', () => {
      it('an in-flight staff PENDING refund (null ref) blocks creating a second row', async () => {
        const payment = await capturedPayment('ord-d4');
        seedStaffPending(payment, 'staff-d4', 300);

        await expect(
          refundUpdate('evt-d4', payment, {
            id: 're_other',
            amount: 500,
            status: 'succeeded',
          }),
        ).rejects.toMatchObject({
          response: {
            code: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matcher
            message: expect.stringContaining('in_flight_staff_refund'),
          },
        });
        expect(prisma._store.refunds).toHaveLength(1);
        expect(prisma._store.refunds[0].providerRefundRef).toBeNull();
        expect(
          prisma._store.webhooks.find((w) => w.providerEventId === 'evt-d4')
            ?.processingStatus,
        ).toBe('FAILED');
      });

      it('multiple same-amount staff PENDING refunds are ambiguous and never matched by amount', async () => {
        const payment = await capturedPayment('ord-d4-amb');
        seedStaffPending(payment, 'staff-a', 300);
        seedStaffPending(payment, 'staff-b', 300);

        await expect(
          refundUpdate('evt-d4-amb', payment, {
            id: 're_amb',
            amount: 300,
            status: 'succeeded',
          }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(
          prisma._store.refunds.every((r) => r.providerRefundRef == null),
        ).toBe(true);
        expect(prisma._store.refunds).toHaveLength(2);
      });

      it('a single exact-amount staff PENDING refund is reused, never duplicated', async () => {
        const payment = await capturedPayment('ord-d4-reuse');
        const staff = seedStaffPending(payment, 'staff-reuse', 300);

        await refundUpdate('evt-d4-reuse', payment, {
          id: 're_reuse',
          amount: 300,
          status: 'succeeded',
        });

        expect(prisma._store.refunds).toHaveLength(1);
        expect(refundRow(staff.id)).toMatchObject({
          providerRefundRef: 're_reuse',
          status: 'SUCCEEDED',
        });
        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.CAPTURED,
        );
      });

      it('REFUND_PENDING without a correlatable refund row is a retryable conflict', async () => {
        const payment = await capturedPayment('ord-d4-nopend');
        paymentRow(payment.id).lifecycleState =
          PaymentLifecycleState.REFUND_PENDING;

        await expect(
          refundUpdate('evt-d4-nopend', payment, {
            id: 're_nopend',
            amount: 100,
            status: 'succeeded',
          }),
        ).rejects.toMatchObject({
          response: {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matcher
            message: expect.stringContaining('in_flight_staff_refund'),
          },
        });
        expect(prisma._store.refunds).toHaveLength(0);
      });

      it('rejects a refund whose payment_intent does not match the payment', async () => {
        const payment = await capturedPayment('ord-d4-pi');

        await expect(
          webhook({
            providerEventId: 'evt-d4-pi',
            type: 'refund.provider_update',
            paymentRef: payment.providerPaymentRef,
            data: {
              object: {
                id: 're_pi',
                object: 'refund',
                amount: 100,
                status: 'succeeded',
                payment_intent: 'pi_someone_else',
              },
            },
          }),
        ).rejects.toMatchObject({
          response: {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matcher
            message: expect.stringContaining('ambiguous_refund_correlation'),
          },
        });
        expect(prisma._store.refunds).toHaveLength(0);
      });
    });

    // ----- D6 --------------------------------------------------------------
    describe('D6: payment.refunded is notice-only', () => {
      it('does not create a refund, call the gateway, or change the payment', async () => {
        const payment = await capturedPayment('ord-d6');
        const refundSpy = jest.spyOn(adapter, 'refund');
        const onRefundSucceeded = jest.fn();
        service.setOutcomeHandlers({ onRefundSucceeded });

        const result = await webhook({
          providerEventId: 'evt-d6',
          type: 'payment.refunded',
          paymentRef: payment.providerPaymentRef,
        });

        expect(result).toEqual({ accepted: true, duplicate: false });
        expect(refundSpy).not.toHaveBeenCalled();
        expect(onRefundSucceeded).not.toHaveBeenCalled();
        expect(prisma._store.refunds).toHaveLength(0);
        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.CAPTURED,
        );
        expect(
          prisma._store.webhooks.find((w) => w.providerEventId === 'evt-d6')
            ?.processingStatus,
        ).toBe('APPLIED');
      });

      it('charge_refunded_notice never marks the payment REFUNDED', async () => {
        const payment = await capturedPayment('ord-d6-notice');

        await webhook({
          providerEventId: 'evt-d6-notice',
          type: 'refund.charge_refunded_notice',
          paymentRef: payment.providerPaymentRef,
        });

        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.CAPTURED,
        );
        expect(prisma._store.refunds).toHaveLength(0);
      });
    });

    // ----- D7 --------------------------------------------------------------
    describe('D7: refund balance reservation + void_refund retry keys', () => {
      it('PENDING refunds reserve balance (captured − SUCCEEDED − PENDING)', async () => {
        const payment = await capturedPayment('ord-d7', 1000);
        simulatedForce = 'timeout';
        await service.initiateRefund({
          paymentId: payment.id!,
          amountCents: 600,
          reason: 'first',
          actorUserId: 'staff-1',
          idempotencyKey: `${payment.id}:d7-a`,
        });
        simulatedForce = null;
        // Isolate the balance check from the REFUND_PENDING lifecycle guard.
        paymentRow(payment.id).lifecycleState = PaymentLifecycleState.CAPTURED;

        await expect(
          service.initiateRefund({
            paymentId: payment.id!,
            amountCents: 500,
            reason: 'overlap',
            actorUserId: 'staff-1',
            idempotencyKey: `${payment.id}:d7-b`,
          }),
        ).rejects.toMatchObject({
          response: { code: ErrorCodes.PAY_REFUND_INELIGIBLE },
        });
        expect(prisma._store.refunds).toHaveLength(1);

        const ok = await service.initiateRefund({
          paymentId: payment.id!,
          amountCents: 400,
          reason: 'fits',
          actorUserId: 'staff-1',
          idempotencyKey: `${payment.id}:d7-c`,
        });
        expect(ok.status).toBe('SUCCEEDED');
      });

      it('FAILED void_refund retries with a fresh ":2" key after a conclusive provider list', async () => {
        const payment = await capturedPayment('ord-d7-void', 1000);
        const base = 'void_refund:ord-d7-void';
        prisma._store.refunds.push({
          id: 'ref-failed-base',
          paymentId: payment.id,
          amountCents: 1000,
          status: 'FAILED',
          idempotencyKey: base,
          providerRefundRef: null,
        });
        const refundSpy = jest.spyOn(adapter, 'refund');

        await service.voidOrRefundForOrder({
          orderId: 'ord-d7-void',
          idempotencyKey: base,
        });

        expect(refundSpy).toHaveBeenCalledTimes(1);
        expect(refundSpy.mock.calls[0][0].idempotencyKey).toBe(`${base}:2`);
        const keys = prisma._store.refunds.map((r) => r.idempotencyKey);
        expect(keys).toEqual([base, `${base}:2`]);
        expect(
          prisma._store.refunds.find((r) => r.idempotencyKey === base)?.status,
        ).toBe('FAILED');
        expect(
          prisma._store.refunds.find((r) => r.idempotencyKey === `${base}:2`)
            ?.status,
        ).toBe('SUCCEEDED');
        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.REFUNDED,
        );

        // Replay is a no-op: a SUCCEEDED link exists in the chain.
        await service.voidOrRefundForOrder({
          orderId: 'ord-d7-void',
          idempotencyKey: base,
        });
        expect(refundSpy).toHaveBeenCalledTimes(1);
        expect(prisma._store.refunds).toHaveLength(2);
      });

      it('does not retry while the provider shows an unaccounted active refund', async () => {
        const payment = await capturedPayment('ord-d7-blocked', 1000);
        const base = 'void_refund:ord-d7-blocked';
        prisma._store.refunds.push({
          id: 'ref-failed-base',
          paymentId: payment.id,
          amountCents: 1000,
          status: 'FAILED',
          idempotencyKey: base,
          providerRefundRef: null,
        });
        // Money already moved at the provider under a key we never recorded.
        await adapter.refund({
          providerPaymentRef: payment.providerPaymentRef as string,
          providerCaptureRef: payment.providerCaptureRef as string,
          amountCents: 1000,
          idempotencyKey: 'unrecorded-key',
        });
        const refundSpy = jest.spyOn(adapter, 'refund');

        await service.voidOrRefundForOrder({
          orderId: 'ord-d7-blocked',
          idempotencyKey: base,
        });

        expect(refundSpy).not.toHaveBeenCalled();
        expect(prisma._store.refunds).toHaveLength(1);
      });

      it('does not retry when the provider list is inconclusive', async () => {
        const payment = await capturedPayment('ord-d7-inc', 1000);
        const base = 'void_refund:ord-d7-inc';
        prisma._store.refunds.push({
          id: 'ref-failed-base',
          paymentId: payment.id,
          amountCents: 1000,
          status: 'FAILED',
          idempotencyKey: base,
          providerRefundRef: null,
        });
        jest.spyOn(adapter, 'listRefundsByPaymentRef').mockResolvedValue({
          outcomeClass: 'NETWORK_UNKNOWN',
          refunds: [],
        });
        const refundSpy = jest.spyOn(adapter, 'refund');

        await expect(
          service.voidOrRefundForOrder({
            orderId: 'ord-d7-inc',
            idempotencyKey: base,
          }),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(refundSpy).not.toHaveBeenCalled();
        expect(prisma._store.refunds).toHaveLength(1);
      });
    });

    // ----- D11 -------------------------------------------------------------
    describe('D11: APPLIED finalize lease guard', () => {
      it('throws a lease_lost ConflictException when the APPLIED update affects 0 rows', async () => {
        const payment = await capturedPayment('ord-d11');
        const original = prisma.$executeRaw.getMockImplementation()!;
        prisma.$executeRaw.mockImplementation(
          (strings: TemplateStringsArray, ...values: unknown[]) => {
            const sql = Array.from(strings).join(' ').toLowerCase();
            if (sql.includes("processing_status = 'applied'")) {
              return Promise.resolve(0);
            }
            return original(strings, ...values) as Promise<number>;
          },
        );

        await expect(
          webhook({
            providerEventId: 'evt-d11',
            type: 'payment.refunded',
            paymentRef: payment.providerPaymentRef,
          }),
        ).rejects.toMatchObject({
          response: {
            code: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matcher
            message: expect.stringContaining('lease_lost'),
          },
        });
        expect(
          prisma._store.webhooks.find((w) => w.providerEventId === 'evt-d11')
            ?.processingStatus,
        ).not.toBe('APPLIED');
      });
    });

    // ----- D12 / D14 -------------------------------------------------------
    describe('D12/D14: retrieve-before-mutate webhook paths', () => {
      it('captured webhook finalizes PENDING_AUTHORIZATION → CAPTURED when the provider already captured', async () => {
        const payment = await pendingAuthPayment('ord-d12');
        payment.providerPaymentRef = 'pi_d12';
        const onPaymentCaptured = jest.fn();
        service.setOutcomeHandlers({ onPaymentCaptured });
        jest.spyOn(adapter, 'retrieveAuthorization').mockResolvedValue({
          outcomeClass: 'SUCCESS',
          lifecycleHint: 'CAPTURED',
          providerPaymentRef: 'pi_d12',
          providerCaptureRef: 'cap_d12',
          providerStatusRaw: 'succeeded',
        });
        const captureSpy = jest.spyOn(adapter, 'capture');

        await webhook({
          providerEventId: 'evt-d12',
          type: 'payment.captured',
          paymentRef: 'pi_d12',
        });

        expect(captureSpy).not.toHaveBeenCalled();
        expect(paymentRow(payment.id)).toMatchObject({
          lifecycleState: PaymentLifecycleState.CAPTURED,
          providerCaptureRef: 'cap_d12',
          capturedAmountCents: 500,
        });
        expect(onPaymentCaptured).toHaveBeenCalledTimes(1);
      });

      it('captured webhook stays retryable (no mutation) while the provider needs customer action', async () => {
        const payment = await pendingAuthPayment('ord-d12-action');
        payment.providerPaymentRef = 'pi_d12_action';
        jest.spyOn(adapter, 'retrieveAuthorization').mockResolvedValue({
          outcomeClass: 'ACTION_REQUIRED',
          providerPaymentRef: 'pi_d12_action',
          providerStatusRaw: 'requires_action',
        });
        const captureSpy = jest.spyOn(adapter, 'capture');

        await expect(
          webhook({
            providerEventId: 'evt-d12-action',
            type: 'payment.captured',
            paymentRef: 'pi_d12_action',
          }),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(captureSpy).not.toHaveBeenCalled();
        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.PENDING_AUTHORIZATION,
        );
      });

      it('D13: voided webhook finalizes PENDING_AUTHORIZATION when the provider canceled', async () => {
        const payment = await pendingAuthPayment('ord-d13-cancel');
        payment.providerPaymentRef = 'pi_d13_cancel';
        jest.spyOn(adapter, 'retrieveAuthorization').mockResolvedValue({
          outcomeClass: 'CONFIRMED_FAILURE',
          lifecycleHint: 'VOIDED',
          providerPaymentRef: 'pi_d13_cancel',
          providerStatusRaw: 'canceled',
        });

        await webhook({
          providerEventId: 'evt-d13-cancel',
          type: 'payment.voided',
          paymentRef: 'pi_d13_cancel',
        });

        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.AUTHORIZATION_FAILED,
        );
      });

      it('D13: voided webhook captures when the provider already succeeded', async () => {
        const payment = await pendingAuthPayment('ord-d13-cap');
        payment.providerPaymentRef = 'pi_d13_cap';
        jest.spyOn(adapter, 'retrieveAuthorization').mockResolvedValue({
          outcomeClass: 'SUCCESS',
          lifecycleHint: 'CAPTURED',
          providerPaymentRef: 'pi_d13_cap',
          providerCaptureRef: 'cap_d13',
          providerStatusRaw: 'succeeded',
        });

        await webhook({
          providerEventId: 'evt-d13-cap',
          type: 'payment.voided',
          paymentRef: 'pi_d13_cap',
        });

        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.CAPTURED,
        );
      });

      it('D13: voided webhook stays pending when retrieve is inconclusive', async () => {
        const payment = await pendingAuthPayment('ord-d13-amb');
        payment.providerPaymentRef = 'pi_d13_amb';
        jest.spyOn(adapter, 'retrieveAuthorization').mockResolvedValue({
          outcomeClass: 'NETWORK_UNKNOWN',
          lifecycleHint: 'PENDING',
          providerPaymentRef: 'pi_d13_amb',
        });

        await expect(
          webhook({
            providerEventId: 'evt-d13-amb',
            type: 'payment.voided',
            paymentRef: 'pi_d13_amb',
          }),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.PENDING_AUTHORIZATION,
        );
      });

      it('D14: authorization_failed webhook does not fail a payment the provider already captured', async () => {
        const payment = await pendingAuthPayment('ord-d14');
        payment.providerPaymentRef = 'pi_d14';
        jest.spyOn(adapter, 'retrieveAuthorization').mockResolvedValue({
          outcomeClass: 'SUCCESS',
          lifecycleHint: 'CAPTURED',
          providerPaymentRef: 'pi_d14',
          providerCaptureRef: 'cap_d14',
          providerStatusRaw: 'succeeded',
        });

        await webhook({
          providerEventId: 'evt-d14',
          type: 'payment.authorization_failed',
          paymentRef: 'pi_d14',
        });

        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.CAPTURED,
        );
      });

      it('captured webhook never reopens a terminal payment', async () => {
        const failed = await service.authorizeForOrder({
          orderId: 'ord-d12-terminal',
          paymentMethodId: 'spm-1',
          currency: 'USD',
          amountCents: 500,
          idempotencyKey: 'ord-d12-terminal:auth',
          forceOutcome: 'decline',
        });
        const row = paymentRow(failed.paymentId);
        expect(paymentRow(row.id).lifecycleState).toBe(
          PaymentLifecycleState.AUTHORIZATION_FAILED,
        );
        row.providerPaymentRef = 'pi_terminal';
        const retrieveSpy = jest.spyOn(adapter, 'retrieveAuthorization');
        const captureSpy = jest.spyOn(adapter, 'capture');

        await webhook({
          providerEventId: 'evt-d12-terminal',
          type: 'payment.captured',
          paymentRef: 'pi_terminal',
        });

        expect(retrieveSpy).not.toHaveBeenCalled();
        expect(captureSpy).not.toHaveBeenCalled();
        expect(paymentRow(row.id).lifecycleState).toBe(
          PaymentLifecycleState.AUTHORIZATION_FAILED,
        );
      });
    });

    // ----- D15 -------------------------------------------------------------
    describe('D15: uncorrelated webhook conflict', () => {
      it('throws a retryable ConflictException when paymentRef has no local payment', async () => {
        await expect(
          webhook({
            providerEventId: 'evt-d15',
            type: 'payment.captured',
            paymentRef: 'sim_unknown_ref',
          }),
        ).rejects.toMatchObject({
          response: {
            code: ErrorCodes.PAY_PROVIDER_UNAVAILABLE,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matcher
            message: expect.stringContaining('uncorrelated'),
          },
        });
        const stored = prisma._store.webhooks.find(
          (w) => w.providerEventId === 'evt-d15',
        );
        expect(stored?.processingStatus).toBe('FAILED');
      });

      it('applies to refund.provider_update as well', async () => {
        await expect(
          webhook({
            providerEventId: 'evt-d15-refund',
            type: 'refund.provider_update',
            paymentRef: 'sim_unknown_ref',
            data: {
              object: {
                id: 're_unknown',
                object: 'refund',
                amount: 100,
                status: 'succeeded',
                payment_intent: 'sim_unknown_ref',
              },
            },
          }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma._store.refunds).toHaveLength(0);
      });

      it('a webhook without paymentRef is still acknowledged', async () => {
        await expect(
          webhook({
            providerEventId: 'evt-d15-none',
            type: 'payment.captured',
          }),
        ).resolves.toEqual({ accepted: true, duplicate: false });
      });
    });

    // ----- D5 --------------------------------------------------------------
    describe('D5: reconcile', () => {
      it('returns not_found for an unknown payment', async () => {
        await expect(service.reconcilePaymentById('nope')).resolves.toEqual({
          outcome: 'not_found',
          paymentId: 'nope',
        });
      });

      it('renewal-owned payments are retrieve-only (deferred_renewal) and never mutated', async () => {
        const payment = await pendingAuthPayment('ord-d5-renewal');
        payment.purpose = PaymentPurpose.RENEWAL;
        payment.providerPaymentRef = 'pi_d5';
        // Even a provider-confirmed authorization must not be applied by reconcile.
        const retrieveSpy = jest
          .spyOn(adapter, 'retrieveAuthorization')
          .mockResolvedValue({
            outcomeClass: 'SUCCESS',
            lifecycleHint: 'AUTHORIZED',
            providerPaymentRef: 'pi_d5',
            providerAuthorizationRef: 'pi_d5',
            providerStatusRaw: 'requires_capture',
          });
        const captureSpy = jest.spyOn(adapter, 'capture');
        const voidSpy = jest.spyOn(adapter, 'void');

        const first = await service.reconcilePaymentById(payment.id!);

        expect(first).toEqual({
          outcome: 'deferred_renewal',
          paymentId: payment.id,
        });
        expect(retrieveSpy).toHaveBeenCalledTimes(1);
        expect(captureSpy).not.toHaveBeenCalled();
        expect(voidSpy).not.toHaveBeenCalled();
        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.PENDING_AUTHORIZATION,
        );
        expect(paymentRow(payment.id).lastErrorCode).toMatch(
          /^RECONCILE_DEFER\|\d+\|1\|/,
        );

        // Durable exponential backoff: attempt counter increments.
        await service.reconcilePaymentById(payment.id!);
        expect(paymentRow(payment.id).lastErrorCode).toMatch(
          /^RECONCILE_DEFER\|\d+\|2\|/,
        );
        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.PENDING_AUTHORIZATION,
        );
      });

      it('returns deferred_renewal_lease_held without even retrieving while a renewal lease is live', async () => {
        const payment = await pendingAuthPayment('ord-d5-lease');
        payment.providerPaymentRef = 'pi_d5_lease';
        prisma.subscriptionRenewalAttempt.findMany.mockResolvedValue([
          {
            claimToken: 'claim-1',
            leaseExpiresAt: new Date(Date.now() + 60_000),
          },
        ]);
        const retrieveSpy = jest.spyOn(adapter, 'retrieveAuthorization');

        const result = await service.reconcilePaymentById(payment.id!);

        expect(result.outcome).toBe('deferred_renewal_lease_held');
        expect(retrieveSpy).not.toHaveBeenCalled();
        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.PENDING_AUTHORIZATION,
        );
      });

      it('an expired renewal lease is retrieve-only, not lease_held', async () => {
        const payment = await pendingAuthPayment('ord-d5-expired');
        payment.providerPaymentRef = 'pi_d5_expired';
        prisma.subscriptionRenewalAttempt.findMany.mockResolvedValue([
          {
            claimToken: 'claim-old',
            leaseExpiresAt: new Date(Date.now() - 60_000),
          },
        ]);

        const result = await service.reconcilePaymentById(payment.id!);

        expect(result.outcome).toBe('deferred_renewal');
        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.PENDING_AUTHORIZATION,
        );
      });

      it('non-renewal PENDING_AUTHORIZATION is finalized from the provider', async () => {
        const payment = await pendingAuthPayment('ord-d5-auth');
        payment.providerPaymentRef = 'pi_d5_auth';
        jest.spyOn(adapter, 'retrieveAuthorization').mockResolvedValue({
          outcomeClass: 'SUCCESS',
          lifecycleHint: 'AUTHORIZED',
          providerPaymentRef: 'pi_d5_auth',
          providerAuthorizationRef: 'pi_d5_auth',
          providerStatusRaw: 'requires_capture',
        });

        const result = await service.reconcilePaymentById(payment.id!);

        expect(result.outcome).toBe('authorized');
        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.AUTHORIZED,
        );
      });

      it('an unresolved non-renewal payment is deferred with backoff and stays pending', async () => {
        const payment = await pendingAuthPayment('ord-d5-pending');
        payment.providerPaymentRef = 'pi_d5_pending';
        // Simulated timeout record → NETWORK/TIMEOUT: inconclusive.

        const result = await service.reconcilePaymentById(payment.id!);

        expect(result.outcome).toBe('pending');
        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.PENDING_AUTHORIZATION,
        );
        expect(paymentRow(payment.id).lastErrorCode).toMatch(
          /^RECONCILE_DEFER\|\d+\|1\|/,
        );
      });

      it.each([
        PaymentLifecycleState.AUTHORIZATION_FAILED,
        PaymentLifecycleState.VOIDED,
        PaymentLifecycleState.REFUNDED,
        PaymentLifecycleState.CAPTURED,
        PaymentLifecycleState.CAPTURE_FAILED,
      ])(
        'terminal/settled %s is never reopened (noop_terminal)',
        async (state) => {
          const payment = await capturedPayment(`ord-d5-term-${state}`);
          payment.lifecycleState = state;
          const spies = [
            jest.spyOn(adapter, 'retrieveAuthorization'),
            jest.spyOn(adapter, 'retrieveCapture'),
            jest.spyOn(adapter, 'retrieveRefund'),
            jest.spyOn(adapter, 'capture'),
            jest.spyOn(adapter, 'void'),
            jest.spyOn(adapter, 'refund'),
          ];

          const result = await service.reconcilePaymentById(payment.id!);

          expect(result.outcome).toBe('noop_terminal');
          spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
          expect(paymentRow(payment.id).lifecycleState).toBe(state);
        },
      );

      it('a REFUND_PENDING payment reconciles its PENDING refund and returns to CAPTURED (never reopened)', async () => {
        const payment = await capturedPayment('ord-d5-refund');
        simulatedForce = 'timeout';
        const refund = await service.initiateRefund({
          paymentId: payment.id!,
          amountCents: 300,
          reason: 'timeout',
          actorUserId: 'staff-1',
          idempotencyKey: `${payment.id}:d5`,
        });
        simulatedForce = null;
        const ref = refund.providerRefundRef as string;
        jest.spyOn(adapter, 'retrieveRefund').mockResolvedValue({
          outcomeClass: 'SUCCESS',
          lifecycleHint: 'REFUNDED',
          providerRefundRef: ref,
        });

        const result = await service.reconcilePaymentById(payment.id!);

        expect(result.outcome).toBe('refund_reconciled');
        expect(
          prisma._store.refunds.find((r) => r.id === refund.id)?.status,
        ).toBe('SUCCEEDED');
        expect(paymentRow(payment.id).lifecycleState).toBe(
          PaymentLifecycleState.CAPTURED,
        );
      });

      it('reconcileStuckBatch skips payments inside their backoff window and keeps going on failure', async () => {
        const eligible = await pendingAuthPayment(
          'ord-d5-batch-a',
          PaymentPurpose.RENEWAL,
        );
        eligible.providerPaymentRef = 'pi_batch_a';
        const backedOff = await pendingAuthPayment('ord-d5-batch-b');
        backedOff.lastErrorCode = `RECONCILE_DEFER|${Date.now() + 3_600_000}|1|`;
        const broken = await pendingAuthPayment('ord-d5-batch-c');
        broken.providerPaymentRef = 'pi_batch_c';
        jest
          .spyOn(adapter, 'retrieveAuthorization')
          .mockRejectedValue(new Error('boom'));
        prisma.payment.findMany.mockResolvedValue([
          eligible,
          backedOff,
          broken,
        ]);

        const result = await service.reconcileStuckBatch({
          limit: 10,
          olderThanSeconds: 0,
        });

        const byId = new Map(result.results.map((r) => [r.paymentId, r]));
        expect(result.processed).toBe(2);
        expect(byId.has(backedOff.id!)).toBe(false);
        expect(byId.get(eligible.id!)?.outcome).toBe('deferred_renewal');
        // Gateway throw is swallowed by reconcileAuthorization → deferred, never aborts the batch.
        expect(['pending', 'error']).toContain(byId.get(broken.id!)?.outcome);
        expect(paymentRow(eligible.id).lifecycleState).toBe(
          PaymentLifecycleState.PENDING_AUTHORIZATION,
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 6G
  // ---------------------------------------------------------------------------
  describe('Phase 6G', () => {
    const SECRET = 'test-webhook-secret-16';

    const paymentRow = (id: string | null | undefined): StoreRow => {
      const row = prisma._store.payments.find((p) => p.id === id);
      if (!row) {
        throw new Error(`payment ${id} missing from store`);
      }
      return row;
    };

    it('R1 helpers: only allow-listed codes release FAILED reservations', () => {
      expect(
        isConfirmedRefundFailureCode(ErrorCodes.PAY_REFUND_PROVIDER_FAILED),
      ).toBe(true);
      expect(
        isConfirmedRefundFailureCode(ErrorCodes.PAY_REFUND_PROVIDER_CANCELED),
      ).toBe(true);
      expect(
        isConfirmedRefundFailureCode(ErrorCodes.PAY_REFUND_INELIGIBLE),
      ).toBe(false);
      expect(isConfirmedRefundFailureCode(null)).toBe(false);
    });

    it('R3: canonicalCaptureIdempotencyKey is durable and order-scoped', () => {
      expect(canonicalCaptureIdempotencyKey('ord-a', 'pay-b')).toBe(
        'capture:ord-a:pay-b',
      );
    });

    it('T1: expired authorization voids and rejects capture', async () => {
      const auth = await service.authorizeForOrder({
        orderId: 'ord-6g-exp',
        paymentMethodId: 'spm-1',
        currency: 'USD',
        amountCents: 800,
        idempotencyKey: '6g:exp:auth',
      });
      paymentRow(auth.paymentId).authorizationExpiresAt = new Date(
        Date.now() - 60_000,
      );

      await expect(
        service.capturePayment({
          paymentId: auth.paymentId,
          idempotencyKey: '6g:exp:cap',
        }),
      ).rejects.toMatchObject({
        response: { code: ErrorCodes.PAY_REFUND_INELIGIBLE },
      });
      expect(paymentRow(auth.paymentId).lifecycleState).toBe(
        PaymentLifecycleState.VOIDED,
      );
    });

    it('R4: second authorize with a different key conflicts while open', async () => {
      await service.authorizeForOrder({
        orderId: 'ord-6g-r4',
        paymentMethodId: 'spm-1',
        currency: 'USD',
        amountCents: 500,
        idempotencyKey: '6g:r4:a',
      });

      await expect(
        service.authorizeForOrder({
          orderId: 'ord-6g-r4',
          paymentMethodId: 'spm-1',
          currency: 'USD',
          amountCents: 500,
          idempotencyKey: '6g:r4:b',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma._store.payments).toHaveLength(1);
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('R3: CAPTURE_PENDING re-captures with reconstructed canonical key', async () => {
      const auth = await service.authorizeForOrder({
        orderId: 'ord-6g-r3',
        paymentMethodId: 'spm-1',
        currency: 'USD',
        amountCents: 700,
        idempotencyKey: '6g:r3:auth',
      });
      simulatedForce = 'timeout';
      const pending = await service.capturePayment({
        paymentId: auth.paymentId,
        idempotencyKey: canonicalCaptureIdempotencyKey(
          'ord-6g-r3',
          auth.paymentId!,
        ),
      });
      simulatedForce = null;
      expect(pending.lifecycleState).toBe(
        PaymentLifecycleState.CAPTURE_PENDING,
      );

      jest.spyOn(adapter, 'retrieveCapture').mockResolvedValue({
        outcomeClass: 'SUCCESS',
        lifecycleHint: 'AUTHORIZED',
        providerPaymentRef: paymentRow(auth.paymentId).providerPaymentRef,
        providerAuthorizationRef: paymentRow(auth.paymentId)
          .providerAuthorizationRef,
      });
      const captureSpy = jest.spyOn(adapter, 'capture');

      const recovered = await service.capturePayment({
        paymentId: auth.paymentId,
        idempotencyKey: 'ignored-while-pending',
      });

      expect(recovered.lifecycleState).toBe(PaymentLifecycleState.CAPTURED);
      expect(captureSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: canonicalCaptureIdempotencyKey(
            'ord-6g-r3',
            auth.paymentId!,
          ),
        }),
      );
    });

    it('R2: requires_action stamps only after provider retrieve confirms', async () => {
      simulatedForce = 'timeout';
      const auth = await service.authorizeForOrder({
        orderId: 'ord-6g-r2',
        paymentMethodId: 'spm-1',
        currency: 'USD',
        amountCents: 400,
        idempotencyKey: '6g:r2:auth',
      });
      simulatedForce = null;
      const row = paymentRow(auth.paymentId);
      row.providerPaymentRef = 'pi_6g_r2';
      row.providerAuthorizationRef = 'pi_6g_r2';
      row.purpose = PaymentPurpose.CHECKOUT;

      jest.spyOn(adapter, 'retrieveAuthorization').mockResolvedValue({
        outcomeClass: 'ACTION_REQUIRED',
        lifecycleHint: 'PENDING',
        providerStatusRaw: 'requires_action',
        providerPaymentRef: 'pi_6g_r2',
      });

      await service.ingestWebhook({
        secretHeader: SECRET,
        envelope: {
          provider: 'simulated',
          providerEventId: 'evt-6g-r2',
          type: 'payment.requires_action',
          paymentRef: 'pi_6g_r2',
          data: { object: { id: 'pi_6g_r2', status: 'requires_action' } },
        },
      });

      expect(paymentRow(auth.paymentId).providerStatusRaw).toBe(
        'requires_action',
      );
      expect(paymentRow(auth.paymentId).lifecycleState).toBe(
        PaymentLifecycleState.PENDING_AUTHORIZATION,
      );
    });

    it('R2: stale requires_action after capture is a no-op', async () => {
      const auth = await service.authorizeForOrder({
        orderId: 'ord-6g-r2b',
        paymentMethodId: 'spm-1',
        currency: 'USD',
        amountCents: 400,
        idempotencyKey: '6g:r2b:auth',
      });
      await service.capturePayment({
        paymentId: auth.paymentId,
        idempotencyKey: canonicalCaptureIdempotencyKey(
          'ord-6g-r2b',
          auth.paymentId!,
        ),
      });
      const retrieveSpy = jest.spyOn(adapter, 'retrieveAuthorization');

      await service.ingestWebhook({
        secretHeader: SECRET,
        envelope: {
          provider: 'simulated',
          providerEventId: 'evt-6g-r2b-stale',
          type: 'payment.requires_action',
          paymentRef: paymentRow(auth.paymentId).providerPaymentRef,
        },
      });

      expect(retrieveSpy).not.toHaveBeenCalled();
      expect(paymentRow(auth.paymentId).lifecycleState).toBe(
        PaymentLifecycleState.CAPTURED,
      );
    });

    it('T4 simulated journey: authorize → capture → refund → duplicate webhook', async () => {
      const auth = await service.authorizeForOrder({
        orderId: 'ord-6g-journey',
        paymentMethodId: 'spm-1',
        currency: 'USD',
        amountCents: 1200,
        idempotencyKey: '6g:journey:auth',
      });
      const cap = await service.capturePayment({
        paymentId: auth.paymentId,
        idempotencyKey: canonicalCaptureIdempotencyKey(
          'ord-6g-journey',
          auth.paymentId!,
        ),
      });
      expect(cap.lifecycleState).toBe(PaymentLifecycleState.CAPTURED);

      const refund = await service.initiateRefund({
        paymentId: auth.paymentId!,
        amountCents: 1200,
        reason: 'journey',
        actorUserId: 'staff-1',
        idempotencyKey: `${auth.paymentId}:journey-refund`,
      });
      expect(refund.status).toBe('SUCCEEDED');

      const envelope = {
        provider: 'simulated' as const,
        providerEventId: 'evt-6g-journey-cap',
        type: 'payment.captured',
        paymentRef: paymentRow(auth.paymentId).providerPaymentRef as string,
      };
      const first = await service.ingestWebhook({
        secretHeader: SECRET,
        envelope,
      });
      const second = await service.ingestWebhook({
        secretHeader: SECRET,
        envelope,
      });
      expect(first.duplicate || second.duplicate).toBe(true);

      await expect(
        service.ingestWebhook({
          secretHeader: 'wrong-secret!!!!!!!',
          envelope: { ...envelope, providerEventId: 'evt-6g-bad-sig' },
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 7 — refund activity failure-injection recovery
  // ---------------------------------------------------------------------------
  describe('Phase 7 refund activity recovery', () => {
    const SECRET = 'test-webhook-secret-16';

    const paymentRow = (id: string | null | undefined): StoreRow => {
      const row = prisma._store.payments.find((p) => p.id === id);
      if (!row) {
        throw new Error(`payment ${id} missing from store`);
      }
      return row;
    };

    async function capturedCheckout(
      orderId: string,
      amountCents = 1000,
    ): Promise<StoreRow> {
      const auth = await service.authorizeForOrder({
        orderId,
        paymentMethodId: 'spm-1',
        currency: 'USD',
        amountCents,
        idempotencyKey: `${orderId}:auth`,
      });
      await service.capturePayment({
        paymentId: auth.paymentId,
        idempotencyKey: `${orderId}:cap`,
      });
      const row = paymentRow(auth.paymentId);
      row.purpose = PaymentPurpose.CHECKOUT;
      return row;
    }

    it('recovers missing payment_refunded activity via reconcile after notify failure', async () => {
      const payment = await capturedCheckout('ord-p7-act');
      const activities: Array<Record<string, unknown>> = [];
      let failNotify = true;

      service.setOutcomeHandlers({
        onRefundSucceeded: (input) => {
          if (failNotify) {
            failNotify = false;
            return Promise.reject(new Error('forced OrderActivity failure'));
          }
          const refund = prisma._store.refunds.find(
            (r) => r.id === input.refundId,
          );
          const actorUserId = refund?.actorUserId ?? null;
          const already = activities.some(
            (a) =>
              (a.metadata as { refundId?: string } | undefined)?.refundId ===
              input.refundId,
          );
          if (already) {
            return Promise.resolve();
          }
          activities.push({
            kind: 'payment_refunded',
            actorUserId,
            metadata: {
              paymentId: input.paymentId,
              refundId: input.refundId,
              actorUserId,
            },
          });
          return Promise.resolve();
        },
      });

      await expect(
        service.initiateRefund({
          paymentId: payment.id!,
          amountCents: 400,
          reason: 'staff refund',
          actorUserId: 'staff-actor',
          idempotencyKey: `${payment.id}:p7-act`,
        }),
      ).rejects.toThrow('forced OrderActivity failure');

      const refund = prisma._store.refunds.find(
        (r) => r.idempotencyKey === `${payment.id}:p7-act`,
      );
      expect(refund?.status).toBe('SUCCEEDED');
      expect(refund?.actorUserId).toBe('staff-actor');
      expect(activities).toHaveLength(0);

      const first = await service.reconcilePaymentById(payment.id!);
      expect(first.outcome).toBe('noop_terminal');
      expect(activities).toHaveLength(1);
      expect(activities[0]).toMatchObject({
        kind: 'payment_refunded',
        actorUserId: 'staff-actor',
        metadata: {
          refundId: refund?.id,
          actorUserId: 'staff-actor',
        },
      });

      const second = await service.reconcilePaymentById(payment.id!);
      expect(second.outcome).toBe('noop_terminal');
      expect(activities).toHaveLength(1);
    });

    it('preserves null actor on recovery for system-originated refunds', async () => {
      const payment = await capturedCheckout('ord-p7-sys');
      const activities: Array<Record<string, unknown>> = [];
      let failNotify = true;

      service.setOutcomeHandlers({
        onRefundSucceeded: (input) => {
          if (failNotify) {
            failNotify = false;
            return Promise.reject(new Error('forced OrderActivity failure'));
          }
          const refund = prisma._store.refunds.find(
            (r) => r.id === input.refundId,
          );
          activities.push({
            kind: 'payment_refunded',
            actorUserId: refund?.actorUserId ?? null,
            metadata: { refundId: input.refundId },
          });
          return Promise.resolve();
        },
      });

      await expect(
        service.initiateRefund({
          paymentId: payment.id!,
          amountCents: 200,
          reason: 'system',
          actorUserId: null,
          idempotencyKey: `${payment.id}:p7-sys`,
        }),
      ).rejects.toThrow('forced OrderActivity failure');

      await service.reconcilePaymentById(payment.id!);
      expect(activities).toHaveLength(1);
      expect(activities[0]?.actorUserId).toBeNull();
    });

    it('webhook path recovers activity for already-SUCCEEDED refund', async () => {
      const payment = await capturedCheckout('ord-p7-wh');
      const activities: Array<Record<string, unknown>> = [];
      let failNotify = true;

      service.setOutcomeHandlers({
        onRefundSucceeded: (input) => {
          if (failNotify) {
            failNotify = false;
            return Promise.reject(new Error('forced OrderActivity failure'));
          }
          const refund = prisma._store.refunds.find(
            (r) => r.id === input.refundId,
          );
          if (
            activities.some(
              (a) =>
                (a.metadata as { refundId?: string }).refundId ===
                input.refundId,
            )
          ) {
            return Promise.resolve();
          }
          activities.push({
            kind: 'payment_refunded',
            actorUserId: refund?.actorUserId ?? null,
            metadata: { refundId: input.refundId },
          });
          return Promise.resolve();
        },
      });

      await expect(
        service.initiateRefund({
          paymentId: payment.id!,
          amountCents: 300,
          reason: 'staff',
          actorUserId: 'staff-wh',
          idempotencyKey: `${payment.id}:p7-wh`,
        }),
      ).rejects.toThrow('forced OrderActivity failure');

      const refund = prisma._store.refunds.find(
        (r) => r.idempotencyKey === `${payment.id}:p7-wh`,
      );
      expect(refund?.status).toBe('SUCCEEDED');
      expect(refund?.providerRefundRef).toBeTruthy();
      expect(activities).toHaveLength(0);

      const paymentRef = String(payment.providerPaymentRef);
      await service.ingestWebhook({
        secretHeader: SECRET,
        envelope: {
          provider: 'simulated',
          providerEventId: 'evt-p7-wh-recover',
          type: 'refund.provider_update',
          paymentRef,
          data: {
            object: {
              id: refund!.providerRefundRef,
              object: 'refund',
              amount: 300,
              currency: 'usd',
              status: 'succeeded',
              payment_intent: payment.providerPaymentRef,
            },
          },
        },
      });

      expect(activities).toHaveLength(1);
      expect(activities[0]).toMatchObject({
        kind: 'payment_refunded',
        actorUserId: 'staff-wh',
        metadata: { refundId: refund?.id },
      });

      await service.ingestWebhook({
        secretHeader: SECRET,
        envelope: {
          provider: 'simulated',
          providerEventId: 'evt-p7-wh-recover-dup',
          type: 'refund.provider_update',
          paymentRef,
          data: {
            object: {
              id: refund!.providerRefundRef,
              object: 'refund',
              amount: 300,
              currency: 'usd',
              status: 'succeeded',
              payment_intent: payment.providerPaymentRef,
            },
          },
        },
      });
      expect(activities).toHaveLength(1);
    });
  });
});
