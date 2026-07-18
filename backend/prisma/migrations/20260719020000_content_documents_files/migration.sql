CREATE TYPE "app"."ContentDocumentType" AS ENUM ('DOCUMENT', 'KNOWLEDGE_PAGE', 'MEETING_MINUTES');
CREATE TYPE "app"."ContentStatus" AS ENUM ('ACTIVE', 'TRASHED');
CREATE TYPE "app"."FileAssetStatus" AS ENUM ('ACTIVE', 'TRASHED');

CREATE TABLE "app"."knowledge_spaces" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "knowledge_spaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."content_documents" (
  "id" TEXT NOT NULL,
  "type" "app"."ContentDocumentType" NOT NULL,
  "title" TEXT NOT NULL,
  "content" JSONB NOT NULL DEFAULT '{}',
  "plain_text" TEXT NOT NULL DEFAULT '',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_favorite" BOOLEAN NOT NULL DEFAULT false,
  "space_id" TEXT,
  "parent_id" TEXT,
  "project_id" TEXT,
  "meeting_id" TEXT,
  "status" "app"."ContentStatus" NOT NULL DEFAULT 'ACTIVE',
  "trashed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "content_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_documents_parent_not_self_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
  CONSTRAINT "content_documents_trash_state_check" CHECK (("status" = 'TRASHED') = ("trashed_at" IS NOT NULL))
);

CREATE TABLE "app"."document_versions" (
  "id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "version_number" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "plain_text" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_favorite" BOOLEAN NOT NULL DEFAULT false,
  "space_id" TEXT,
  "parent_id" TEXT,
  "project_id" TEXT,
  "meeting_id" TEXT,
  "restored_from_version_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_versions_positive_version_check" CHECK ("version_number" > 0)
);

CREATE TABLE "app"."file_assets" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "document_id" TEXT,
  "project_id" TEXT,
  "meeting_id" TEXT,
  "status" "app"."FileAssetStatus" NOT NULL DEFAULT 'ACTIVE',
  "trashed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "file_assets_trash_state_check" CHECK (("status" = 'TRASHED') = ("trashed_at" IS NOT NULL))
);

CREATE TABLE "app"."file_versions" (
  "id" TEXT NOT NULL,
  "file_asset_id" TEXT NOT NULL,
  "version_number" INTEGER NOT NULL,
  "storage_key" TEXT NOT NULL,
  "original_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "file_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "file_versions_positive_version_check" CHECK ("version_number" > 0),
  CONSTRAINT "file_versions_size_nonnegative_check" CHECK ("size" >= 0),
  CONSTRAINT "file_versions_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

ALTER TABLE "app"."meetings" ADD COLUMN "minutes_document_id" TEXT;

CREATE INDEX "knowledge_spaces_archived_at_sequence_name_idx"
  ON "app"."knowledge_spaces"("archived_at", "sequence", "name");

CREATE INDEX "content_documents_status_updated_at_idx"
  ON "app"."content_documents"("status", "updated_at");
CREATE INDEX "content_documents_type_status_updated_at_idx"
  ON "app"."content_documents"("type", "status", "updated_at");
CREATE INDEX "content_documents_space_id_parent_id_status_idx"
  ON "app"."content_documents"("space_id", "parent_id", "status");
CREATE INDEX "content_documents_project_id_status_updated_at_idx"
  ON "app"."content_documents"("project_id", "status", "updated_at");
CREATE INDEX "content_documents_meeting_id_status_updated_at_idx"
  ON "app"."content_documents"("meeting_id", "status", "updated_at");
CREATE INDEX "content_documents_active_updated_at_idx"
  ON "app"."content_documents"("updated_at" DESC)
  WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "content_documents_unique_meeting_minutes_idx"
  ON "app"."content_documents"("meeting_id")
  WHERE "meeting_id" IS NOT NULL AND "type" = 'MEETING_MINUTES';

CREATE UNIQUE INDEX "document_versions_document_id_version_number_key"
  ON "app"."document_versions"("document_id", "version_number");
CREATE INDEX "document_versions_document_id_created_at_idx"
  ON "app"."document_versions"("document_id", "created_at");
CREATE INDEX "document_versions_restored_from_version_id_idx"
  ON "app"."document_versions"("restored_from_version_id");

CREATE INDEX "file_assets_document_id_status_updated_at_idx"
  ON "app"."file_assets"("document_id", "status", "updated_at");
CREATE INDEX "file_assets_project_id_status_updated_at_idx"
  ON "app"."file_assets"("project_id", "status", "updated_at");
CREATE INDEX "file_assets_meeting_id_status_updated_at_idx"
  ON "app"."file_assets"("meeting_id", "status", "updated_at");
CREATE INDEX "file_assets_status_updated_at_idx"
  ON "app"."file_assets"("status", "updated_at");

CREATE UNIQUE INDEX "file_versions_storage_key_key"
  ON "app"."file_versions"("storage_key");
CREATE UNIQUE INDEX "file_versions_file_asset_id_version_number_key"
  ON "app"."file_versions"("file_asset_id", "version_number");
CREATE INDEX "file_versions_file_asset_id_created_at_idx"
  ON "app"."file_versions"("file_asset_id", "created_at");

CREATE UNIQUE INDEX "meetings_minutes_document_id_key"
  ON "app"."meetings"("minutes_document_id");

ALTER TABLE "app"."content_documents"
  ADD CONSTRAINT "content_documents_space_id_fkey"
  FOREIGN KEY ("space_id") REFERENCES "app"."knowledge_spaces"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."content_documents"
  ADD CONSTRAINT "content_documents_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "app"."content_documents"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."content_documents"
  ADD CONSTRAINT "content_documents_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."content_documents"
  ADD CONSTRAINT "content_documents_meeting_id_fkey"
  FOREIGN KEY ("meeting_id") REFERENCES "app"."meetings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."document_versions"
  ADD CONSTRAINT "document_versions_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "app"."content_documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."document_versions"
  ADD CONSTRAINT "document_versions_restored_from_version_id_fkey"
  FOREIGN KEY ("restored_from_version_id") REFERENCES "app"."document_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."file_assets"
  ADD CONSTRAINT "file_assets_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "app"."content_documents"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."file_assets"
  ADD CONSTRAINT "file_assets_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."file_assets"
  ADD CONSTRAINT "file_assets_meeting_id_fkey"
  FOREIGN KEY ("meeting_id") REFERENCES "app"."meetings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."file_versions"
  ADD CONSTRAINT "file_versions_file_asset_id_fkey"
  FOREIGN KEY ("file_asset_id") REFERENCES "app"."file_assets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."meetings"
  ADD CONSTRAINT "meetings_minutes_document_id_fkey"
  FOREIGN KEY ("minutes_document_id") REFERENCES "app"."content_documents"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
