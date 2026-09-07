-- Phase 4: NoteVisibility, UserNote, subscription MIGRATED, medical profile

CREATE TYPE "NoteVisibility" AS ENUM ('PRIVATE', 'USER_VISIBLE');

ALTER TYPE "SubscriptionStatus" ADD VALUE 'MIGRATED';

ALTER TABLE "users" ADD COLUMN "medical_profile" JSONB;

ALTER TABLE "order_notes" ADD COLUMN "visibility" "NoteVisibility" NOT NULL DEFAULT 'PRIVATE';

ALTER TABLE "subscription_notes" ADD COLUMN "visibility" "NoteVisibility" NOT NULL DEFAULT 'PRIVATE';

CREATE TABLE "user_notes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'PRIVATE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_notes_user_id_created_at_idx" ON "user_notes"("user_id", "created_at");
CREATE INDEX "user_notes_author_user_id_idx" ON "user_notes"("author_user_id");

ALTER TABLE "user_notes" ADD CONSTRAINT "user_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
