-- Phase 6E: durable renewal-attempt processing lease (additive)

ALTER TABLE "subscription_renewal_attempts"
  ADD COLUMN "claim_token" TEXT,
  ADD COLUMN "lease_expires_at" TIMESTAMPTZ(3);

CREATE INDEX "subscription_renewal_attempts_status_lease_expires_at_idx"
  ON "subscription_renewal_attempts"("status", "lease_expires_at");
