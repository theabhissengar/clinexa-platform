import type { PrismaClient } from '../generated/prisma';

/** Dev-only QA coupons. No secrets. */
export async function seedDevCouponsDataset(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.coupon.upsert({
    where: { code: 'SAVE10' },
    create: {
      code: 'SAVE10',
      name: 'Save 10%',
      description: 'Dev QA percent coupon',
      isActive: true,
      isAutomatic: false,
      applicability: 'ORDER',
      discountType: 'PERCENT',
      discountValue: 10,
      scopeType: 'ALL',
    },
    update: { isActive: true, deletedAt: null },
  });
  await prisma.coupon.upsert({
    where: { code: 'FIVEOFF' },
    create: {
      code: 'FIVEOFF',
      name: '$5 off',
      description: 'Dev QA fixed coupon (500 cents)',
      isActive: true,
      isAutomatic: false,
      applicability: 'ORDER',
      discountType: 'FIXED',
      discountValue: 500,
      minOrderCents: 1500,
      maxDiscountCents: 500,
      scopeType: 'ALL',
    },
    update: { isActive: true, deletedAt: null },
  });
}
