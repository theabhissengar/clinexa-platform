export type CouponDiscountType = "PERCENT" | "FIXED";
export type CouponScopeType = "ALL" | "PRODUCT" | "CATEGORY";
export type CouponApplicability =
  | "ORDER"
  | "SUBSCRIPTION"
  | "RENEWAL"
  | "FIRST_ORDER"
  | "FIRST_SUBSCRIPTION"
  | "BILLING_PERIOD";
export type CouponRedemptionStatus = "RECORDED" | "FAILED_LIMIT";

export type Coupon = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isAutomatic: boolean;
  applicability: CouponApplicability;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderCents: number | null;
  maxDiscountCents: number | null;
  startsAt: string | null;
  endsAt: string | null;
  globalUsageLimit: number | null;
  perUserUsageLimit: number | null;
  usageCount: number;
  scopeType: CouponScopeType;
  scopeProductIds: string[];
  scopeCategoryIds: string[];
  stackingGroup: string | null;
  priority: number | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CouponListResponse = {
  items: Coupon[];
  total: number;
  skip: number;
  take: number;
};

export type CouponRedemption = {
  id: string;
  orderId: string;
  patientUserId: string;
  redeemedAt: string;
  discountAppliedCents: number;
  status: CouponRedemptionStatus;
};

export type CouponRedemptionListResponse = {
  items: CouponRedemption[];
  total: number;
  skip: number;
  take: number;
};

export type CreateCouponPayload = {
  code: string;
  name: string;
  description?: string;
  isActive?: boolean;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderCents?: number;
  maxDiscountCents?: number;
  startsAt?: string;
  endsAt?: string;
  globalUsageLimit?: number;
  perUserUsageLimit?: number;
  scopeType?: CouponScopeType;
  scopeProductIds?: string[];
  scopeCategoryIds?: string[];
};

export type UpdateCouponPayload = Partial<
  Omit<CreateCouponPayload, "code">
>;
