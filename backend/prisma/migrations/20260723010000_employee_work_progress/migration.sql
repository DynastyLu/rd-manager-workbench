CREATE TYPE "app"."EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'LEFT');
CREATE TYPE "app"."EmployeeWorkImportStatus" AS ENUM ('UPLOADED', 'PREVIEWED', 'RESOLVING', 'READY', 'IMPORTING', 'COMPLETED', 'FAILED', 'SUPERSEDED', 'EXPIRED');
CREATE TYPE "app"."EmployeeSnapshotStatus" AS ENUM ('NOT_STARTED', 'GENERATING', 'READY', 'FAILED');
CREATE TYPE "app"."EmployeeWorkStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'AT_RISK', 'BLOCKED');
CREATE TYPE "app"."EmployeeProgressScope" AS ENUM ('TEAM', 'EMPLOYEE', 'PROJECT');
CREATE TYPE "app"."EmployeeProgressPeriod" AS ENUM ('WEEK', 'MONTH');
CREATE TYPE "app"."EmployeeImportRowStatus" AS ENUM ('VALID', 'ERROR', 'UNRESOLVED');

ALTER TABLE "app"."resource_profiles"
ADD COLUMN "department" TEXT,
ADD COLUMN "manager_name" TEXT,
ADD COLUMN "employment_status" "app"."EmploymentStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE OR REPLACE FUNCTION "app"."generate_task_code"()
RETURNS TEXT
LANGUAGE SQL
VOLATILE
AS $$
  SELECT 'TASK-' || UPPER(SUBSTRING(MD5(
    RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT
  ), 1, 10));
$$;

ALTER TABLE "app"."tasks" ADD COLUMN "code" TEXT;
UPDATE "app"."tasks"
SET "code" = 'TASK-' || UPPER(SUBSTRING(MD5("id"), 1, 10));
ALTER TABLE "app"."tasks"
ALTER COLUMN "code" SET DEFAULT "app"."generate_task_code"(),
ALTER COLUMN "code" SET NOT NULL;

