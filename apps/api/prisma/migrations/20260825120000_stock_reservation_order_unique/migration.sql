-- P13e: at most one StockReservation per order (PostgreSQL UNIQUE allows multiple NULLs).
DROP INDEX IF EXISTS "stock_reservations_order_id_idx";

CREATE UNIQUE INDEX "stock_reservations_order_id_key" ON "stock_reservations"("order_id");
