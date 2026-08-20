-- Orders Platform Module foundation (P13a) — DB-026/027 + supporting entities

CREATE TYPE "OrderStatus" AS ENUM (
    'DRAFT',
    'PAYMENT_PENDING',
    'AWAITING_CLINICAL_REVIEW',
    'CLINICAL_APPROVED',
    'CLINICAL_DECLINED',
    'AWAITING_FULFILLMENT',
    'FULFILLED',
    'CANCELLED',
    'REFUNDED'
);

CREATE TYPE "OrderType" AS ENUM (
    'ONE_TIME',
    'SUBSCRIPTION_INITIAL',
    'SUBSCRIPTION_RENEWAL'
);

CREATE TYPE "OrderAddressKind" AS ENUM (
    'SHIPPING',
    'BILLING'
);

CREATE TYPE "OrderAdjustmentKind" AS ENUM (
    'CORRECTION',
    'WRITE_OFF',
    'CREDIT',
    'DEBIT',
    'OTHER'
);

CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "patient_user_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "order_type" "OrderType" NOT NULL DEFAULT 'ONE_TIME',
    "subscription_id" UUID,
    "customer_first_name" TEXT,
    "customer_last_name" TEXT,
    "customer_email" TEXT,
    "customer_phone" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotal_cents" INTEGER NOT NULL DEFAULT 0,
    "discount_total_cents" INTEGER NOT NULL DEFAULT 0,
    "shipping_total_cents" INTEGER NOT NULL DEFAULT 0,
    "tax_total_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL DEFAULT 0,
    "adjustment_total_cents" INTEGER NOT NULL DEFAULT 0,
    "refunded_total_cents" INTEGER NOT NULL DEFAULT 0,
    "payment_intent_id" TEXT,
    "latest_payment_id" UUID,
    "payment_status_summary" TEXT,
    "reservation_id" UUID,
    "consultation_id" UUID,
    "prescription_id" UUID,
    "questionnaire_response_id" UUID,
    "questionnaire_version_id" UUID,
    "requires_clinical_review" BOOLEAN NOT NULL DEFAULT false,
    "is_rx_order" BOOLEAN NOT NULL DEFAULT false,
    "tracking_number" TEXT,
    "carrier" TEXT,
    "shipped_at" TIMESTAMPTZ(3),
    "admin_tags" JSONB,
    "reconciliation_flags" JSONB,
    "archived_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");
CREATE INDEX "orders_patient_user_id_created_at_idx" ON "orders"("patient_user_id", "created_at");
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");
CREATE INDEX "orders_order_type_idx" ON "orders"("order_type");
CREATE INDEX "orders_subscription_id_idx" ON "orders"("subscription_id");
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");
CREATE INDEX "orders_updated_at_idx" ON "orders"("updated_at");
CREATE INDEX "orders_deleted_at_idx" ON "orders"("deleted_at");
CREATE INDEX "orders_archived_at_idx" ON "orders"("archived_at");
CREATE INDEX "orders_reservation_id_idx" ON "orders"("reservation_id");

CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
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
    "tax_cents" INTEGER NOT NULL DEFAULT 0,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "line_subtotal_cents" INTEGER NOT NULL DEFAULT 0,
    "line_total_cents" INTEGER NOT NULL DEFAULT 0,
    "fulfillment_metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

CREATE TABLE "order_addresses" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "kind" "OrderAddressKind" NOT NULL,
    "full_name" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "postal_code" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "phone" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_addresses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_addresses_order_id_kind_key" ON "order_addresses"("order_id", "kind");
CREATE INDEX "order_addresses_order_id_idx" ON "order_addresses"("order_id");

CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "actor_user_id" UUID,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_status_history_order_id_created_at_idx" ON "order_status_history"("order_id", "created_at");

CREATE TABLE "order_activities" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_activities_order_id_created_at_idx" ON "order_activities"("order_id", "created_at");

CREATE TABLE "order_notes" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_notes_order_id_created_at_idx" ON "order_notes"("order_id", "created_at");
CREATE INDEX "order_notes_author_user_id_idx" ON "order_notes"("author_user_id");

CREATE TABLE "order_adjustments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "kind" "OrderAdjustmentKind" NOT NULL DEFAULT 'CORRECTION',
    "amount_cents" INTEGER NOT NULL,
    "reason" TEXT,
    "actor_user_id" UUID,
    "payment_ref" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_adjustments_order_id_created_at_idx" ON "order_adjustments"("order_id", "created_at");

ALTER TABLE "orders" ADD CONSTRAINT "orders_patient_user_id_fkey" FOREIGN KEY ("patient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_addresses" ADD CONSTRAINT "order_addresses_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_activities" ADD CONSTRAINT "order_activities_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
