CREATE TYPE "app"."NonProjectRdKind" AS ENUM ('TECH_EXPLORATION', 'NEW_DIRECTION', 'PLATFORM_TOOL', 'TECH_DEBT', 'PATENT', 'STANDARD_METHOD', 'TRAINING', 'TEMPORARY_SUPPORT');
CREATE TYPE "app"."NonProjectRdStatus" AS ENUM ('DRAFT', 'PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
CREATE TYPE "app"."NonProjectOutcomeStatus" AS ENUM ('DRAFT', 'VERIFIED', 'REJECTED');
CREATE TYPE "app"."SkillLevel" AS ENUM ('AWARE', 'PRACTICING', 'PROFICIENT', 'EXPERT');
CREATE TYPE "app"."LoadEntryKind" AS ENUM ('NON_PROJECT_RD', 'PROJECT', 'TASK', 'OTHER');
CREATE TYPE "app"."WeeklyReportStatus" AS ENUM ('DRAFT', 'FINAL', 'ARCHIVED');

CREATE TABLE "app"."non_project_rd_items" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "kind" "app"."NonProjectRdKind" NOT NULL, "title" TEXT NOT NULL,
  "objective" TEXT, "expected_outcome" TEXT, "owner_name" TEXT, "planned_start_at" TIMESTAMPTZ(6), "planned_end_at" TIMESTAMPTZ(6),
  "actual_start_at" TIMESTAMPTZ(6), "actual_end_at" TIMESTAMPTZ(6), "planned_person_hours" INTEGER NOT NULL DEFAULT 0,
  "status" "app"."NonProjectRdStatus" NOT NULL DEFAULT 'DRAFT', "impact_scope" TEXT, "severity" TEXT, "suggested_project_name" TEXT,
  "project_id" TEXT, "archived_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "non_project_rd_items_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "app"."non_project_rd_outcomes" (
  "id" TEXT NOT NULL, "item_id" TEXT NOT NULL, "title" TEXT NOT NULL, "summary" TEXT,
  "status" "app"."NonProjectOutcomeStatus" NOT NULL DEFAULT 'DRAFT', "verified_at" TIMESTAMPTZ(6), "evidence_note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "non_project_rd_outcomes_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "app"."resource_profiles" (
  "id" TEXT NOT NULL, "display_name" TEXT NOT NULL, "role_title" TEXT, "weekly_capacity_hours" INTEGER NOT NULL DEFAULT 40,
  "development_goal" TEXT, "notes" TEXT, "archived_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "resource_profiles_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "app"."resource_skills" (
  "id" TEXT NOT NULL, "resource_id" TEXT NOT NULL, "name" TEXT NOT NULL, "level" "app"."SkillLevel" NOT NULL,
  "evidence" TEXT, "assessed_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "resource_skills_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "app"."resource_load_entries" (
  "id" TEXT NOT NULL, "resource_id" TEXT NOT NULL, "week_start_at" DATE NOT NULL, "kind" "app"."LoadEntryKind" NOT NULL,
  "non_project_rd_item_id" TEXT, "project_id" TEXT, "task_id" TEXT, "planned_hours" DECIMAL(6,2) NOT NULL, "note" TEXT,
  "archived_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "resource_load_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "resource_load_entries_reference_by_kind_check" CHECK (
    ("kind" = 'NON_PROJECT_RD' AND "non_project_rd_item_id" IS NOT NULL AND "project_id" IS NULL AND "task_id" IS NULL) OR
    ("kind" = 'PROJECT' AND "project_id" IS NOT NULL AND "non_project_rd_item_id" IS NULL AND "task_id" IS NULL) OR
    ("kind" = 'TASK' AND "task_id" IS NOT NULL AND "non_project_rd_item_id" IS NULL AND "project_id" IS NULL) OR
    ("kind" = 'OTHER' AND "non_project_rd_item_id" IS NULL AND "project_id" IS NULL AND "task_id" IS NULL)
  )
);
CREATE TABLE "app"."weekly_report_drafts" (
  "id" TEXT NOT NULL, "week_start_at" DATE NOT NULL, "title" TEXT NOT NULL, "content" JSONB NOT NULL, "source_snapshot" JSONB NOT NULL,
  "status" "app"."WeeklyReportStatus" NOT NULL DEFAULT 'DRAFT', "version" INTEGER NOT NULL, "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "weekly_report_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "non_project_rd_items_code_key" ON "app"."non_project_rd_items"("code");
CREATE INDEX "non_project_rd_items_status_archived_at_planned_end_at_idx" ON "app"."non_project_rd_items"("status", "archived_at", "planned_end_at");
CREATE INDEX "non_project_rd_outcomes_item_id_created_at_idx" ON "app"."non_project_rd_outcomes"("item_id", "created_at");
CREATE UNIQUE INDEX "resource_profiles_display_name_key" ON "app"."resource_profiles"("display_name");
CREATE INDEX "resource_profiles_archived_at_display_name_idx" ON "app"."resource_profiles"("archived_at", "display_name");
CREATE UNIQUE INDEX "resource_skills_resource_id_name_key" ON "app"."resource_skills"("resource_id", "name");
CREATE INDEX "resource_load_entries_resource_id_archived_at_week_start_at_idx" ON "app"."resource_load_entries"("resource_id", "archived_at", "week_start_at");
CREATE UNIQUE INDEX "weekly_report_drafts_week_start_at_version_key" ON "app"."weekly_report_drafts"("week_start_at", "version");
CREATE INDEX "weekly_report_drafts_week_start_at_archived_at_idx" ON "app"."weekly_report_drafts"("week_start_at", "archived_at");

ALTER TABLE "app"."non_project_rd_items" ADD CONSTRAINT "non_project_rd_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."non_project_rd_outcomes" ADD CONSTRAINT "non_project_rd_outcomes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "app"."non_project_rd_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."resource_skills" ADD CONSTRAINT "resource_skills_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "app"."resource_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."resource_load_entries" ADD CONSTRAINT "resource_load_entries_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "app"."resource_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."resource_load_entries" ADD CONSTRAINT "resource_load_entries_non_project_rd_item_id_fkey" FOREIGN KEY ("non_project_rd_item_id") REFERENCES "app"."non_project_rd_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."resource_load_entries" ADD CONSTRAINT "resource_load_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."resource_load_entries" ADD CONSTRAINT "resource_load_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
