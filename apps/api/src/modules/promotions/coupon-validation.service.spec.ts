import { BadRequestException } from '@nestjs/common';
import { CouponApplicability, CouponDiscountType, CouponScopeType } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { CouponValidationService } from './coupon-validation.service';

function coupon(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cpn-1',
    code: 'SAVE10',
    isActive: true,
    deletedAt: null,
    applicability: CouponApplicability.ORDER,
    startsAt: null,
    endsAt: null,
    minOrderCents: null,
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

describe('CouponValidationService', () => {
  const prisma = {
    coupon: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    couponRedemption: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
    },
  };
  const service = new CouponValidationService(prisma as never);

  const lines = [
    {
      productId: 'prod-1',
      categoryIds: ['cat-1'],
      quantity: 1,
      salePriceCents: 2000,
    },
  ];

  it('accepts a valid active coupon without consuming usage', async () => {
    const result = await service.assertEligible(coupon() as never, {
      patientUserId: 'user-1',
      lines,
    });
    expect(result.eligibleSubtotalCents).toBe(2000);
    expect(prisma.couponRedemption.count).toHaveBeenCalledTimes(0);
    expect(prisma.coupon.update).not.toHaveBeenCalled();
    expect(prisma.couponRedemption.create).not.toHaveBeenCalled();
  });

  it('rejects inactive, expired, and ineligible coupons', async () => {
    await expect(
      service.assertEligible(coupon({ isActive: false }) as never, {
        patientUserId: 'user-1',
        lines,
      }),
    ).rejects.toMatchObject({ response: { code: ErrorCodes.CPN_INVALID } });

    await expect(
      service.assertEligible(
        coupon({ endsAt: new Date('2000-01-01') }) as never,
        { patientUserId: 'user-1', lines },
      ),
    ).rejects.toMatchObject({ response: { code: ErrorCodes.CPN_INVALID } });

    await expect(
      service.assertEligible(
        coupon({ minOrderCents: 5000 }) as never,
        { patientUserId: 'user-1', lines },
      ),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.CPN_INELIGIBLE },
    });
  });

  it('enforces product/category scope', async () => {
    await expect(
      service.assertEligible(
        coupon({
          scopeType: CouponScopeType.PRODUCT,
          scopeProductIds: ['other'],
        }) as never,
        { patientUserId: 'user-1', lines },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const ok = await service.assertEligible(
      coupon({
        scopeType: CouponScopeType.CATEGORY,
        scopeCategoryIds: ['cat-1'],
      }) as never,
      { patientUserId: 'user-1', lines },
    );
    expect(ok.eligibleSubtotalCents).toBe(2000);
  });

  it('treats usage limits as advisory (counts but does not increment)', async () => {
    prisma.coupon.update.mockClear();
    prisma.couponRedemption.create.mockClear();
    prisma.couponRedemption.count.mockResolvedValue(2);
    await expect(
      service.assertEligible(
        coupon({ perUserUsageLimit: 2 }) as never,
        { patientUserId: 'user-1', lines },
      ),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.CPN_INELIGIBLE },
    });
    await expect(
      service.assertEligible(
        coupon({ globalUsageLimit: 1, usageCount: 1 }) as never,
        { patientUserId: 'user-1', lines },
      ),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.CPN_INELIGIBLE },
    });
    expect(prisma.coupon.update).not.toHaveBeenCalled();
    expect(prisma.couponRedemption.create).not.toHaveBeenCalled();
  });

  it('does not mutate usage or insert redemptions on a successful advisory check', async () => {
    prisma.coupon.update.mockClear();
    prisma.couponRedemption.create.mockClear();
    prisma.couponRedemption.count.mockResolvedValue(0);
    const result = await service.assertEligible(
      coupon({
        perUserUsageLimit: 5,
        globalUsageLimit: 10,
        usageCount: 1,
      }) as never,
      { patientUserId: 'user-1', lines },
    );
    expect(result.eligibleSubtotalCents).toBe(2000);
    expect(prisma.couponRedemption.count).toHaveBeenCalled();
    expect(prisma.coupon.update).not.toHaveBeenCalled();
    expect(prisma.couponRedemption.create).not.toHaveBeenCalled();
  });

  it('looks up codes without consuming usage', async () => {
    prisma.couponRedemption.count.mockClear();
    prisma.coupon.findFirst.mockResolvedValue(null);
    await expect(service.findActiveByCode('NOPE')).resolves.toBeNull();
    prisma.coupon.findFirst.mockResolvedValue(coupon());
    const found = await service.findActiveByCode('save10');
    expect(found?.code).toBe('SAVE10');
    expect(prisma.couponRedemption.count).not.toHaveBeenCalled();
  });
});
