-- Catalog foundation: Categories, Products, Variants, Media associations, links, history/activity

CREATE TYPE "ProductLifecycleStatus" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');
CREATE TYPE "ProductType" AS ENUM ('STANDARD', 'BUNDLE', 'KIT', 'DIGITAL');
CREATE TYPE "CategoryLifecycleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "lifecycle_status" "CategoryLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "seo_title" TEXT,
    "seo_description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");
CREATE INDEX "categories_lifecycle_status_idx" ON "categories"("lifecycle_status");

CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "product_type" "ProductType" NOT NULL DEFAULT 'STANDARD',
    "lifecycle_status" "ProductLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "is_rx_eligible" BOOLEAN NOT NULL DEFAULT false,
    "brand_id" UUID,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seo_title" TEXT,
    "seo_description" TEXT,
    "seo_canonical" TEXT,
    "medical_info" JSONB,
    "attributes" JSONB,
    "questionnaire_binding_ref" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");
CREATE INDEX "products_lifecycle_status_idx" ON "products"("lifecycle_status");
CREATE INDEX "products_is_rx_eligible_idx" ON "products"("is_rx_eligible");

CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "label" TEXT,
    "option_values" JSONB,
    "price_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "is_fulfillable" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

CREATE TABLE "product_media" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "media_asset_id" TEXT NOT NULL,
    "alt" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_media_product_id_media_asset_id_key" ON "product_media"("product_id", "media_asset_id");
CREATE INDEX "product_media_product_id_idx" ON "product_media"("product_id");

CREATE TABLE "product_category_links" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "product_category_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_category_links_product_id_category_id_key" ON "product_category_links"("product_id", "category_id");
CREATE INDEX "product_category_links_product_id_idx" ON "product_category_links"("product_id");
CREATE INDEX "product_category_links_category_id_idx" ON "product_category_links"("category_id");

CREATE TABLE "product_change_history" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_change_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_change_history_product_id_created_at_idx" ON "product_change_history"("product_id", "created_at");

CREATE TABLE "product_activities" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "actor_id" UUID,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_activities_product_id_created_at_idx" ON "product_activities"("product_id", "created_at");

ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_category_links" ADD CONSTRAINT "product_category_links_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_category_links" ADD CONSTRAINT "product_category_links_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_change_history" ADD CONSTRAINT "product_change_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_activities" ADD CONSTRAINT "product_activities_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
