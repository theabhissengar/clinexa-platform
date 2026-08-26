import {
  CouponDiscountType,
  CouponRedemptionStatus,
  CouponScopeType,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { CouponValidationService } from './coupon-validation.service';
import { CouponsService } from './coupons.service';

describe('CouponsService.recordRedemption', () => {
  function build() {
    const redemptions: Array<Record<string, unknown>> = [];
    const coupon = {
      id: 'cpn-1',
      globalUsageLimit: 1 as number | null,
      perUserUsageLimit: 1 as number | null,
      usageCount: 0,
      isActive: true,
      deletedAt: null,
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ord-1',
          appliedCouponId: 'cpn-1',
          patientUserId: 'user-1',
          discountTotalCents: 100,
        }),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      coupon: {
        findUnique: jest.fn().mockResolvedValue(coupon),
        update: jest.fn(
          ({
            data,
          }: {
            data: { usageCount?: { increment: number }; isActive?: boolean };
          }) => {
            if (data.usageCount?.increment != null) {
              coupon.usageCount += data.usageCount.increment;
            }
            if (data.isActive !== undefined) {
              coupon.isActive = data.isActive;
            }
            return Promise.resolve(coupon);
          },
        ),
      },
      couponRedemption: {
        findFirst: jest.fn(
          ({
            where,
          }: {
            where: { orderId?: string; couponId?: string; status?: string };
          }) =>
            Promise.resolve(
              redemptions.find(
                (r) =>
                  r.status === CouponRedemptionStatus.RECORDED &&
                  r.orderId === where.orderId &&
                  r.couponId === where.couponId,
              ) ?? null,
            ),
        ),
        count: jest.fn(
          ({
            where,
          }: {
            where?: {
              couponId?: string;
              patientUserId?: string;
              status?: string;
            };
          } = {}) =>
            Promise.resolve(
              redemptions.filter((r) => {
                if (where?.status && r.status !== where.status) {
                  return false;
                }
                if (where?.couponId && r.couponId !== where.couponId) {
                  return false;
                }
                if (
                  where?.patientUserId &&
                  r.patientUserId !== where.patientUserId
                ) {
                  return false;
                }
                return true;
              }).length,
            ),
        ),
        findMany: jest.fn(
          ({ select }: { select?: Record<string, boolean> }) =>
            Promise.resolve(
              redemptions.map((row) => {
                if (!select) {
                  return row;
                }
                return Object.fromEntries(
                  Object.keys(select)
                    .filter((key) => select[key])
                    .map((key) => [key, row[key]]),
                );
              }),
            ),
        ),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `red-${redemptions.length + 1}`, ...data };
          redemptions.push(row);
          return Promise.resolve(row);
        }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
      _redemptions: redemptions,
      _coupon: coupon,
    };
    const service = new CouponsService(
      prisma as never,
      new CouponValidationService(prisma as never),
    );
    return { service, prisma };
  }

  it('records redemption only once and rejects over-limit without rolling back', async () => {
    const { service, prisma } = build();
    const first = await service.recordRedemption({
      orderId: 'ord-1',
      paymentId: 'pay-1',
    });
    expect(first.outcome).toBe('recorded');
    expect(prisma._coupon.usageCount).toBe(1);

    prisma.order.findUnique.mockResolvedValue({
      id: 'ord-2',
      appliedCouponId: 'cpn-1',
      patientUserId: 'user-2',
      discountTotalCents: 100,
    });
    const second = await service.recordRedemption({
      orderId: 'ord-2',
      paymentId: 'pay-2',
    });
    expect(second.outcome).toBe('limit_exceeded');
    expect(second).toMatchObject({ errorCode: ErrorCodes.CPN_REDEMPTION_LIMIT });
    expect(prisma._coupon.usageCount).toBe(1);
    expect(
      prisma._redemptions.some(
        (r) => r.status === CouponRedemptionStatus.FAILED_LIMIT,
      ),
    ).toBe(true);
  });

  it('is a no-op when the order has no coupon', async () => {
    const { service, prisma } = build();
    prisma.order.findUnique.mockResolvedValue({
      id: 'ord-x',
      appliedCouponId: null,
      patientUserId: 'user-1',
      discountTotalCents: 0,
    });
    const result = await service.recordRedemption({
      orderId: 'ord-x',
      paymentId: 'pay-x',
    });
    expect(result.outcome).toBe('none');
  });

  it('enforces per-user usage limit without rolling back payment', async () => {
    const { service, prisma } = build();
    prisma._coupon.globalUsageLimit = null;
    prisma._coupon.perUserUsageLimit = 1;
    const first = await service.recordRedemption({
      orderId: 'ord-1',
      paymentId: 'pay-1',
    });
    expect(first.outcome).toBe('recorded');

    prisma.order.findUnique.mockResolvedValue({
      id: 'ord-1b',
      appliedCouponId: 'cpn-1',
      patientUserId: 'user-1',
      discountTotalCents: 100,
    });
    const second = await service.recordRedemption({
      orderId: 'ord-1b',
      paymentId: 'pay-1b',
    });
    expect(second.outcome).toBe('limit_exceeded');
    expect(prisma._coupon.usageCount).toBe(1);
  });

  it('returns API-147 redemption fields without rulesJson', async () => {
    const { service, prisma } = build();
    await service.recordRedemption({
      orderId: 'ord-1',
      paymentId: 'pay-1',
    });
    const listed = await service.listRedemptions('cpn-1', { skip: 0, take: 50 });
    expect(listed.total).toBe(1);
    expect(listed.items[0]).toEqual(
      expect.objectContaining({
        orderId: 'ord-1',
        patientUserId: 'user-1',
        discountAppliedCents: 100,
        status: CouponRedemptionStatus.RECORDED,
      }),
    );
    expect(listed.items[0]).not.toHaveProperty('rulesJson');
    expect(prisma.coupon.findUnique).toHaveBeenCalled();
  });

  it('deactivates a coupon without mutating order snapshots', async () => {
    const { service, prisma } = build();
    const snapshot = {
      engineVersion: 'p2-mvp-1',
      couponCode: 'SAVE10',
      couponId: 'cpn-1',
      orderBreakdown: { totalCents: 900, discountTotalCents: 100 },
    };
    const orderRow = {
      id: 'ord-1',
      appliedCouponId: 'cpn-1',
      discountTotalCents: 100,
      totalCents: 900,
      pricingSnapshotJson: snapshot,
      items: [{ discountCents: 100 }],
    };
    prisma.order.findUnique.mockResolvedValue(orderRow);
    const frozen = structuredClone(orderRow);
    await service.deactivateCoupon('cpn-1');
    prisma._coupon.usageCount = 99;
    const reread = await prisma.order.findUnique({ where: { id: 'ord-1' } });
    expect(reread).toEqual(frozen);
    expect(reread?.pricingSnapshotJson).toEqual(snapshot);
    expect(prisma.coupon.update).toHaveBeenCalledWith({
      where: { id: 'cpn-1' },
      data: { isActive: false },
    });
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });
});

