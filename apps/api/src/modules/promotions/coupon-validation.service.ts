import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CouponApplicability,
  type Coupon,
} from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { PricingLineInput } from './promotion.types';

export type CouponValidationContext = {
  patientUserId: string;
  now?: Date;
  lines: Array<
    Pick<
      PricingLineInput,
      'productId' | 'categoryIds' | 'quantity' | 'salePriceCents'
    >
  >;
};

/**
 * Eligibility only. MUST NOT reserve or consume usage counters.
 */
@Injectable()
export class CouponValidationService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  async findActiveByCode(code: string): Promise<Coupon | null> {
    return this.prisma.coupon.findFirst({
      where: {
        code: this.normalizeCode(code),
        deletedAt: null,
      },
    });
  }

  async assertEligible(
    coupon: Coupon,
    context: CouponValidationContext,
  ): Promise<{ eligibleSubtotalCents: number }> {
    const now = context.now ?? new Date();

    if (!coupon.isActive || coupon.deletedAt != null) {
      throw new BadRequestException({
        code: ErrorCodes.CPN_INVALID,
        message: 'Coupon is inactive',
      });
    }
    if (coupon.applicability !== CouponApplicability.ORDER) {
      throw new BadRequestException({
        code: ErrorCodes.CPN_INELIGIBLE,
        message: 'Coupon is not applicable to orders in this phase',
      });
    }
    if (coupon.startsAt && now < coupon.startsAt) {
      throw new BadRequestException({
        code: ErrorCodes.CPN_INVALID,
        message: 'Coupon is not yet active',
      });
    }
    if (coupon.endsAt && now > coupon.endsAt) {
      throw new BadRequestException({
        code: ErrorCodes.CPN_INVALID,
        message: 'Coupon has expired',
      });
    }

    const eligibleLines = context.lines.filter((line) =>
      this.lineInScope(coupon, line),
    );
    if (eligibleLines.length === 0) {
      throw new BadRequestException({
        code: ErrorCodes.CPN_INELIGIBLE,
        message: 'Coupon does not apply to any line items',
      });
    }

    const eligibleSubtotalCents = eligibleLines.reduce(
      (sum, line) => sum + line.salePriceCents * line.quantity,
      0,
    );
    if (
      coupon.minOrderCents != null &&
      eligibleSubtotalCents < coupon.minOrderCents
    ) {
      throw new BadRequestException({
        code: ErrorCodes.CPN_INELIGIBLE,
        message: 'Order does not meet the coupon minimum',
      });
    }

    if (
      coupon.globalUsageLimit != null &&
      coupon.usageCount >= coupon.globalUsageLimit
    ) {
      throw new BadRequestException({
        code: ErrorCodes.CPN_INELIGIBLE,
        message: 'Coupon global usage limit reached',
      });
    }

    if (coupon.perUserUsageLimit != null) {
      const used = await this.prisma.couponRedemption.count({
        where: {
          couponId: coupon.id,
          patientUserId: context.patientUserId,
          status: 'RECORDED',
        },
      });
      if (used >= coupon.perUserUsageLimit) {
        throw new BadRequestException({
          code: ErrorCodes.CPN_INELIGIBLE,
          message: 'Coupon per-user usage limit reached',
        });
      }
    }

    return { eligibleSubtotalCents };
  }

  lineInScope(
    coupon: Coupon,
    line: Pick<PricingLineInput, 'productId' | 'categoryIds'>,
  ): boolean {
    if (coupon.scopeType === 'ALL') {
      return true;
    }
    if (coupon.scopeType === 'PRODUCT') {
      return coupon.scopeProductIds.includes(line.productId);
    }
    if (coupon.scopeType === 'CATEGORY') {
      return line.categoryIds.some((id) =>
        coupon.scopeCategoryIds.includes(id),
      );
    }
    return false;
  }
}
