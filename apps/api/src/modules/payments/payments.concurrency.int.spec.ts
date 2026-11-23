import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  PaymentInitiator,
  PaymentLifecycleState,
  PaymentPurpose,
  PaymentStatus,
  RefundStatus,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PaymentProviderRegistry } from './payment-provider.registry';
import { PaymentsService } from './payments.service';
import {
  createIntegrationPrisma,
  integrationDatabaseUrl,
  shouldRunPostgresIntegration,
} from './postgres-integration.util';
import { SimulatedPaymentAdapter } from './simulated-payment.adapter';

const databaseUrl = integrationDatabaseUrl();
const describePostgres = shouldRunPostgresIntegration()
  ? describe
  : describe.skip;

/**
 * Real overlapping Postgres transactions.
 * Skipped when DATABASE_URL is unset, and in CI unless RUN_POSTGRES_INTEGRATION=1.
 * Unit-test mutex coverage lives in payments.service.spec.ts and is not a race proof.
 */
describePostgres('PaymentsService refund concurrency (Postgres)', () => {
  const url = databaseUrl!;

  it('overlapping refunds cannot exceed the captured amount', async () => {
    const prisma = createIntegrationPrisma(url);
    await prisma.$connect();
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'payments.provider') return 'simulated';
        if (key === 'payments.mode') return 'sandbox';
        if (key === 'payments.simulatedForce') return null;
        if (key === 'payments.webhookLeaseSeconds') return 45;
        if (key === 'payments.simulatedAuthHoldHours') return 168;
        return undefined;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'payments.webhookSecret') return 'test-webhook-secret-16';
        throw new Error(`missing ${key}`);
      }),
    } as unknown as ConfigService;
    const adapter = new SimulatedPaymentAdapter(config);
    const service = new PaymentsService(
      prisma as never,
      config,
      adapter,
      new PaymentProviderRegistry(config),
    );

    const payment = await prisma.payment.create({
      data: {
        amountCents: 1000,
        capturedAmountCents: 1000,
        currency: 'USD',
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
        lifecycleState: PaymentLifecycleState.CAPTURED,
        purpose: PaymentPurpose.CHECKOUT,
        initiator: PaymentInitiator.CHECKOUT,
        provider: 'simulated',
        providerPaymentRef: `sim_pay_${randomUUID()}`,
        providerAuthorizationRef: `sim_auth_${randomUUID()}`,
        providerCaptureRef: `sim_cap_${randomUUID()}`,
        idempotencyKey: `it-refund-pay-${randomUUID()}`,
      },
    });

    try {
      const results = await Promise.allSettled([
        service.initiateRefund({
          paymentId: payment.id,
          amountCents: 600,
          reason: 'concurrent-a',
          actorUserId: null,
          idempotencyKey: `${payment.id}:${randomUUID()}`,
        }),
        service.initiateRefund({
          paymentId: payment.id,
          amountCents: 600,
          reason: 'concurrent-b',
          actorUserId: null,
          idempotencyKey: `${payment.id}:${randomUUID()}`,
        }),
      ]);
      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.status).toBe('rejected');
      if (rejected[0]?.status === 'rejected') {
        expect(rejected[0].reason).toMatchObject({
          response: { code: ErrorCodes.PAY_REFUND_INELIGIBLE },
        });
      }

      const agg = await prisma.refund.aggregate({
        where: { paymentId: payment.id, status: RefundStatus.SUCCEEDED },
        _sum: { amountCents: true },
      });
      expect(agg._sum.amountCents ?? 0).toBeLessThanOrEqual(1000);
      expect(agg._sum.amountCents).toBe(600);
    } finally {
      await prisma.refund.deleteMany({ where: { paymentId: payment.id } });
      await prisma.payment.delete({ where: { id: payment.id } });
      await prisma.$disconnect();
    }
  });

  it('R1: conclusive FAILED release vs concurrent staff reserve stays within captured', async () => {
    const prisma = createIntegrationPrisma(url);
    await prisma.$connect();
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'payments.provider') return 'simulated';
        if (key === 'payments.mode') return 'sandbox';
        if (key === 'payments.simulatedForce') return null;
        if (key === 'payments.webhookLeaseSeconds') return 45;
        if (key === 'payments.simulatedAuthHoldHours') return 168;
        return undefined;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'payments.webhookSecret') return 'test-webhook-secret-16';
        throw new Error(`missing ${key}`);
      }),
    } as unknown as ConfigService;
    const adapter = new SimulatedPaymentAdapter(config);
    const service = new PaymentsService(
      prisma as never,
      config,
      adapter,
      new PaymentProviderRegistry(config),
    );

    const payment = await prisma.payment.create({
      data: {
        amountCents: 1000,
        capturedAmountCents: 1000,
        currency: 'USD',
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
        lifecycleState: PaymentLifecycleState.CAPTURED,
        purpose: PaymentPurpose.CHECKOUT,
        initiator: PaymentInitiator.CHECKOUT,
        provider: 'simulated',
        providerPaymentRef: `sim_pay_${randomUUID()}`,
        providerAuthorizationRef: `sim_auth_${randomUUID()}`,
        providerCaptureRef: `sim_cap_${randomUUID()}`,
        idempotencyKey: `it-r1-pay-${randomUUID()}`,
      },
    });
    const uncertain = await prisma.refund.create({
      data: {
        paymentId: payment.id,
        amountCents: 1000,
        status: RefundStatus.FAILED,
        idempotencyKey: `it-r1-fail-${randomUUID()}`,
        errorCode: null,
      },
    });

    try {
      const release = prisma.refund.update({
        where: { id: uncertain.id },
        data: { errorCode: ErrorCodes.PAY_REFUND_PROVIDER_FAILED },
      });
      const reserve = service.initiateRefund({
        paymentId: payment.id,
        amountCents: 1000,
        reason: 'after-release',
        actorUserId: null,
        idempotencyKey: `it-r1-reserve-${randomUUID()}`,
      });
      const results = await Promise.allSettled([release, reserve]);
      expect(results.some((r) => r.status === 'fulfilled')).toBe(true);

      const reserved = await prisma.refund.aggregate({
        where: {
          paymentId: payment.id,
          status: { in: [RefundStatus.SUCCEEDED, RefundStatus.PENDING] },
        },
        _sum: { amountCents: true },
      });
      expect(reserved._sum.amountCents ?? 0).toBeLessThanOrEqual(1000);
    } finally {
      await prisma.refund.deleteMany({ where: { paymentId: payment.id } });
      await prisma.payment.delete({ where: { id: payment.id } });
      await prisma.$disconnect();
    }
  });

  it('R4: order FOR UPDATE serializes concurrent different-key authorize inserts', async () => {
    const prisma = createIntegrationPrisma(url);
    await prisma.$connect();
    const suffix = randomUUID().slice(0, 8);
    const user = await prisma.user.create({
      data: {
        email: `pay-r4-${suffix}@example.com`,
        passwordHash: 'test-hash',
      },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `R4-${suffix}`,
        patientUserId: user.id,
        status: 'PAYMENT_PENDING',
        currency: 'USD',
        subtotalCents: 500,
        totalCents: 500,
      },
    });

    try {
      const results = await Promise.allSettled([
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            SELECT id FROM orders WHERE id = ${order.id}::uuid FOR UPDATE
          `;
          await new Promise((r) => setTimeout(r, 50));
          return tx.payment.create({
            data: {
              orderId: order.id,
              amountCents: 500,
              currency: 'USD',
              status: PaymentStatus.PENDING,
              lifecycleState: PaymentLifecycleState.PENDING_AUTHORIZATION,
              purpose: PaymentPurpose.CHECKOUT,
              initiator: PaymentInitiator.CHECKOUT,
              provider: 'simulated',
              idempotencyKey: `it-r4-a-${randomUUID()}`,
            },
          });
        }),
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            SELECT id FROM orders WHERE id = ${order.id}::uuid FOR UPDATE
          `;
          const open = await tx.payment.findMany({
            where: { orderId: order.id },
            select: { lifecycleState: true },
          });
          if (
            open.some((p) =>
              [
                PaymentLifecycleState.PENDING_AUTHORIZATION,
                PaymentLifecycleState.AUTHORIZED,
                PaymentLifecycleState.CAPTURE_PENDING,
                PaymentLifecycleState.CAPTURED,
              ].includes(p.lifecycleState),
            )
          ) {
            throw new Error('blocked');
          }
          return tx.payment.create({
            data: {
              orderId: order.id,
              amountCents: 500,
              currency: 'USD',
              status: PaymentStatus.PENDING,
              lifecycleState: PaymentLifecycleState.PENDING_AUTHORIZATION,
              purpose: PaymentPurpose.CHECKOUT,
              initiator: PaymentInitiator.CHECKOUT,
              provider: 'simulated',
              idempotencyKey: `it-r4-b-${randomUUID()}`,
            },
          });
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled.length + rejected.length).toBe(2);
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const count = await prisma.payment.count({
        where: { orderId: order.id },
      });
      expect(count).toBe(1);
    } finally {
      await prisma.payment.deleteMany({ where: { orderId: order.id } });
      await prisma.order.delete({ where: { id: order.id } });
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.$disconnect();
    }
  });
});

