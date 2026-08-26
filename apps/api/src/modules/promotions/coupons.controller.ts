import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ErrorCodes } from '../../common/constants/error-codes';
import { Permissions } from '../rbac/constants/permissions';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CouponValidationService } from './coupon-validation.service';
import { ValidateCouponDto } from './dto/coupon.dto';

@ApiTags('coupons')
@ApiBearerAuth()
@Controller({ path: 'coupons', version: '1' })
export class CouponsController {
  constructor(private readonly validation: CouponValidationService) {}

  @Post('validate')
  @RequirePermissions(Permissions.CPN_REDEEM)
  @ApiOperation({
    summary: 'Advisory coupon validation (API-142) — does not consume usage',
  })
  async validate(@Body() dto: ValidateCouponDto) {
    if (!dto.lines?.length) {
      throw new BadRequestException({
        code: ErrorCodes.VAL_MISSING_FIELD,
        message: 'lines are required',
      });
    }
    const coupon = await this.validation.findActiveByCode(dto.code);
    if (!coupon) {
      throw new BadRequestException({
        code: ErrorCodes.CPN_INVALID,
        message: 'Coupon is invalid',
      });
    }
    const { eligibleSubtotalCents } = await this.validation.assertEligible(
      coupon,
      {
        patientUserId: dto.patientUserId,
        lines: dto.lines.map((line) => ({
          productId: line.productId,
          categoryIds: line.categoryIds ?? [],
          quantity: line.quantity,
          salePriceCents: line.salePriceCents,
        })),
      },
    );
    return {
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      eligibleSubtotalCents,
    };
  }
}
