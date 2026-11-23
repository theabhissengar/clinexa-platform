-- Phase 6D: durable checkout request fingerprint (CRM may mutate addresses later).
-- Apply only to an isolated local/test database after explicit confirmation.

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "idempotency_request_hash" TEXT;

CREATE INDEX IF NOT EXISTS "orders_idempotency_request_hash_idx"
  ON "orders" ("idempotency_request_hash");
