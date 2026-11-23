-- Phase 6B Payments foundation (additive only)

CREATE TYPE "PaymentInitiator" AS ENUM ('CHECKOUT', 'STAFF_RETRY', 'RENEWAL', 'SYSTEM');
CREATE TYPE "PaymentWebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'APPLIED', 'FAILED');

ALTER TABLE "subscription_renewal_attempts"
  ADD COLUMN "authorize_attempt_number" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "payments"
  ADD COLUMN "initiator" "PaymentInitiator" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "provider_status_raw" TEXT,
  ADD COLUMN "authorized_amount_cents" INTEGER,
  ADD COLUMN "captured_amount_cents" INTEGER,
  ADD COLUMN "refunded_amount_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "authorized_at" TIMESTAMPTZ(3),
  ADD COLUMN "captured_at" TIMESTAMPTZ(3),
  ADD COLUMN "authorization_expires_at" TIMESTAMPTZ(3);

CREATE INDEX "payments_authorization_expires_at_idx" ON "payments"("authorization_expires_at");

ALTER TABLE "refunds"
  ADD COLUMN "error_code" TEXT;

ALTER TABLE "payment_webhook_events"
  ADD COLUMN "processing_status" "PaymentWebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN "claim_token" TEXT,
  ADD COLUMN "lease_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_error" TEXT,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill applied events as APPLIED
UPDATE "payment_webhook_events"
SET "processing_status" = 'APPLIED',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "applied_at" IS NOT NULL;

CREATE INDEX "payment_webhook_events_processing_status_lease_expires_at_idx"
  ON "payment_webhook_events"("processing_status", "lease_expires_at");
