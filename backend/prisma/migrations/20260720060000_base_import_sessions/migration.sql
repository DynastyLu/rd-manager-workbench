CREATE TYPE "app"."DataImportFormat" AS ENUM ('CSV', 'XLSX');
CREATE TYPE "app"."DataImportStatus" AS ENUM ('UPLOADED', 'PREVIEWED', 'IMPORTING', 'COMPLETED', 'PARTIAL', 'FAILED', 'EXPIRED');

CREATE TABLE "app"."data_import_sessions" (
    "id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "format" "app"."DataImportFormat" NOT NULL,
    "selected_sheet" TEXT,
    "status" "app"."DataImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "mapping" JSONB NOT NULL DEFAULT '[]',
    "preview_fingerprint" TEXT,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "source_storage_key" TEXT NOT NULL,
    "error_storage_key" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "data_import_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "data_import_sessions_table_id_created_at_idx" ON "app"."data_import_sessions"("table_id", "created_at");
CREATE INDEX "data_import_sessions_expires_at_status_idx" ON "app"."data_import_sessions"("expires_at", "status");
ALTER TABLE "app"."data_import_sessions" ADD CONSTRAINT "data_import_sessions_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "app"."data_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
