import { BadRequestException, Injectable } from '@nestjs/common';
import type { Coupon } from '../../../generated/prisma';

import { ErrorCodes } from '../../common/constants/error-codes';
import { OrderTotalsService } from '../orders/order-totals.service';
import { CouponValidationService } from './coupon-validation.service';
import {
  PRICING_ENGINE_VERSION,
  type EvaluatePricingInput,
  type EvaluatePricingResult,
  type PricingSnapshot,
} from './promotion.types';

/**
 * Price calculation only. Never consumes coupon usage.
 */
@Injectable()
export class PricingEngineService {
  constructor(
    private readonly validation: CouponValidationService,
    private readonly totals: OrderTotalsService,
  ) {}

  async evaluatePricing(
    input: EvaluatePricingInput,
  ): Promise<EvaluatePricingResult> {
    if (!input.lines.length) {
      throw new BadRequestException({
        code: ErrorCodes.ORD_INVALID_ITEM,
        message: 'Order requires at least one line item',
      });
    }

    const couponCode = input.couponCode?.trim()
      ? this.validation.normalizeCode(input.couponCode)
      : null;
    let coupon: Coupon | null = null;
    let eligibleSubtotalCents = 0;

    if (couponCode) {
      coupon = await this.validation.findActiveByCode(couponCode);
      if (!coupon) {
        throw new BadRequestException({
          code: ErrorCodes.CPN_INVALID,
          message: 'Coupon is invalid',
        });
      }
      const eligibility = await this.validation.assertEligible(coupon, {
        patientUserId: input.patientUserId,
        lines: input.lines,
      });
      eligibleSubtotalCents = eligibility.eligibleSubtotalCents;
    }

    const rawDiscount = coupon
      ? this.computeCouponDiscountCents(coupon, eligibleSubtotalCents)
      : 0;

    const lineDiscounts = this.allocateLineDiscounts(
      input.lines,
      coupon,
      rawDiscount,
    );

    const lineResults = input.lines.map((line) => {
      const allocated = lineDiscounts.find(
        (d) => d.variantId === line.variantId,
      );
      const discountCents = coupon
        ? (allocated?.discountCents ?? 0)
        : (line.discountCents ?? 0);
      return this.totals.computeLine({
        unitPriceCents: line.unitPriceCents,
        salePriceCents: line.salePriceCents,
        quantity: line.quantity,
        discountCents,
        taxCents: line.taxCents ?? 0,
      });
    });

    const orderTotals = this.totals.computeOrder({
      lines: lineResults,
      shippingTotalCents: input.shippingTotalCents ?? 0,
      discountTotalCents: lineResults.reduce(
        (sum, line) => sum + line.discountCents,
        0,
      ),
      taxTotalCents: input.taxTotalCents ?? 0,
    });

    const snapshot: PricingSnapshot = {
      computedAt: new Date().toISOString(),
      engineVersion: PRICING_ENGINE_VERSION,
      couponCode: coupon?.code ?? null,
      couponId: coupon?.id ?? null,
      couponRuleSnapshot: coupon
        ? {
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            minOrderCents: coupon.minOrderCents,
            maxDiscountCents: coupon.maxDiscountCents,
            scopeType: coupon.scopeType,
            applicability: coupon.applicability,
          }
        : null,
      lineBreakdown: input.lines.map((line, index) => ({
        orderItemRef: line.variantId,
        productId: line.productId,
        basePriceCents: lineResults[index].lineSubtotalCents,
        discountCents: lineResults[index].discountCents,
        lineTotalCents: lineResults[index].lineTotalCents,
      })),
      orderBreakdown: {
        subtotalCents: orderTotals.subtotalCents,
        discountTotalCents: orderTotals.discountTotalCents,
        shippingTotalCents: orderTotals.shippingTotalCents,
        taxTotalCents: orderTotals.taxTotalCents,
        totalCents: orderTotals.totalCents,
      },
    };

    return {
      appliedCouponId: coupon?.id ?? null,
      lineDiscounts: input.lines.map((line, index) => ({
        variantId: line.variantId,
        discountCents: lineResults[index].discountCents,
      })),
      orderTotals: {
        subtotalCents: orderTotals.subtotalCents,
        discountTotalCents: orderTotals.discountTotalCents,
        shippingTotalCents: orderTotals.shippingTotalCents,
        taxTotalCents: orderTotals.taxTotalCents,
        totalCents: orderTotals.totalCents,
      },
      pricingSnapshot: snapshot,
    };
  }

  computeCouponDiscountCents(coupon: Coupon, eligibleSubtotalCents: number): number {
    let discount = 0;
    if (coupon.discountType === 'PERCENT') {
      discount = Math.floor(
        (eligibleSubtotalCents * coupon.discountValue) / 100,
      );
    } else {
      discount = coupon.discountValue;
    }
    if (coupon.maxDiscountCents != null) {
      discount = Math.min(discount, coupon.maxDiscountCents);
    }
    return Math.min(Math.max(discount, 0), eligibleSubtotalCents);
  }

  allocateLineDiscounts(
    lines: EvaluatePricingInput['lines'],
    coupon: Coupon | null,
    discountTotalCents: number,
  ): Array<{ variantId: string; discountCents: number }> {
    if (!coupon || discountTotalCents <= 0) {
      return lines.map((line) => ({
        variantId: line.variantId,
        discountCents: 0,
      }));
    }

    const eligible = lines.map((line, index) => ({
      index,
      line,
      subtotal: this.validation.lineInScope(coupon, line)
        ? line.salePriceCents * line.quantity
        : 0,
    }));
    const eligibleTotal = eligible.reduce((sum, row) => sum + row.subtotal, 0);
    if (eligibleTotal <= 0) {
      return lines.map((line) => ({
        variantId: line.variantId,
        discountCents: 0,
      }));
    }

    const allocated = lines.map((line) => ({
      variantId: line.variantId,
      discountCents: 0,
    }));
    let remaining = discountTotalCents;
    const lastEligible = [...eligible]
      .reverse()
      .find((row) => row.subtotal > 0);
    for (const row of eligible) {
      if (row.subtotal <= 0 || !lastEligible) continue;
      if (row.index === lastEligible.index) continue;
      const share = Math.floor(
        (discountTotalCents * row.subtotal) / eligibleTotal,
      );
      allocated[row.index].discountCents = share;
      remaining -= share;
    }
    if (lastEligible) {
      allocated[lastEligible.index].discountCents = remaining;
    }
    return allocated;
  }
}
