-- Product Data expansion: inventory/shipping/linked/advanced/stripe + product types

ALTER TYPE "ProductType" ADD VALUE 'VARIABLE';
ALTER TYPE "ProductType" ADD VALUE 'SIMPLE_SUBSCRIPTION';
ALTER TYPE "ProductType" ADD VALUE 'VARIABLE_SUBSCRIPTION';

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "gtin" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sold_individually" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "weight_lbs" DECIMAL(12,4);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "length_in" DECIMAL(12,4);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "width_in" DECIMAL(12,4);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "height_in" DECIMAL(12,4);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "shipping_class" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "one_time_shipping" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "bundle_sells_title" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "bundle_sells_discount" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "default_variation_options" JSONB;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "purchase_note" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "menu_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "enable_reviews" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "limit_subscription" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stripe_button_position" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stripe_gateways" JSONB;
