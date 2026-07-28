CREATE TYPE "app"."EmployeeWorkKind" AS ENUM ('PROJECT', 'NON_PROJECT');
CREATE TYPE "app"."EmployeeWorkSourceSection" AS ENUM ('CURRENT_WORK', 'NEXT_WEEK_PLAN');
CREATE TYPE "app"."EmployeePlanPriority" AS ENUM ('UNSPECIFIED', 'LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "app"."EmployeePlanCarryStatus" AS ENUM ('PLANNED', 'MATCHED', 'CANCELLED');

ALTER TABLE "app"."resource_profiles"
  ADD COLUMN "work_direction" TEXT;

ALTER TABLE "app"."employee_work_import_rows"
  ADD COLUMN "source_sheet_name" TEXT,
  ADD COLUMN "source_section" "app"."EmployeeWorkSourceSection",
  ADD COLUMN "source_row_number" INTEGER,
  ADD COLUMN "source_key" TEXT,
  ADD COLUMN "work_kind" "app"."EmployeeWorkKind",
  ADD COLUMN "planned_hours" DECIMAL(6,2),
  ADD COLUMN "actual_hours" DECIMAL(6,2),
  ADD COLUMN "profile_action" TEXT,
  ADD COLUMN "risk_decision" TEXT,
  ADD COLUMN "risk_text" TEXT;

ALTER TABLE "app"."employee_work_items"
  ADD COLUMN "work_kind" "app"."EmployeeWorkKind",
  ADD COLUMN "planned_completion_at" DATE;

CREATE TABLE "app"."employee_week_plan_items" (
  "id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "import_batch_id" TEXT NOT NULL,
  "source_row_id" TEXT NOT NULL,
  "period_start_at" DATE NOT NULL,
  "period_end_at" DATE NOT NULL,
  "title" TEXT NOT NULL,
  "deliverable_text" TEXT,
  "planned_completion_at" DATE,
  "priority" "app"."EmployeePlanPriority" NOT NULL DEFAULT 'UNSPECIFIED',
  "collaboration_text" TEXT,
  "plan_text" TEXT,
  "note" TEXT,
  "work_kind" "app"."EmployeeWorkKind" NOT NULL,
  "project_id" TEXT,
  "task_id" TEXT,
  "carry_status" "app"."EmployeePlanCarryStatus" NOT NULL DEFAULT 'PLANNED',
  "matched_work_item_id" TEXT,
  "cancel_reason" TEXT,
  "raw_row" JSONB NOT NULL,
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "employee_week_plan_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_work_import_rows_batch_id_source_key_key"
  ON "app"."employee_work_import_rows"("batch_id", "source_key");

CREATE UNIQUE INDEX "employee_week_plan_items_source_row_id_key"
  ON "app"."employee_week_plan_items"("source_row_id");

CREATE UNIQUE INDEX "employee_week_plan_items_matched_work_item_id_key"
  ON "app"."employee_week_plan_items"("matched_work_item_id");

CREATE INDEX "employee_week_plan_items_employee_period_archive_idx"
  ON "app"."employee_week_plan_items"("employee_id", "period_start_at", "archived_at");

CREATE INDEX "employee_week_plan_items_project_period_archive_idx"
  ON "app"."employee_week_plan_items"("project_id", "period_start_at", "archived_at");

CREATE INDEX "employee_week_plan_items_batch_archive_idx"
  ON "app"."employee_week_plan_items"("import_batch_id", "archived_at");

CREATE INDEX "employee_week_plan_items_carry_period_archive_idx"
  ON "app"."employee_week_plan_items"("carry_status", "period_start_at", "archived_at");

ALTER TABLE "app"."employee_week_plan_items"
  ADD CONSTRAINT "employee_week_plan_items_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "app"."resource_profiles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."employee_week_plan_items"
  ADD CONSTRAINT "employee_week_plan_items_import_batch_id_fkey"
  FOREIGN KEY ("import_batch_id") REFERENCES "app"."employee_work_import_batches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."employee_week_plan_items"
  ADD CONSTRAINT "employee_week_plan_items_source_row_id_fkey"
  FOREIGN KEY ("source_row_id") REFERENCES "app"."employee_work_import_rows"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "app"."employee_week_plan_items"
  ADD CONSTRAINT "employee_week_plan_items_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."employee_week_plan_items"
  ADD CONSTRAINT "employee_week_plan_items_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app"."employee_week_plan_items"
  ADD CONSTRAINT "employee_week_plan_items_matched_work_item_id_fkey"
  FOREIGN KEY ("matched_work_item_id") REFERENCES "app"."employee_work_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