describePostgres(
  'PaymentsService reconcile concurrency (Postgres, Phase 7)',
  () => {
    const url = databaseUrl!;

    it('concurrent reconcilePaymentById on CAPTURE_PENDING uses one canonical capture key effect', async () => {
      const prisma = createIntegrationPrisma(url);
      await prisma.$connect();
      const suffix = randomUUID().slice(0, 8);
      const config = {
        get: jest.fn((key: string) => {
          if (key === 'payments.provider') return 'simulated';
          if (key === 'payments.mode') return 'sandbox';
          if (key === 'payments.simulatedForce') return null;
          if (key === 'payments.webhookLeaseSeconds') return 45;
          if (key === 'payments.simulatedAuthHoldHours') return 168;
          return undefined;
        }),
        getOrThrow: jest.fn((key: string) => {
          if (key === 'payments.webhookSecret') return 'test-webhook-secret-16';
          throw new Error(`missing ${key}`);
        }),
      } as unknown as ConfigService;
      const adapter = new SimulatedPaymentAdapter(config);
      const captureSpy = jest.spyOn(adapter, 'capture');
      const service = new PaymentsService(
        prisma as never,
        config,
        adapter,
        new PaymentProviderRegistry(config),
      );

      const user = await prisma.user.create({
        data: {
          email: `pay-rec-${suffix}@example.com`,
          passwordHash: 'test-hash',
        },
      });
      const order = await prisma.order.create({
        data: {
          orderNumber: `REC-${suffix}`,
          patientUserId: user.id,
          status: 'PAYMENT_PENDING',
          currency: 'USD',
          subtotalCents: 700,
          totalCents: 700,
        },
      });
      const paymentId = randomUUID();
      const authKey = `it-rec-auth-${randomUUID()}`;
      const auth = await adapter.authorize({
        amountCents: 700,
        currency: 'USD',
        providerMethodRef: 'sim_pm_test',
        idempotencyKey: authKey,
      });
      const payment = await prisma.payment.create({
        data: {
          id: paymentId,
          orderId: order.id,
          amountCents: 700,
          currency: 'USD',
          status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
          lifecycleState: PaymentLifecycleState.CAPTURE_PENDING,
          purpose: PaymentPurpose.CHECKOUT,
          initiator: PaymentInitiator.CHECKOUT,
          provider: 'simulated',
          providerPaymentRef: auth.providerPaymentRef!,
          providerAuthorizationRef: auth.providerAuthorizationRef!,
          idempotencyKey: authKey,
          authorizedAmountCents: 700,
          authorizedAt: new Date(),
        },
      });

      try {
        const results = await Promise.all([
          service.reconcilePaymentById(payment.id),
          service.reconcilePaymentById(payment.id),
        ]);
        expect(results.every((r) => r.paymentId === payment.id)).toBe(true);

        const fresh = await prisma.payment.findUniqueOrThrow({
          where: { id: payment.id },
        });
        expect(fresh.lifecycleState).toBe(PaymentLifecycleState.CAPTURED);

        const captureKeys = captureSpy.mock.calls.map(
          (call) => call[0]?.idempotencyKey,
        );
        for (const key of captureKeys) {
          expect(key).toBe(`capture:${order.id}:${payment.id}`);
        }
      } finally {
        captureSpy.mockRestore();
        await prisma.payment.deleteMany({ where: { id: payment.id } });
        await prisma.order.delete({ where: { id: order.id } });
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.$disconnect();
      }
    });

    it('staff reconcile overlapping worker reconcileStuckBatch shares one capture effect', async () => {
      const prisma = createIntegrationPrisma(url);
      await prisma.$connect();
      const suffix = randomUUID().slice(0, 8);
      const config = {
        get: jest.fn((key: string) => {
          if (key === 'payments.provider') return 'simulated';
          if (key === 'payments.mode') return 'sandbox';
          if (key === 'payments.simulatedForce') return null;
          if (key === 'payments.webhookLeaseSeconds') return 45;
          if (key === 'payments.simulatedAuthHoldHours') return 168;
          return undefined;
        }),
        getOrThrow: jest.fn((key: string) => {
          if (key === 'payments.webhookSecret') return 'test-webhook-secret-16';
          throw new Error(`missing ${key}`);
        }),
      } as unknown as ConfigService;
      const adapter = new SimulatedPaymentAdapter(config);
      const captureSpy = jest.spyOn(adapter, 'capture');
      const service = new PaymentsService(
        prisma as never,
        config,
        adapter,
        new PaymentProviderRegistry(config),
      );

      const user = await prisma.user.create({
        data: {
          email: `pay-staff-worker-${suffix}@example.com`,
          passwordHash: 'test-hash',
        },
      });
      const order = await prisma.order.create({
        data: {
          orderNumber: `SW-${suffix}`,
          patientUserId: user.id,
          status: 'PAYMENT_PENDING',
          currency: 'USD',
          subtotalCents: 800,
          totalCents: 800,
        },
      });
      const paymentId = randomUUID();
      const authKey = `it-sw-auth-${randomUUID()}`;
      const auth = await adapter.authorize({
        amountCents: 800,
        currency: 'USD',
        providerMethodRef: 'sim_pm_test',
        idempotencyKey: authKey,
      });
      const staleUpdatedAt = new Date(Date.now() - 120_000);
      const payment = await prisma.payment.create({
        data: {
          id: paymentId,
          orderId: order.id,
          amountCents: 800,
          currency: 'USD',
          status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
          lifecycleState: PaymentLifecycleState.CAPTURE_PENDING,
          purpose: PaymentPurpose.CHECKOUT,
          initiator: PaymentInitiator.CHECKOUT,
          provider: 'simulated',
          providerPaymentRef: auth.providerPaymentRef!,
          providerAuthorizationRef: auth.providerAuthorizationRef!,
          idempotencyKey: authKey,
          authorizedAmountCents: 800,
          authorizedAt: new Date(),
          updatedAt: staleUpdatedAt,
        },
      });
      // Prisma @updatedAt may overwrite; force stuck age for worker selection.
      await prisma.$executeRaw`
      UPDATE payments SET updated_at = ${staleUpdatedAt} WHERE id = ${payment.id}::uuid
    `;

      try {
        const [staff, worker] = await Promise.all([
          service.reconcilePaymentById(payment.id),
          service.reconcileStuckBatch({ limit: 10, olderThanSeconds: 30 }),
        ]);
        expect(staff.paymentId).toBe(payment.id);
        expect(worker.processed).toBeGreaterThanOrEqual(0);

        const fresh = await prisma.payment.findUniqueOrThrow({
          where: { id: payment.id },
        });
        expect(fresh.lifecycleState).toBe(PaymentLifecycleState.CAPTURED);

        const captureKeys = captureSpy.mock.calls.map(
          (call) => call[0]?.idempotencyKey,
        );
        expect(captureKeys.length).toBeGreaterThan(0);
        for (const key of captureKeys) {
          expect(key).toBe(`capture:${order.id}:${payment.id}`);
        }
      } finally {
        captureSpy.mockRestore();
        await prisma.payment.deleteMany({ where: { id: payment.id } });
        await prisma.order.delete({ where: { id: order.id } });
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.$disconnect();
      }
    });

    it('concurrent authorization recovery finalizes once with stable provider refs', async () => {
      const prisma = createIntegrationPrisma(url);
      await prisma.$connect();
      const suffix = randomUUID().slice(0, 8);
      const config = {
        get: jest.fn((key: string) => {
          if (key === 'payments.provider') return 'simulated';
          if (key === 'payments.mode') return 'sandbox';
          if (key === 'payments.simulatedForce') return null;
          if (key === 'payments.webhookLeaseSeconds') return 45;
          if (key === 'payments.simulatedAuthHoldHours') return 168;
          return undefined;
        }),
        getOrThrow: jest.fn((key: string) => {
          if (key === 'payments.webhookSecret') return 'test-webhook-secret-16';
          throw new Error(`missing ${key}`);
        }),
      } as unknown as ConfigService;
      const adapter = new SimulatedPaymentAdapter(config);
      const retrieveSpy = jest.spyOn(adapter, 'retrieveAuthorization');
      const service = new PaymentsService(
        prisma as never,
        config,
        adapter,
        new PaymentProviderRegistry(config),
      );

      const user = await prisma.user.create({
        data: {
          email: `pay-auth-rec-${suffix}@example.com`,
          passwordHash: 'test-hash',
        },
      });
      const order = await prisma.order.create({
        data: {
          orderNumber: `AR-${suffix}`,
          patientUserId: user.id,
          status: 'PAYMENT_PENDING',
          currency: 'USD',
          subtotalCents: 650,
          totalCents: 650,
        },
      });
      const authKey = `it-auth-rec-${randomUUID()}`;
      const auth = await adapter.authorize({
        amountCents: 650,
        currency: 'USD',
        providerMethodRef: 'sim_pm_test',
        idempotencyKey: authKey,
      });
      const payment = await prisma.payment.create({
        data: {
          id: randomUUID(),
          orderId: order.id,
          amountCents: 650,
          currency: 'USD',
          status: PaymentStatus.PENDING,
          lifecycleState: PaymentLifecycleState.PENDING_AUTHORIZATION,
          purpose: PaymentPurpose.CHECKOUT,
          initiator: PaymentInitiator.CHECKOUT,
          provider: 'simulated',
          providerPaymentRef: auth.providerPaymentRef!,
          providerAuthorizationRef: auth.providerAuthorizationRef!,
          idempotencyKey: authKey,
        },
      });

      try {
        const results = await Promise.all([
          service.reconcilePaymentById(payment.id),
          service.reconcilePaymentById(payment.id),
        ]);
        expect(results.every((r) => r.paymentId === payment.id)).toBe(true);

        const fresh = await prisma.payment.findUniqueOrThrow({
          where: { id: payment.id },
        });
        expect(fresh.lifecycleState).toBe(PaymentLifecycleState.AUTHORIZED);
        expect(fresh.providerPaymentRef).toBe(auth.providerPaymentRef);
        expect(fresh.providerAuthorizationRef).toBe(
          auth.providerAuthorizationRef,
        );
        expect(retrieveSpy.mock.calls.length).toBeGreaterThan(0);
        for (const call of retrieveSpy.mock.calls) {
          expect(call[0]?.idempotencyKey).toBe(authKey);
        }
      } finally {
        retrieveSpy.mockRestore();
        await prisma.payment.deleteMany({ where: { id: payment.id } });
        await prisma.order.delete({ where: { id: order.id } });
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.$disconnect();
      }
    });

    it('refund reconcile overlapping webhook finalization yields one SUCCEEDED refund', async () => {
      const prisma = createIntegrationPrisma(url);
      await prisma.$connect();
      const suffix = randomUUID().slice(0, 8);
      const config = {
        get: jest.fn((key: string) => {
          if (key === 'payments.provider') return 'simulated';
          if (key === 'payments.mode') return 'sandbox';
          if (key === 'payments.simulatedForce') return null;
          if (key === 'payments.webhookLeaseSeconds') return 45;
          if (key === 'payments.simulatedAuthHoldHours') return 168;
          return undefined;
        }),
        getOrThrow: jest.fn((key: string) => {
          if (key === 'payments.webhookSecret') return 'test-webhook-secret-16';
          throw new Error(`missing ${key}`);
        }),
      } as unknown as ConfigService;
      const adapter = new SimulatedPaymentAdapter(config);
      const service = new PaymentsService(
        prisma as never,
        config,
        adapter,
        new PaymentProviderRegistry(config),
      );

      const user = await prisma.user.create({
        data: {
          email: `pay-ref-wh-${suffix}@example.com`,
          passwordHash: 'test-hash',
        },
      });
      const order = await prisma.order.create({
        data: {
          orderNumber: `RW-${suffix}`,
          patientUserId: user.id,
          status: 'PAYMENT_PENDING',
          currency: 'USD',
          subtotalCents: 900,
          totalCents: 900,
        },
      });
      const payRef = `sim_pay_${randomUUID()}`;
      const capRef = `sim_cap_${randomUUID()}`;
      const refundKey = `it-ref-wh-${randomUUID()}`;
      // Seed adapter memory so retrieveRefund sees SUCCESS for this key/ref.
      const gwRefund = await adapter.refund({
        amountCents: 400,
        currency: 'USD',
        providerPaymentRef: payRef,
        providerCaptureRef: capRef,
        idempotencyKey: refundKey,
      });
      const refundRef = gwRefund.providerRefundRef!;

      const payment = await prisma.payment.create({
        data: {
          id: randomUUID(),
          orderId: order.id,
          amountCents: 900,
          capturedAmountCents: 900,
          currency: 'USD',
          status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
          lifecycleState: PaymentLifecycleState.REFUND_PENDING,
          purpose: PaymentPurpose.CHECKOUT,
          initiator: PaymentInitiator.CHECKOUT,
          provider: 'simulated',
          providerPaymentRef: payRef,
          providerCaptureRef: capRef,
          idempotencyKey: `it-ref-wh-pay-${randomUUID()}`,
        },
      });
      const refund = await prisma.refund.create({
        data: {
          paymentId: payment.id,
          amountCents: 400,
          status: RefundStatus.PENDING,
          providerRefundRef: refundRef,
          idempotencyKey: refundKey,
          actorUserId: null,
        },
      });

      try {
        const results = await Promise.allSettled([
          service.reconcilePaymentById(payment.id),
          service.ingestWebhook({
            secretHeader: 'test-webhook-secret-16',
            envelope: {
              provider: 'simulated',
              providerEventId: `evt-ref-wh-${randomUUID()}`,
              type: 'refund.provider_update',
              paymentRef: payRef,
              data: {
                object: {
                  id: refundRef,
                  object: 'refund',
                  amount: 400,
                  currency: 'usd',
                  status: 'succeeded',
                  payment_intent: payRef,
                },
              },
            },
          }),
        ]);
        expect(results.some((r) => r.status === 'fulfilled')).toBe(true);

        const freshRefund = await prisma.refund.findUniqueOrThrow({
          where: { id: refund.id },
        });
        expect(freshRefund.status).toBe(RefundStatus.SUCCEEDED);

        const succeededCount = await prisma.refund.count({
          where: {
            paymentId: payment.id,
            status: RefundStatus.SUCCEEDED,
            amountCents: 400,
          },
        });
        expect(succeededCount).toBe(1);

        const freshPayment = await prisma.payment.findUniqueOrThrow({
          where: { id: payment.id },
        });
        expect(freshPayment.refundedAmountCents).toBe(400);
      } finally {
        await prisma.refund.deleteMany({ where: { paymentId: payment.id } });
        await prisma.paymentWebhookEvent.deleteMany({
          where: { paymentId: payment.id },
        });
        await prisma.payment.delete({ where: { id: payment.id } });
        await prisma.order.delete({ where: { id: order.id } });
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.$disconnect();
      }
    });

    it('renewal lease ownership blocks mutate reconcile while claimToken lease is live', async () => {
      const prisma = createIntegrationPrisma(url);
      await prisma.$connect();
      const suffix = randomUUID().slice(0, 8);
      const config = {
        get: jest.fn((key: string) => {
          if (key === 'payments.provider') return 'simulated';
          if (key === 'payments.mode') return 'sandbox';
          if (key === 'payments.simulatedForce') return null;
          if (key === 'payments.webhookLeaseSeconds') return 45;
          if (key === 'payments.simulatedAuthHoldHours') return 168;
          return undefined;
        }),
        getOrThrow: jest.fn((key: string) => {
          if (key === 'payments.webhookSecret') return 'test-webhook-secret-16';
          throw new Error(`missing ${key}`);
        }),
      } as unknown as ConfigService;
      const adapter = new SimulatedPaymentAdapter(config);
      const captureSpy = jest.spyOn(adapter, 'capture');
      const service = new PaymentsService(
        prisma as never,
        config,
        adapter,
        new PaymentProviderRegistry(config),
      );

      const user = await prisma.user.create({
        data: {
          email: `pay-lease-${suffix}@example.com`,
          passwordHash: 'test-hash',
        },
      });
      const plan = await prisma.subscriptionPlan.create({
        data: {
          name: `Lease Plan ${suffix}`,
          slug: `lease-plan-${suffix}`,
          billingInterval: 'MONTH',
          priceCents: 500,
          productBindings: [],
        },
      });
      const subscription = await prisma.subscription.create({
        data: {
          patientUserId: user.id,
          planId: plan.id,
          status: 'ACTIVE',
        },
      });
      const order = await prisma.order.create({
        data: {
          orderNumber: `LEASE-${suffix}`,
          patientUserId: user.id,
          subscriptionId: subscription.id,
          status: 'PAYMENT_PENDING',
          currency: 'USD',
          subtotalCents: 500,
          totalCents: 500,
        },
      });
      const authKey = `it-lease-auth-${randomUUID()}`;
      const auth = await adapter.authorize({
        amountCents: 500,
        currency: 'USD',
        providerMethodRef: 'sim_pm_test',
        idempotencyKey: authKey,
      });
      const payment = await prisma.payment.create({
        data: {
          id: randomUUID(),
          orderId: order.id,
          subscriptionId: subscription.id,
          amountCents: 500,
          currency: 'USD',
          status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
          lifecycleState: PaymentLifecycleState.CAPTURE_PENDING,
          purpose: PaymentPurpose.RENEWAL,
          initiator: PaymentInitiator.RENEWAL,
          provider: 'simulated',
          providerPaymentRef: auth.providerPaymentRef!,
          providerAuthorizationRef: auth.providerAuthorizationRef!,
          idempotencyKey: authKey,
          authorizedAmountCents: 500,
          authorizedAt: new Date(),
        },
      });
      const attempt = await prisma.subscriptionRenewalAttempt.create({
        data: {
          subscriptionId: subscription.id,
          billingPeriodKey: `bp-${suffix}`,
          orderId: order.id,
          paymentId: payment.id,
          source: 'system',
          claimToken: `claim-${suffix}`,
          leaseExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      try {
        const [a, b] = await Promise.all([
          service.reconcilePaymentById(payment.id),
          service.reconcilePaymentById(payment.id),
        ]);
        expect(a.outcome).toBe('deferred_renewal_lease_held');
        expect(b.outcome).toBe('deferred_renewal_lease_held');

        const fresh = await prisma.payment.findUniqueOrThrow({
          where: { id: payment.id },
        });
        expect(fresh.lifecycleState).toBe(
          PaymentLifecycleState.CAPTURE_PENDING,
        );
        expect(captureSpy).not.toHaveBeenCalled();
      } finally {
        captureSpy.mockRestore();
        await prisma.subscriptionRenewalAttempt.delete({
          where: { id: attempt.id },
        });
        await prisma.payment.delete({ where: { id: payment.id } });
        await prisma.order.delete({ where: { id: order.id } });
        await prisma.subscription.delete({ where: { id: subscription.id } });
        await prisma.subscriptionPlan.delete({ where: { id: plan.id } });
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.$disconnect();
      }
    });
  },
);
