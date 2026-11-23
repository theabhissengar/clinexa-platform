-- Phase 6C: unique provider_refund_ref (nullable) with duplicate preflight.
-- If the DO block raises, resolve duplicate refunds manually before re-running.

DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT provider_refund_ref
    FROM refunds
    WHERE provider_refund_ref IS NOT NULL
    GROUP BY provider_refund_ref
    HAVING COUNT(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'payments_phase6c_stripe_refs: % duplicate non-null provider_refund_ref value(s). Resolve manually before migrating.',
      dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "refunds_provider_refund_ref_key"
  ON "refunds" ("provider_refund_ref")
  WHERE "provider_refund_ref" IS NOT NULL;
