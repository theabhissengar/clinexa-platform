import type {
  CouponScopeType,
  CreateCouponPayload,
  CouponDiscountType,
} from "@/features/coupons/types";

export type CouponFormValues = {
  code: string;
  name: string;
  description: string;
  discountType: CouponDiscountType;
  discountValue: string;
  minOrderCents: string;
  maxDiscountCents: string;
  scopeType: CouponScopeType;
  scopeProductIds: string[];
  scopeCategoryIds: string[];
  startsAt: string;
  endsAt: string;
  globalUsageLimit: string;
  perUserUsageLimit: string;
};

/**
 * Builds the Admin coupon create/update payload.
 * PRODUCT/CATEGORY always include the selected catalog IDs (never omitted).
 */
export function buildCouponFormPayload(
  values: CouponFormValues,
): CreateCouponPayload {
  const payload: CreateCouponPayload = {
    code: values.code,
    name: values.name,
    description: values.description || undefined,
    discountType: values.discountType,
    discountValue: Number(values.discountValue),
    minOrderCents: values.minOrderCents
      ? Number(values.minOrderCents)
      : undefined,
    maxDiscountCents: values.maxDiscountCents
      ? Number(values.maxDiscountCents)
      : undefined,
    scopeType: values.scopeType,
    startsAt: values.startsAt
      ? new Date(values.startsAt).toISOString()
      : undefined,
    endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : undefined,
    globalUsageLimit: values.globalUsageLimit
      ? Number(values.globalUsageLimit)
      : undefined,
    perUserUsageLimit: values.perUserUsageLimit
      ? Number(values.perUserUsageLimit)
      : undefined,
  };
  if (values.scopeType === "PRODUCT") {
    payload.scopeProductIds = [...values.scopeProductIds];
    payload.scopeCategoryIds = [];
  } else if (values.scopeType === "CATEGORY") {
    payload.scopeCategoryIds = [...values.scopeCategoryIds];
    payload.scopeProductIds = [];
  } else {
    payload.scopeProductIds = [];
    payload.scopeCategoryIds = [];
  }
  return payload;
}
