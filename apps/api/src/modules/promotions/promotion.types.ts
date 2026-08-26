export const PRICING_ENGINE_VERSION = 'p2-mvp-1';

export type PricingLineInput = {
  variantId: string;
  productId: string;
  categoryIds: string[];
  quantity: number;
  unitPriceCents: number;
  salePriceCents: number;
  taxCents?: number;
  /** Client/line discounts used only when no coupon is applied. */
  discountCents?: number;
};

export type EvaluatePricingInput = {
  couponCode?: string | null;
  patientUserId: string;
  currency?: string;
  shippingTotalCents?: number;
  taxTotalCents?: number;
  lines: PricingLineInput[];
};

export type CouponRuleSnapshot = {
  discountType: string;
  discountValue: number;
  minOrderCents: number | null;
  maxDiscountCents: number | null;
  scopeType: string;
  applicability: string;
};

export type PricingSnapshot = {
  computedAt: string;
  engineVersion: string;
  couponCode: string | null;
  couponId: string | null;
  couponRuleSnapshot: CouponRuleSnapshot | null;
  lineBreakdown: Array<{
    orderItemRef: string;
    productId: string;
    basePriceCents: number;
    discountCents: number;
    lineTotalCents: number;
  }>;
  orderBreakdown: {
    subtotalCents: number;
    discountTotalCents: number;
    shippingTotalCents: number;
    taxTotalCents: number;
    totalCents: number;
  };
};

export type EvaluatePricingResult = {
  appliedCouponId: string | null;
  lineDiscounts: Array<{ variantId: string; discountCents: number }>;
  orderTotals: {
    subtotalCents: number;
    discountTotalCents: number;
    shippingTotalCents: number;
    taxTotalCents: number;
    totalCents: number;
  };
  pricingSnapshot: PricingSnapshot;
};

export type RecordRedemptionResult =
  | { outcome: 'none' }
  | { outcome: 'recorded'; redemptionId: string; alreadyExisted: boolean }
  | {
      outcome: 'limit_exceeded';
      errorCode: string;
      couponId: string;
      orderId: string;
      paymentId: string;
    };
