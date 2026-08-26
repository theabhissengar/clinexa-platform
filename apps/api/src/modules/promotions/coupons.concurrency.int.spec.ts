import { randomUUID } from 'crypto';
import {
  CouponDiscountType,
  CouponRedemptionStatus,
  CouponScopeType,
  OrderStatus,
  PaymentLifecycleState,
  PaymentPurpose,
  PaymentStatus,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { CouponValidationService } from './coupon-validation.service';
import { CouponsService } from './coupons.service';
import {
  createIntegrationPrisma,
  integrationDatabaseUrl,
  shouldRunPostgresIntegration,
} from '../payments/postgres-integration.util';

const databaseUrl = integrationDatabaseUrl();
const describePostgres = shouldRunPostgresIntegration()
  ? describe
  : describe.skip;

/**
 * Real overlapping Postgres transactions against coupon row FOR UPDATE.
 * Skipped when DATABASE_URL is unset, and in CI unless RUN_POSTGRES_INTEGRATION=1.
 */
describePostgres('CouponsService redemption concurrency (Postgres)', () => {
  const url = databaseUrl!;

  it('concurrent capture-success redemptions cannot exceed the global usage limit', async () => {
    const prisma = createIntegrationPrisma(url);
    await prisma.$connect();
    const service = new CouponsService(
      prisma as never,
      new CouponValidationService(prisma as never),
    );

    const suffix = randomUUID();
    const userA = await prisma.user.create({
      data: {
        email: `it-cpn-a-${suffix}@example.test`,
        passwordHash: 'test-hash',
      },
    });
    const userB = await prisma.user.create({
      data: {
        email: `it-cpn-b-${suffix}@example.test`,
        passwordHash: 'test-hash',
      },
    });
    const coupon = await prisma.coupon.create({
      data: {
        code: `ITGLB${suffix.slice(0, 8).toUpperCase()}`,
        name: 'Concurrency global',
        discountType: CouponDiscountType.PERCENT,
        discountValue: 10,
        globalUsageLimit: 1,
        scopeType: CouponScopeType.ALL,
      },
    });
    const snapshot = {
      computedAt: new Date().toISOString(),
      engineVersion: 'p2-mvp-1',
      couponCode: coupon.code,
      couponId: coupon.id,
      couponRuleSnapshot: { discountType: 'PERCENT', discountValue: 10 },
      lineBreakdown: [],
      orderBreakdown: {
        subtotalCents: 1000,
        discountTotalCents: 100,
        shippingTotalCents: 0,
        taxTotalCents: 0,
        totalCents: 900,
      },
    };
    const orderA = await prisma.order.create({
      data: {
        orderNumber: `IT-A-${suffix.slice(0, 8)}`,
        patientUserId: userA.id,
        status: OrderStatus.PAYMENT_PENDING,
        subtotalCents: 1000,
        discountTotalCents: 100,
        totalCents: 900,
        appliedCouponId: coupon.id,
        pricingSnapshotJson: snapshot,
      },
    });
    const orderB = await prisma.order.create({
      data: {
        orderNumber: `IT-B-${suffix.slice(0, 8)}`,
        patientUserId: userB.id,
        status: OrderStatus.PAYMENT_PENDING,
        subtotalCents: 1000,
        discountTotalCents: 100,
        totalCents: 900,
        appliedCouponId: coupon.id,
        pricingSnapshotJson: snapshot,
      },
    });
    const paymentA = await prisma.payment.create({
      data: {
        orderId: orderA.id,
        amountCents: 900,
        currency: 'USD',
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
        lifecycleState: PaymentLifecycleState.CAPTURED,
        purpose: PaymentPurpose.CHECKOUT,
        provider: 'simulated',
        providerPaymentRef: `sim_pay_a_${suffix}`,
        providerCaptureRef: `sim_cap_a_${suffix}`,
        idempotencyKey: `it-cpn-pay-a-${suffix}`,
      },
    });
    const paymentB = await prisma.payment.create({
      data: {
        orderId: orderB.id,
        amountCents: 900,
        currency: 'USD',
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
        lifecycleState: PaymentLifecycleState.CAPTURED,
        purpose: PaymentPurpose.CHECKOUT,
        provider: 'simulated',
        providerPaymentRef: `sim_pay_b_${suffix}`,
        providerCaptureRef: `sim_cap_b_${suffix}`,
        idempotencyKey: `it-cpn-pay-b-${suffix}`,
      },
    });

    try {
      const results = await Promise.all([
        service.recordRedemption({
          orderId: orderA.id,
          paymentId: paymentA.id,
        }),
        service.recordRedemption({
          orderId: orderB.id,
          paymentId: paymentB.id,
        }),
      ]);
      const recorded = results.filter((r) => r.outcome === 'recorded');
      const limited = results.filter((r) => r.outcome === 'limit_exceeded');
      expect(recorded).toHaveLength(1);
      expect(limited).toHaveLength(1);
      expect(limited[0]).toMatchObject({
        errorCode: ErrorCodes.CPN_REDEMPTION_LIMIT,
      });

      const refreshedCoupon = await prisma.coupon.findUniqueOrThrow({
        where: { id: coupon.id },
      });
      expect(refreshedCoupon.usageCount).toBe(1);

      const redemptions = await prisma.couponRedemption.findMany({
        where: { couponId: coupon.id },
      });
      expect(
        redemptions.filter((r) => r.status === CouponRedemptionStatus.RECORDED),
      ).toHaveLength(1);
      expect(
        redemptions.filter(
          (r) => r.status === CouponRedemptionStatus.FAILED_LIMIT,
        ),
      ).toHaveLength(1);

      const [freshA, freshB] = await Promise.all([
        prisma.order.findUniqueOrThrow({ where: { id: orderA.id } }),
        prisma.order.findUniqueOrThrow({ where: { id: orderB.id } }),
      ]);
      expect(freshA.totalCents).toBe(900);
      expect(freshB.totalCents).toBe(900);
      expect(freshA.discountTotalCents).toBe(100);
      expect(freshB.discountTotalCents).toBe(100);
      expect(freshA.pricingSnapshotJson).toEqual(snapshot);
      expect(freshB.pricingSnapshotJson).toEqual(snapshot);
    } finally {
      await prisma.couponRedemption.deleteMany({
        where: { couponId: coupon.id },
      });
      await prisma.payment.deleteMany({
        where: { id: { in: [paymentA.id, paymentB.id] } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: [orderA.id, orderB.id] } },
      });
      await prisma.coupon.delete({ where: { id: coupon.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [userA.id, userB.id] } },
      });
      await prisma.$disconnect();
    }
  });

  it('concurrent redemptions cannot exceed the per-user usage limit', async () => {
    const prisma = createIntegrationPrisma(url);
    await prisma.$connect();
    const service = new CouponsService(
      prisma as never,
      new CouponValidationService(prisma as never),
    );
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: `it-cpn-u-${suffix}@example.test`,
        passwordHash: 'test-hash',
      },
    });
    const coupon = await prisma.coupon.create({
      data: {
        code: `ITUSR${suffix.slice(0, 8).toUpperCase()}`,
        name: 'Concurrency per-user',
        discountType: CouponDiscountType.FIXED,
        discountValue: 100,
        perUserUsageLimit: 1,
        scopeType: CouponScopeType.ALL,
      },
    });
    const orderA = await prisma.order.create({
      data: {
        orderNumber: `IT-UA-${suffix.slice(0, 8)}`,
        patientUserId: user.id,
        status: OrderStatus.PAYMENT_PENDING,
        subtotalCents: 1000,
        discountTotalCents: 100,
        totalCents: 900,
        appliedCouponId: coupon.id,
      },
    });
    const orderB = await prisma.order.create({
      data: {
        orderNumber: `IT-UB-${suffix.slice(0, 8)}`,
        patientUserId: user.id,
        status: OrderStatus.PAYMENT_PENDING,
        subtotalCents: 1000,
        discountTotalCents: 100,
        totalCents: 900,
        appliedCouponId: coupon.id,
      },
    });
    const paymentA = await prisma.payment.create({
      data: {
        orderId: orderA.id,
        amountCents: 900,
        currency: 'USD',
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
        lifecycleState: PaymentLifecycleState.CAPTURED,
        purpose: PaymentPurpose.CHECKOUT,
        provider: 'simulated',
        idempotencyKey: `it-cpn-user-a-${suffix}`,
      },
    });
    const paymentB = await prisma.payment.create({
      data: {
        orderId: orderB.id,
        amountCents: 900,
        currency: 'USD',
        status: PaymentStatus.AUTHORIZED_OR_CAPTURED,
        lifecycleState: PaymentLifecycleState.CAPTURED,
        purpose: PaymentPurpose.CHECKOUT,
        provider: 'simulated',
        idempotencyKey: `it-cpn-user-b-${suffix}`,
      },
    });

    try {
      const results = await Promise.all([
        service.recordRedemption({
          orderId: orderA.id,
          paymentId: paymentA.id,
        }),
        service.recordRedemption({
          orderId: orderB.id,
          paymentId: paymentB.id,
        }),
      ]);
      expect(results.filter((r) => r.outcome === 'recorded')).toHaveLength(1);
      expect(
        results.filter((r) => r.outcome === 'limit_exceeded'),
      ).toHaveLength(1);
      const refreshed = await prisma.coupon.findUniqueOrThrow({
        where: { id: coupon.id },
      });
      expect(refreshed.usageCount).toBe(1);
    } finally {
      await prisma.couponRedemption.deleteMany({
        where: { couponId: coupon.id },
      });
      await prisma.payment.deleteMany({
        where: { id: { in: [paymentA.id, paymentB.id] } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: [orderA.id, orderB.id] } },
      });
      await prisma.coupon.delete({ where: { id: coupon.id } });
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.$disconnect();
    }
  });
});
