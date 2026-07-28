CREATE TYPE "app"."KnowledgeSourceKind" AS ENUM ('UPLOAD', 'LOCAL_FILE', 'LEGACY');
CREATE TYPE "app"."KnowledgeProcessingStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'READY',
  'PARTIAL',
  'FAILED',
  'MISSING'
);
CREATE TYPE "app"."KnowledgeIndexJobStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
  'INTERRUPTED'
);

ALTER TABLE "app"."content_documents"
  ADD COLUMN "source_kind" "app"."KnowledgeSourceKind" NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "original_name" TEXT,
  ADD COLUMN "mime_type" TEXT,
  ADD COLUMN "file_size" INTEGER,
  ADD COLUMN "source_sha256" TEXT,
  ADD COLUMN "source_modified_at" TIMESTAMPTZ(6),
  ADD COLUMN "preview_status" "app"."KnowledgeProcessingStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "preview_storage_key" TEXT,
  ADD COLUMN "preview_mime_type" TEXT,
  ADD COLUMN "index_status" "app"."KnowledgeProcessingStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "processing_error" TEXT,
  ADD COLUMN "indexed_at" TIMESTAMPTZ(6);

DROP INDEX IF EXISTS "app"."idx_document_chunks_embedding";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "app"."document_chunks"
    WHERE "embedding" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Existing document embeddings must be reindexed before dimension migration';
  END IF;
END $$;

ALTER TABLE "app"."document_chunks"
  ALTER COLUMN "embedding" TYPE public.vector(384)
    USING NULL::public.vector(384),
  ADD COLUMN "page_number" INTEGER,
  ADD COLUMN "sheet_name" TEXT,
  ADD COLUMN "location_label" TEXT;

CREATE INDEX "idx_document_chunks_embedding"
  ON "app"."document_chunks"
  USING hnsw ("embedding" public.vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

CREATE TABLE "app"."knowledge_index_jobs" (
  "id" TEXT NOT NULL,
  "status" "app"."KnowledgeIndexJobStatus" NOT NULL DEFAULT 'QUEUED',
  "total_files" INTEGER NOT NULL DEFAULT 0,
  "processed_files" INTEGER NOT NULL DEFAULT 0,
  "failed_files" INTEGER NOT NULL DEFAULT 0,
  "current_file" TEXT,
  "errors" JSONB NOT NULL DEFAULT '[]',
  "started_at" TIMESTAMPTZ(6),
  "finished_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "knowledge_index_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "content_documents_source_kind_status_updated_at_idx"
  ON "app"."content_documents"("source_kind", "status", "updated_at");
CREATE INDEX "content_documents_preview_status_index_status_status_idx"
  ON "app"."content_documents"("preview_status", "index_status", "status");
CREATE INDEX "knowledge_index_jobs_status_created_at_idx"
  ON "app"."knowledge_index_jobs"("status", "created_at");
