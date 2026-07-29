-- Catalog UI expansion: product featured/short desc/brand label, variant sale price,
-- product relations, category hierarchy + merchandising fields

ALTER TABLE "categories" ADD COLUMN "parent_id" UUID;
ALTER TABLE "categories" ADD COLUMN "thumbnail_media_asset_id" TEXT;
ALTER TABLE "categories" ADD COLUMN "min_quantity" INTEGER;
ALTER TABLE "categories" ADD COLUMN "max_quantity" INTEGER;
ALTER TABLE "categories" ADD COLUMN "group_of" INTEGER;
ALTER TABLE "categories" ADD COLUMN "display_type" TEXT;
ALTER TABLE "categories" ADD COLUMN "header_content_align" TEXT;
ALTER TABLE "categories" ADD COLUMN "header_text_align" TEXT;
ALTER TABLE "categories" ADD COLUMN "header_image_asset_id" TEXT;
ALTER TABLE "categories" ADD COLUMN "content_permission_roles" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "products" ADD COLUMN "short_description" TEXT;
ALTER TABLE "products" ADD COLUMN "is_featured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "brand_name" TEXT;
ALTER TABLE "products" ADD COLUMN "featured_media_asset_id" TEXT;
CREATE INDEX "products_is_featured_idx" ON "products"("is_featured");

ALTER TABLE "product_variants" ADD COLUMN "sale_price_cents" INTEGER;

CREATE TABLE "product_relations" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "relation_type" TEXT NOT NULL,

    CONSTRAINT "product_relations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_relations_source_id_target_id_relation_type_key" ON "product_relations"("source_id", "target_id", "relation_type");
CREATE INDEX "product_relations_source_id_idx" ON "product_relations"("source_id");
CREATE INDEX "product_relations_target_id_idx" ON "product_relations"("target_id");

ALTER TABLE "product_relations" ADD CONSTRAINT "product_relations_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_relations" ADD CONSTRAINT "product_relations_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
