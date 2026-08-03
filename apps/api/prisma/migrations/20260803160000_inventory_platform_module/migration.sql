-- Inventory Platform Module (P12) — ledger-first, warehouse-keyed schema

CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "StockMovementType" AS ENUM ('RESERVE', 'RELEASE', 'COMMIT', 'RESTOCK', 'ADJUST', 'RECEIVE');
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'COMMITTED', 'RELEASED', 'EXPIRED');
CREATE TYPE "OversellMode" AS ENUM ('PREVENT', 'ALLOW');

CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");
CREATE INDEX "warehouses_is_default_idx" ON "warehouses"("is_default");
CREATE INDEX "warehouses_status_idx" ON "warehouses"("status");

CREATE TABLE "inventory_balances" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "quantity_on_hand" INTEGER NOT NULL DEFAULT 0,
    "quantity_reserved" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_balances_warehouse_id_product_variant_id_key" ON "inventory_balances"("warehouse_id", "product_variant_id");
CREATE INDEX "inventory_balances_product_variant_id_idx" ON "inventory_balances"("product_variant_id");
CREATE INDEX "inventory_balances_warehouse_id_idx" ON "inventory_balances"("warehouse_id");

CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL,
    "order_id" UUID,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_reservations_order_id_idx" ON "stock_reservations"("order_id");
CREATE INDEX "stock_reservations_status_expires_at_idx" ON "stock_reservations"("status", "expires_at");

CREATE TABLE "stock_reservation_lines" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "stock_reservation_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_reservation_lines_reservation_id_idx" ON "stock_reservation_lines"("reservation_id");
CREATE INDEX "stock_reservation_lines_warehouse_id_product_variant_id_idx" ON "stock_reservation_lines"("warehouse_id", "product_variant_id");

CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "movement_type" "StockMovementType" NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "order_id" UUID,
    "reservation_id" UUID,
    "actor_user_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_movements_warehouse_id_product_variant_id_created_at_idx" ON "stock_movements"("warehouse_id", "product_variant_id", "created_at");
CREATE INDEX "stock_movements_order_id_idx" ON "stock_movements"("order_id");
CREATE INDEX "stock_movements_reservation_id_idx" ON "stock_movements"("reservation_id");
CREATE INDEX "stock_movements_movement_type_created_at_idx" ON "stock_movements"("movement_type", "created_at");

CREATE TABLE "inventory_policies" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL DEFAULT 'default',
    "oversell_mode" "OversellMode" NOT NULL DEFAULT 'PREVENT',
    "reservation_timeout_minutes" INTEGER NOT NULL DEFAULT 60,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 5,
    "allow_negative_stock" BOOLEAN NOT NULL DEFAULT false,
    "allocation_strategy" TEXT,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inventory_policies_code_key" ON "inventory_policies"("code");

ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservation_lines" ADD CONSTRAINT "stock_reservation_lines_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "stock_reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_reservation_lines" ADD CONSTRAINT "stock_reservation_lines_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "stock_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
