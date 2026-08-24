-- Subscriptions Platform Module foundation (P14a) — DB-032/033/034 + supporting entities
-- Four status dimensions: lifecycle, payment snapshot, renewal-attempt status, clinical requirement.
-- There is no standalone Renewals domain.

CREATE TYPE "SubscriptionPlanStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'UNPUBLISHED',
    'ARCHIVED'
);

CREATE TYPE "SubscriptionBillingInterval" AS ENUM (
    'WEEK',
    'MONTH',
    'QUARTER',
    'YEAR',
    'CUSTOM'
);

CREATE TYPE "SubscriptionStatus" AS ENUM (
    'PENDING_SETUP',
    'ACTIVE',
    'PAUSED',
    'PAST_DUE',
    'CANCELLED',
    'EXPIRED',
    'COMPLETED'
);

CREATE TYPE "SubscriptionClinicalRequirement" AS ENUM (
    'NONE',
    'REASSESSMENT_REQUIRED',
    'DECLINED_HOLD'
);

CREATE TYPE "SubscriptionRenewalAttemptStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'SUCCEEDED',
    'FAILED',
    'SKIPPED',
    'CANCELLED'
);

CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "lifecycle_status" "SubscriptionPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "billing_interval" "SubscriptionBillingInterval" NOT NULL,
    "interval_count" INTEGER NOT NULL DEFAULT 1,
    "custom_interval_days" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "price_cents" INTEGER NOT NULL,
    "product_bindings" JSONB NOT NULL DEFAULT '[]',
    "grace_period_days" INTEGER NOT NULL DEFAULT 0,
    "requires_reassessment" BOOLEAN NOT NULL DEFAULT false,
    "reassessment_interval_cycles" INTEGER,
    "archived_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_plans_slug_key" ON "subscription_plans"("slug");
CREATE INDEX "subscription_plans_lifecycle_status_idx" ON "subscription_plans"("lifecycle_status");
CREATE INDEX "subscription_plans_deleted_at_idx" ON "subscription_plans"("deleted_at");
CREATE INDEX "subscription_plans_archived_at_idx" ON "subscription_plans"("archived_at");

CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "subscription_number" TEXT,
    "patient_user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING_SETUP',
    "current_period_start" TIMESTAMPTZ(3),
    "current_period_end" TIMESTAMPTZ(3),
    "next_renewal_at" TIMESTAMPTZ(3),
    "cycle_number" INTEGER NOT NULL DEFAULT 0,
    "ends_at" TIMESTAMPTZ(3),
    "paused_at" TIMESTAMPTZ(3),
    "status_before_pause" "SubscriptionStatus",
    "customer_first_name" TEXT,
    "customer_last_name" TEXT,
    "customer_email" TEXT,
    "customer_phone" TEXT,
    "payment_method_id" TEXT,
    "provider_customer_ref" TEXT,
    "provider_subscription_ref" TEXT,
    "latest_payment_id" UUID,
    "payment_status_summary" TEXT,
    "initial_order_id" UUID,
    "latest_order_id" UUID,
    "clinical_requirement" "SubscriptionClinicalRequirement" NOT NULL DEFAULT 'NONE',
    "shipping_preference_notes" TEXT,
    "ops_flags" JSONB,
    "admin_tags" JSONB,
    "reconciliation_flags" JSONB,
    "archived_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriptions_subscription_number_key" ON "subscriptions"("subscription_number");
CREATE INDEX "subscriptions_patient_user_id_created_at_idx" ON "subscriptions"("patient_user_id", "created_at");
CREATE INDEX "subscriptions_status_next_renewal_at_idx" ON "subscriptions"("status", "next_renewal_at");
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");
CREATE INDEX "subscriptions_initial_order_id_idx" ON "subscriptions"("initial_order_id");
CREATE INDEX "subscriptions_latest_order_id_idx" ON "subscriptions"("latest_order_id");
CREATE INDEX "subscriptions_deleted_at_idx" ON "subscriptions"("deleted_at");
CREATE INDEX "subscriptions_archived_at_idx" ON "subscriptions"("archived_at");

CREATE TABLE "subscription_items" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product_type" TEXT NOT NULL,
    "is_rx_eligible" BOOLEAN NOT NULL DEFAULT false,
    "catalog_metadata" JSONB,
    "quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "sale_price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_items_subscription_id_idx" ON "subscription_items"("subscription_id");
CREATE INDEX "subscription_items_product_id_idx" ON "subscription_items"("product_id");
CREATE INDEX "subscription_items_variant_id_idx" ON "subscription_items"("variant_id");

CREATE TABLE "subscription_renewal_attempts" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "billing_period_key" TEXT NOT NULL,
    "status" "SubscriptionRenewalAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "order_id" UUID,
    "payment_id" TEXT,
    "payment_status_summary" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "last_error_at" TIMESTAMPTZ(3),
    "actor_user_id" UUID,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_renewal_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_renewal_attempts_subscription_id_billing_period_key_key" ON "subscription_renewal_attempts"("subscription_id", "billing_period_key");
CREATE INDEX "subscription_renewal_attempts_subscription_id_status_idx" ON "subscription_renewal_attempts"("subscription_id", "status");
CREATE INDEX "subscription_renewal_attempts_status_idx" ON "subscription_renewal_attempts"("status");
CREATE INDEX "subscription_renewal_attempts_order_id_idx" ON "subscription_renewal_attempts"("order_id");

CREATE TABLE "subscription_status_history" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "from_status" "SubscriptionStatus",
    "to_status" "SubscriptionStatus" NOT NULL,
    "actor_user_id" UUID,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_status_history_subscription_id_created_at_idx" ON "subscription_status_history"("subscription_id", "created_at");

CREATE TABLE "subscription_change_history" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_change_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_change_history_subscription_id_created_at_idx" ON "subscription_change_history"("subscription_id", "created_at");

CREATE TABLE "subscription_activities" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_activities_subscription_id_created_at_idx" ON "subscription_activities"("subscription_id", "created_at");

CREATE TABLE "subscription_notes" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_notes_subscription_id_created_at_idx" ON "subscription_notes"("subscription_id", "created_at");
CREATE INDEX "subscription_notes_author_user_id_idx" ON "subscription_notes"("author_user_id");

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_initial_order_id_fkey" FOREIGN KEY ("initial_order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_latest_order_id_fkey" FOREIGN KEY ("latest_order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subscription_renewal_attempts" ADD CONSTRAINT "subscription_renewal_attempts_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_renewal_attempts" ADD CONSTRAINT "subscription_renewal_attempts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subscription_status_history" ADD CONSTRAINT "subscription_status_history_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_change_history" ADD CONSTRAINT "subscription_change_history_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_activities" ADD CONSTRAINT "subscription_activities_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_notes" ADD CONSTRAINT "subscription_notes_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing Orders rows used opaque placeholder UUIDs. Clear orphans before the real FK.
UPDATE "orders" SET "subscription_id" = NULL WHERE "subscription_id" IS NOT NULL;

ALTER TABLE "orders" ADD CONSTRAINT "orders_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
