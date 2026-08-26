-- Phase 2 M3: Guardian payment list indexes

CREATE INDEX "payments_created_at_idx" ON "payments"("created_at");

CREATE INDEX "payments_provider_idx" ON "payments"("provider");

CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");
