-- CreateEnum
CREATE TYPE "app"."ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "app"."ProjectPhase" AS ENUM ('DISCOVERY', 'PLANNING', 'RESEARCH', 'DEVELOPMENT', 'VALIDATION', 'DELIVERY');

-- CreateEnum
CREATE TYPE "app"."MilestoneStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'MISSED');

-- CreateEnum
CREATE TYPE "app"."TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "app"."TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "app"."ProjectHealth" AS ENUM ('GREEN', 'YELLOW', 'RED');

-- CreateTable
CREATE TABLE "app"."projects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "research_direction" TEXT,
    "objective" TEXT,
    "expected_outcome" TEXT,
    "lead_name" TEXT,
    "participant_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "planned_start_at" TIMESTAMPTZ(6),
    "planned_end_at" TIMESTAMPTZ(6),
    "actual_start_at" TIMESTAMPTZ(6),
    "actual_end_at" TIMESTAMPTZ(6),
    "phase" "app"."ProjectPhase" NOT NULL DEFAULT 'PLANNING',
    "status" "app"."ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."milestones" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "planned_at" TIMESTAMPTZ(6),
    "actual_at" TIMESTAMPTZ(6),
    "owner_name" TEXT,
    "is_critical" BOOLEAN NOT NULL DEFAULT false,
    "status" "app"."MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."tasks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "milestone_id" TEXT,
    "parent_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignee_name" TEXT,
    "collaborator_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" "app"."TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "app"."TaskStatus" NOT NULL DEFAULT 'TODO',
    "due_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "source_type" TEXT,
    "source_id" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."task_dependencies" (
    "task_id" TEXT NOT NULL,
    "depends_on_task_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("task_id","depends_on_task_id")
);

-- CreateTable
CREATE TABLE "app"."progress_reports" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "reported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "completion_percent" INTEGER NOT NULL,
    "blockers" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "progress_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."project_health_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "health" "app"."ProjectHealth" NOT NULL,
    "reasons" JSONB NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "app"."projects"("code");

-- CreateIndex
CREATE INDEX "projects_status_archived_at_idx" ON "app"."projects"("status", "archived_at");

-- CreateIndex
CREATE INDEX "projects_planned_end_at_idx" ON "app"."projects"("planned_end_at");

-- CreateIndex
CREATE INDEX "milestones_project_id_planned_at_idx" ON "app"."milestones"("project_id", "planned_at");

-- CreateIndex
CREATE INDEX "tasks_project_id_status_due_at_idx" ON "app"."tasks"("project_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "tasks_milestone_id_idx" ON "app"."tasks"("milestone_id");

-- CreateIndex
CREATE INDEX "tasks_parent_id_idx" ON "app"."tasks"("parent_id");

-- CreateIndex
CREATE INDEX "task_dependencies_depends_on_task_id_idx" ON "app"."task_dependencies"("depends_on_task_id");

-- CreateIndex
CREATE INDEX "progress_reports_project_id_reported_at_idx" ON "app"."progress_reports"("project_id", "reported_at");

-- CreateIndex
CREATE INDEX "project_health_snapshots_project_id_calculated_at_idx" ON "app"."project_health_snapshots"("project_id", "calculated_at");

-- AddForeignKey
ALTER TABLE "app"."milestones" ADD CONSTRAINT "milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "app"."milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "app"."tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_fkey" FOREIGN KEY ("depends_on_task_id") REFERENCES "app"."tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."progress_reports" ADD CONSTRAINT "progress_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."project_health_snapshots" ADD CONSTRAINT "project_health_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
