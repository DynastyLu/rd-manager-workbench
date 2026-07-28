CREATE TYPE "app"."ProjectWeightMode" AS ENUM (
  'EQUAL',
  'CUSTOM'
);

CREATE TYPE "app"."ProgressReportSourceType" AS ENUM (
  'MANUAL',
  'TASK_CHANGE',
  'MILESTONE_CHANGE',
  'SYSTEM_RECALCULATION'
);

ALTER TABLE "app"."projects"
ADD COLUMN "weight_mode" "app"."ProjectWeightMode" NOT NULL DEFAULT 'EQUAL';

ALTER TABLE "app"."milestones"
ADD COLUMN "planned_start_at" TIMESTAMPTZ(6),
ADD COLUMN "planned_end_at" TIMESTAMPTZ(6),
ADD COLUMN "weight_percent" DECIMAL(5, 2),
ADD COLUMN "manual_completion_percent" DECIMAL(5, 2);

UPDATE "app"."milestones"
SET "planned_end_at" = "planned_at"
WHERE "planned_at" IS NOT NULL
  AND "planned_end_at" IS NULL;

ALTER TABLE "app"."milestones"
ADD CONSTRAINT "milestones_weight_percent_check"
CHECK ("weight_percent" IS NULL OR ("weight_percent" >= 0 AND "weight_percent" <= 100)),
ADD CONSTRAINT "milestones_manual_completion_percent_check"
CHECK (
  "manual_completion_percent" IS NULL
  OR ("manual_completion_percent" >= 0 AND "manual_completion_percent" <= 100)
),
ADD CONSTRAINT "milestones_planned_range_check"
CHECK (
  "planned_start_at" IS NULL
  OR "planned_end_at" IS NULL
  OR "planned_end_at" >= "planned_start_at"
);

ALTER TABLE "app"."progress_reports"
ADD COLUMN "previous_percent" DECIMAL(5, 2),
ADD COLUMN "source_type" "app"."ProgressReportSourceType" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "milestone_id" TEXT,
ADD COLUMN "task_id" TEXT,
ADD COLUMN "next_steps" TEXT,
ADD COLUMN "change_snapshot" JSONB;

UPDATE "app"."progress_reports"
SET "source_type" = 'MANUAL'
WHERE "source_type" IS NULL;

CREATE INDEX "milestones_project_id_planned_start_at_planned_end_at_idx"
ON "app"."milestones"("project_id", "planned_start_at", "planned_end_at");

CREATE INDEX "progress_reports_project_id_source_type_reported_at_idx"
ON "app"."progress_reports"("project_id", "source_type", "reported_at");

ALTER TABLE "app"."progress_reports"
ADD CONSTRAINT "progress_reports_milestone_id_fkey"
FOREIGN KEY ("milestone_id") REFERENCES "app"."milestones"("id")
ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "progress_reports_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
