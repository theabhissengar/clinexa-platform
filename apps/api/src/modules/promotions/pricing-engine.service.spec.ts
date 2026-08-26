import { CouponDiscountType, CouponScopeType } from '../../../generated/prisma';

import { OrderTotalsService } from '../orders/order-totals.service';
import { CouponValidationService } from './coupon-validation.service';
import { PricingEngineService } from './pricing-engine.service';

function coupon(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cpn-1',
    code: 'SAVE10',
    isActive: true,
    deletedAt: null,
    applicability: 'ORDER',
    startsAt: null,
    endsAt: null,
    minOrderCents: null,
    maxDiscountCents: null,
    globalUsageLimit: null,
    perUserUsageLimit: null,
    usageCount: 0,
    scopeType: CouponScopeType.ALL,
    scopeProductIds: [] as string[],
    scopeCategoryIds: [] as string[],
    discountType: CouponDiscountType.PERCENT,
    discountValue: 10,
    ...overrides,
  };
}

describe('PricingEngineService', () => {
  const prisma = {
    coupon: {
      findFirst: jest.fn(),
    },
    couponRedemption: { count: jest.fn().mockResolvedValue(0) },
  };
  const validation = new CouponValidationService(prisma as never);
  const engine = new PricingEngineService(validation, new OrderTotalsService());

  const lines = [
    {
      variantId: 'var-1',
      productId: 'prod-1',
      categoryIds: [] as string[],
      quantity: 1,
      unitPriceCents: 1000,
      salePriceCents: 1000,
    },
  ];

  it('computes deterministic percent and capped discounts', async () => {
    prisma.coupon.findFirst.mockResolvedValue(coupon());
    const first = await engine.evaluatePricing({
      couponCode: 'save10',
      patientUserId: 'user-1',
      lines,
    });
    const second = await engine.evaluatePricing({
      couponCode: 'SAVE10',
      patientUserId: 'user-1',
      lines,
    });
    expect(first.orderTotals.totalCents).toBe(900);
    expect(second.orderTotals.totalCents).toBe(first.orderTotals.totalCents);
    expect(first.pricingSnapshot.engineVersion).toBe('p2-mvp-1');
    expect(first.appliedCouponId).toBe('cpn-1');

    prisma.coupon.findFirst.mockResolvedValue(
      coupon({
        discountType: CouponDiscountType.FIXED,
        discountValue: 400,
        maxDiscountCents: 250,
      }),
    );
    const capped = await engine.evaluatePricing({
      couponCode: 'SAVE10',
      patientUserId: 'user-1',
      lines,
    });
    expect(capped.orderTotals.discountTotalCents).toBe(250);
  });

  it('does not inspect coupon fields in the returned order totals contract', async () => {
    prisma.coupon.findFirst.mockResolvedValue(coupon());
    const priced = await engine.evaluatePricing({
      couponCode: 'SAVE10',
      patientUserId: 'user-1',
      lines,
    });
    expect(priced.orderTotals).toEqual({
      subtotalCents: 1000,
      discountTotalCents: 100,
      shippingTotalCents: 0,
      taxTotalCents: 0,
      totalCents: 900,
    });
    expect(priced.pricingSnapshot.couponCode).toBe('SAVE10');
  });
});
