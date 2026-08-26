-- Phase 2 M1 + M2: Coupons / CouponRedemptions + Order pricing snapshot

CREATE TYPE "CouponApplicability" AS ENUM (
  'ORDER',
  'SUBSCRIPTION',
  'RENEWAL',
  'FIRST_ORDER',
  'FIRST_SUBSCRIPTION',
  'BILLING_PERIOD'
);

CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENT', 'FIXED');

CREATE TYPE "CouponScopeType" AS ENUM ('ALL', 'PRODUCT', 'CATEGORY');

CREATE TYPE "CouponRedemptionStatus" AS ENUM ('RECORDED', 'FAILED_LIMIT');

CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_automatic" BOOLEAN NOT NULL DEFAULT false,
    "applicability" "CouponApplicability" NOT NULL DEFAULT 'ORDER',
    "discount_type" "CouponDiscountType" NOT NULL,
    "discount_value" INTEGER NOT NULL,
    "min_order_cents" INTEGER,
    "max_discount_cents" INTEGER,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "global_usage_limit" INTEGER,
    "per_user_usage_limit" INTEGER,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "scope_type" "CouponScopeType" NOT NULL DEFAULT 'ALL',
    "scope_product_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scope_category_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stacking_group" TEXT,
    "priority" INTEGER,
    "rules_json" JSONB,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");
CREATE INDEX "coupons_is_active_idx" ON "coupons"("is_active");
CREATE INDEX "coupons_deleted_at_idx" ON "coupons"("deleted_at");

CREATE TABLE "coupon_redemptions" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "payment_id" UUID,
    "patient_user_id" UUID NOT NULL,
    "discount_applied_cents" INTEGER NOT NULL,
    "status" "CouponRedemptionStatus" NOT NULL DEFAULT 'RECORDED',
    "redeemed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coupon_redemptions_coupon_id_redeemed_at_idx" ON "coupon_redemptions"("coupon_id", "redeemed_at");
CREATE INDEX "coupon_redemptions_order_id_idx" ON "coupon_redemptions"("order_id");
CREATE INDEX "coupon_redemptions_patient_user_id_idx" ON "coupon_redemptions"("patient_user_id");
CREATE INDEX "coupon_redemptions_payment_id_idx" ON "coupon_redemptions"("payment_id");

ALTER TABLE "orders" ADD COLUMN "applied_coupon_id" UUID;
ALTER TABLE "orders" ADD COLUMN "pricing_snapshot_json" JSONB;
CREATE INDEX "orders_applied_coupon_id_idx" ON "orders"("applied_coupon_id");

ALTER TABLE "orders" ADD CONSTRAINT "orders_applied_coupon_id_fkey"
  FOREIGN KEY ("applied_coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_patient_user_id_fkey"
  FOREIGN KEY ("patient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
