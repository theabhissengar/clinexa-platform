import { validate } from 'class-validator';

import {
  CouponApplicability,
  CouponDiscountType,
} from '../../../../generated/prisma';
import { CreateCouponDto } from './coupon.dto';

describe('CreateCouponDto', () => {
  function dto(overrides: Partial<CreateCouponDto> = {}): CreateCouponDto {
    return Object.assign(new CreateCouponDto(), {
      code: 'SAVE10',
      name: 'Save 10',
      discountType: CouponDiscountType.PERCENT,
      discountValue: 10,
      ...overrides,
    });
  }

  it('accepts omitted or ORDER applicability', async () => {
    expect(await validate(dto())).toHaveLength(0);
    expect(
      await validate(dto({ applicability: CouponApplicability.ORDER })),
    ).toHaveLength(0);
  });

  it('rejects non-ORDER applicability', async () => {
    const errors = await validate(
      dto({
        applicability:
          CouponApplicability.SUBSCRIPTION as CreateCouponDto['applicability'],
      }),
    );
    expect(errors.some((e) => e.property === 'applicability')).toBe(true);
  });
});
