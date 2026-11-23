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
