-- P9 Users Platform Module: lifecycle expansion, DB-007–009, history/activity.

-- Expand UserStatus (map legacy DISABLED → INACTIVE)
CREATE TYPE "UserStatus_new" AS ENUM (
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'INACTIVE',
  'ARCHIVED',
  'DELETED'
);

ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "users"
  ALTER COLUMN "status" TYPE "UserStatus_new"
  USING (
    CASE
      WHEN "status"::text = 'DISABLED' THEN 'INACTIVE'::"UserStatus_new"
      WHEN "status"::text = 'ACTIVE' THEN 'ACTIVE'::"UserStatus_new"
      ELSE 'INACTIVE'::"UserStatus_new"
    END
  );

DROP TYPE "UserStatus";
ALTER TYPE "UserStatus_new" RENAME TO "UserStatus";

ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"UserStatus";

CREATE TYPE "UserGender" AS ENUM ('UNSPECIFIED', 'MALE', 'FEMALE', 'OTHER');

ALTER TABLE "users"
  ADD COLUMN "first_name" TEXT,
  ADD COLUMN "last_name" TEXT,
  ADD COLUMN "display_name" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "avatar_media_asset_id" TEXT,
  ADD COLUMN "date_of_birth" DATE,
  ADD COLUMN "gender" "UserGender" NOT NULL DEFAULT 'UNSPECIFIED',
  ADD COLUMN "region" TEXT,
  ADD COLUMN "health_card_media_asset_id" TEXT,
  ADD COLUMN "billing_address" JSONB,
  ADD COLUMN "shipping_address" JSONB,
  ADD COLUMN "stripe_customer_id_live" TEXT,
  ADD COLUMN "stripe_customer_id_test" TEXT,
  ADD COLUMN "preferences" JSONB,
  ADD COLUMN "internal_notes" TEXT,
  ADD COLUMN "email_verified_at" TIMESTAMPTZ(3),
  ADD COLUMN "last_active_at" TIMESTAMPTZ(3),
  ADD COLUMN "archived_at" TIMESTAMPTZ(3),
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

CREATE INDEX "users_status_idx" ON "users"("status");
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");
CREATE INDEX "password_reset_tokens_token_hash_idx" ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "account_security_states" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "last_failed_login_at" TIMESTAMPTZ(3),
    "locked_until" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "account_security_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_security_states_user_id_key" ON "account_security_states"("user_id");

ALTER TABLE "account_security_states"
  ADD CONSTRAINT "account_security_states_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT,
    "credentials_display" TEXT,
    "department" TEXT,
    "crm_preferences" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_profiles_user_id_key" ON "staff_profiles"("user_id");

ALTER TABLE "staff_profiles"
  ADD CONSTRAINT "staff_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_change_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_change_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_change_history_user_id_created_at_idx" ON "user_change_history"("user_id", "created_at");

ALTER TABLE "user_change_history"
  ADD CONSTRAINT "user_change_history_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_activities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "actor_id" UUID,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_activities_user_id_created_at_idx" ON "user_activities"("user_id", "created_at");

ALTER TABLE "user_activities"
  ADD CONSTRAINT "user_activities_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
