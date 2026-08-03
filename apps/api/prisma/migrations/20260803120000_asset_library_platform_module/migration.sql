-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('UPLOADED', 'ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "StorageProviderKind" AS ENUM ('LOCAL', 'S3', 'R2', 'AZURE', 'GCS');

-- CreateEnum
CREATE TYPE "AssetUploadSessionStatus" AS ENUM ('PENDING', 'UPLOADED', 'FINALIZED', 'EXPIRED');

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "storage_provider" "StorageProviderKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "alt_text" TEXT,
    "caption" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'UPLOADED',
    "created_by_user_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_upload_sessions" (
    "id" UUID NOT NULL,
    "storage_provider" "StorageProviderKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER,
    "status" "AssetUploadSessionStatus" NOT NULL DEFAULT 'PENDING',
    "created_by_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "asset_upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_change_history" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_change_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_activities" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "actor_id" UUID,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE INDEX "assets_created_at_idx" ON "assets"("created_at");

-- CreateIndex
CREATE INDEX "assets_mime_type_idx" ON "assets"("mime_type");

-- CreateIndex
CREATE UNIQUE INDEX "assets_storage_provider_storage_key_key" ON "assets"("storage_provider", "storage_key");

-- CreateIndex
CREATE INDEX "asset_upload_sessions_status_expires_at_idx" ON "asset_upload_sessions"("status", "expires_at");

-- CreateIndex
CREATE INDEX "asset_upload_sessions_created_by_user_id_idx" ON "asset_upload_sessions"("created_by_user_id");

-- CreateIndex
CREATE INDEX "asset_change_history_asset_id_created_at_idx" ON "asset_change_history"("asset_id", "created_at");

-- CreateIndex
CREATE INDEX "asset_activities_asset_id_created_at_idx" ON "asset_activities"("asset_id", "created_at");

-- AddForeignKey
ALTER TABLE "asset_change_history" ADD CONSTRAINT "asset_change_history_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_activities" ADD CONSTRAINT "asset_activities_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