describe('CouponsService create/update scope', () => {
  const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
  const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';

  function buildCrud() {
    const stored: Record<string, unknown> = {
      id: 'cpn-1',
      scopeType: 'ALL',
      scopeProductIds: [] as string[],
      scopeCategoryIds: [] as string[],
      discountType: 'PERCENT',
      discountValue: 10,
      name: 'Save',
      description: null,
      isActive: true,
      minOrderCents: null,
      maxDiscountCents: null,
      startsAt: null,
      endsAt: null,
      globalUsageLimit: null,
      perUserUsageLimit: null,
    };
    const prisma = {
      coupon: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          Object.assign(stored, data, { id: 'cpn-created' });
          return Promise.resolve({ ...stored });
        }),
        findUnique: jest.fn(() => Promise.resolve({ ...stored })),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          Object.assign(stored, data);
          return Promise.resolve({ ...stored });
        }),
      },
      product: {
        count: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(
            (where.id.in ?? []).filter((id) => id === PRODUCT_ID).length,
          ),
        ),
      },
      category: {
        count: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(
            (where.id.in ?? []).filter((id) => id === CATEGORY_ID).length,
          ),
        ),
      },
      order: {
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    const service = new CouponsService(
      prisma as never,
      new CouponValidationService(prisma as never),
    );
    return { service, prisma, stored };
  }

  const base = {
    code: 'SAVE10',
    name: 'Save 10',
    discountType: CouponDiscountType.PERCENT,
    discountValue: 10,
  };

  it('creates an ALL coupon without requiring scope IDs', async () => {
    const { service, prisma } = buildCrud();
    const created = await service.createCoupon({
      ...base,
      scopeType: CouponScopeType.ALL,
    });
    expect(created.scopeType).toBe('ALL');
    expect(created.scopeProductIds).toEqual([]);
    expect(prisma.product.count).not.toHaveBeenCalled();
  });

  it('creates a PRODUCT coupon with valid product IDs', async () => {
    const { service, prisma } = buildCrud();
    const created = await service.createCoupon({
      ...base,
      scopeType: CouponScopeType.PRODUCT,
      scopeProductIds: [PRODUCT_ID],
    });
    expect(created.scopeType).toBe('PRODUCT');
    expect(created.scopeProductIds).toEqual([PRODUCT_ID]);
    expect(prisma.product.count).toHaveBeenCalled();
  });

  it('rejects PRODUCT coupons with an empty ID list', async () => {
    const { service } = buildCrud();
    await expect(
      service.createCoupon({
        ...base,
        scopeType: CouponScopeType.PRODUCT,
        scopeProductIds: [],
      }),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.VAL_MISSING_FIELD },
    });
  });

  it('creates a CATEGORY coupon with valid category IDs', async () => {
    const { service } = buildCrud();
    const created = await service.createCoupon({
      ...base,
      scopeType: CouponScopeType.CATEGORY,
      scopeCategoryIds: [CATEGORY_ID],
    });
    expect(created.scopeType).toBe('CATEGORY');
    expect(created.scopeCategoryIds).toEqual([CATEGORY_ID]);
  });

  it('rejects CATEGORY coupons with an empty ID list', async () => {
    const { service } = buildCrud();
    await expect(
      service.createCoupon({
        ...base,
        scopeType: CouponScopeType.CATEGORY,
        scopeCategoryIds: [],
      }),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.VAL_MISSING_FIELD },
    });
  });

  it('rejects PRODUCT update that clears scope IDs', async () => {
    const { service, stored } = buildCrud();
    stored.scopeType = 'PRODUCT';
    stored.scopeProductIds = [PRODUCT_ID];
    await expect(
      service.updateCoupon('cpn-1', { scopeProductIds: [] }),
    ).rejects.toMatchObject({
      response: { code: ErrorCodes.VAL_MISSING_FIELD },
    });
  });

  it('does not rewrite orders when a coupon is edited', async () => {
    const { service, prisma } = buildCrud();
    await service.updateCoupon('cpn-1', { name: 'Renamed', discountValue: 20 });
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });
});
