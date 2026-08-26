import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
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
} from './postgres-integration.util';
import { SimulatedPaymentAdapter } from './simulated-payment.adapter';

const databaseUrl = integrationDatabaseUrl();
const describePostgres = databaseUrl ? describe : describe.skip;

/**
 * Real overlapping Postgres transactions.
 * Skipped when DATABASE_URL is unset — unit tests must not be treated as race proofs.
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
        currency: 'USD',
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
        lifecycleState: PaymentLifecycleState.CAPTURED,
        purpose: PaymentPurpose.CHECKOUT,
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
});