CREATE TABLE "app"."employee_work_import_batches" (
  "id" TEXT NOT NULL,
  "period_type" "app"."EmployeeProgressPeriod" NOT NULL DEFAULT 'WEEK',
  "period_start_at" DATE NOT NULL,
  "period_end_at" DATE NOT NULL,
  "version" INTEGER,
  "status" "app"."EmployeeWorkImportStatus" NOT NULL DEFAULT 'UPLOADED',
  "snapshot_status" "app"."EmployeeSnapshotStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "snapshot_error" TEXT,
  "original_name" TEXT NOT NULL,
  "file_hash" TEXT NOT NULL,
  "source_storage_key" TEXT NOT NULL,
  "error_storage_key" TEXT,
  "template_version" INTEGER NOT NULL,
  "preview_fingerprint" TEXT,
  "total_rows" INTEGER NOT NULL DEFAULT 0,
  "valid_rows" INTEGER NOT NULL DEFAULT 0,
  "error_rows" INTEGER NOT NULL DEFAULT 0,
  "unresolved_rows" INTEGER NOT NULL DEFAULT 0,
  "imported_rows" INTEGER NOT NULL DEFAULT 0,
  "supersedes_batch_id" TEXT,
  "restored_from_batch_id" TEXT,
  "committed_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "employee_work_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."employee_work_import_rows" (
  "id" TEXT NOT NULL,
  "batch_id" TEXT NOT NULL,
  "row_number" INTEGER NOT NULL,
  "raw_values" JSONB NOT NULL,
  "normalized_values" JSONB NOT NULL,
  "status" "app"."EmployeeImportRowStatus" NOT NULL,
  "errors" JSONB NOT NULL,
  "resolved_employee_id" TEXT,
  "resolved_project_id" TEXT,
  "resolved_task_id" TEXT,
  "keep_unlinked" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "employee_work_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."employee_work_items" (
  "id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "import_batch_id" TEXT NOT NULL,
  "source_row_id" TEXT NOT NULL,
  "period_start_at" DATE NOT NULL,
  "period_end_at" DATE NOT NULL,
  "title" TEXT NOT NULL,
  "plan_text" TEXT,
  "summary_text" TEXT,
  "completion_rate" INTEGER,
  "status" "app"."EmployeeWorkStatus" NOT NULL,
  "next_plan_text" TEXT,
  "risk_text" TEXT,
  "planned_hours" DECIMAL(6,2),
  "actual_hours" DECIMAL(6,2),
  "project_id" TEXT,
  "task_id" TEXT,
  "risk_id" TEXT,
  "note" TEXT,
  "raw_row" JSONB NOT NULL,
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "employee_work_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."employee_progress_snapshots" (
  "id" TEXT NOT NULL,
  "scope_type" "app"."EmployeeProgressScope" NOT NULL,
  "scope_key" TEXT NOT NULL,
  "scope_id" TEXT,
  "period_type" "app"."EmployeeProgressPeriod" NOT NULL,
  "period_start_at" DATE NOT NULL,
  "period_end_at" DATE NOT NULL,
  "version" INTEGER NOT NULL,
  "metrics" JSONB NOT NULL,
  "highlights" JSONB NOT NULL,
  "risks" JSONB NOT NULL,
  "source_batch_ids" TEXT[] NOT NULL,
  "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_progress_snapshots_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "app"."resource_load_entries"
ADD COLUMN "employee_work_item_id" TEXT,
ADD COLUMN "employee_work_import_batch_id" TEXT;

CREATE INDEX "resource_profiles_employment_status_archived_at_display_name_id"
ON "app"."resource_profiles"("employment_status", "archived_at", "display_name");
CREATE UNIQUE INDEX "tasks_code_key" ON "app"."tasks"("code");
CREATE UNIQUE INDEX "employee_work_import_batches_period_type_period_start_at_ve_key"
ON "app"."employee_work_import_batches"("period_type", "period_start_at", "version");
CREATE INDEX "employee_work_import_batches_period_type_period_start_at_st_idx"
ON "app"."employee_work_import_batches"("period_type", "period_start_at", "status");
CREATE INDEX "employee_work_import_batches_file_hash_period_type_period_s_idx"
ON "app"."employee_work_import_batches"("file_hash", "period_type", "period_start_at");
CREATE UNIQUE INDEX "employee_work_import_rows_batch_id_row_number_key"
ON "app"."employee_work_import_rows"("batch_id", "row_number");
CREATE INDEX "employee_work_import_rows_batch_id_status_idx"
ON "app"."employee_work_import_rows"("batch_id", "status");
CREATE UNIQUE INDEX "employee_work_items_source_row_id_key"
ON "app"."employee_work_items"("source_row_id");
CREATE UNIQUE INDEX "employee_work_items_risk_id_key"
ON "app"."employee_work_items"("risk_id");
CREATE INDEX "employee_work_items_employee_id_period_start_at_archived_at_idx"
ON "app"."employee_work_items"("employee_id", "period_start_at", "archived_at");
CREATE INDEX "employee_work_items_project_id_period_start_at_archived_at_idx"
ON "app"."employee_work_items"("project_id", "period_start_at", "archived_at");
CREATE INDEX "employee_work_items_import_batch_id_archived_at_idx"
ON "app"."employee_work_items"("import_batch_id", "archived_at");
CREATE UNIQUE INDEX "employee_progress_snapshots_scope_key_period_type_period_st_key"
ON "app"."employee_progress_snapshots"("scope_key", "period_type", "period_start_at", "version");
CREATE INDEX "employee_progress_snapshots_scope_type_scope_id_period_type_idx"
ON "app"."employee_progress_snapshots"("scope_type", "scope_id", "period_type", "period_start_at");
CREATE UNIQUE INDEX "resource_load_entries_employee_work_item_id_key"
ON "app"."resource_load_entries"("employee_work_item_id");

ALTER TABLE "app"."employee_work_import_batches"
ADD CONSTRAINT "employee_work_import_batches_supersedes_batch_id_fkey"
FOREIGN KEY ("supersedes_batch_id") REFERENCES "app"."employee_work_import_batches"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."employee_work_import_batches"
ADD CONSTRAINT "employee_work_import_batches_restored_from_batch_id_fkey"
FOREIGN KEY ("restored_from_batch_id") REFERENCES "app"."employee_work_import_batches"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."employee_work_import_rows"
ADD CONSTRAINT "employee_work_import_rows_batch_id_fkey"
FOREIGN KEY ("batch_id") REFERENCES "app"."employee_work_import_batches"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."employee_work_import_rows"
ADD CONSTRAINT "employee_work_import_rows_resolved_employee_id_fkey"
FOREIGN KEY ("resolved_employee_id") REFERENCES "app"."resource_profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."employee_work_import_rows"
ADD CONSTRAINT "employee_work_import_rows_resolved_project_id_fkey"
FOREIGN KEY ("resolved_project_id") REFERENCES "app"."projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."employee_work_import_rows"
ADD CONSTRAINT "employee_work_import_rows_resolved_task_id_fkey"
FOREIGN KEY ("resolved_task_id") REFERENCES "app"."tasks"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."employee_work_items"
ADD CONSTRAINT "employee_work_items_employee_id_fkey"
FOREIGN KEY ("employee_id") REFERENCES "app"."resource_profiles"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."employee_work_items"
ADD CONSTRAINT "employee_work_items_import_batch_id_fkey"
FOREIGN KEY ("import_batch_id") REFERENCES "app"."employee_work_import_batches"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."employee_work_items"
ADD CONSTRAINT "employee_work_items_source_row_id_fkey"
FOREIGN KEY ("source_row_id") REFERENCES "app"."employee_work_import_rows"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."employee_work_items"
ADD CONSTRAINT "employee_work_items_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."employee_work_items"
ADD CONSTRAINT "employee_work_items_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."employee_work_items"
ADD CONSTRAINT "employee_work_items_risk_id_fkey"
FOREIGN KEY ("risk_id") REFERENCES "app"."risks"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."resource_load_entries"
ADD CONSTRAINT "resource_load_entries_employee_work_item_id_fkey"
FOREIGN KEY ("employee_work_item_id") REFERENCES "app"."employee_work_items"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."resource_load_entries"
ADD CONSTRAINT "resource_load_entries_employee_work_import_batch_id_fkey"
FOREIGN KEY ("employee_work_import_batch_id") REFERENCES "app"."employee_work_import_batches"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
