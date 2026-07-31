ALTER TABLE "app"."projects"
ADD COLUMN "work_item_view_config" JSONB;

CREATE TABLE "app"."project_plan_baselines" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "project_planned_start_at" TIMESTAMPTZ(6),
  "project_planned_end_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_plan_baselines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."project_plan_milestone_snapshots" (
  "id" TEXT NOT NULL,
  "baseline_id" TEXT NOT NULL,
  "milestone_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "planned_at" TIMESTAMPTZ(6),
  "planned_start_at" TIMESTAMPTZ(6),
  "planned_end_at" TIMESTAMPTZ(6),
  "is_critical" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "project_plan_milestone_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."project_plan_task_snapshots" (
  "id" TEXT NOT NULL,
  "baseline_id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "milestone_id" TEXT,
  "title" TEXT NOT NULL,
  "status" "app"."TaskStatus" NOT NULL,
  "due_at" TIMESTAMPTZ(6),
  "dependency_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_critical" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "project_plan_task_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."project_plan_changes" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "before_value" JSONB,
  "after_value" JSONB,
  "reason" TEXT NOT NULL,
  "impact_preview" JSONB,
  "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_plan_changes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_plan_baselines_project_id_version_key"
ON "app"."project_plan_baselines"("project_id", "version");
CREATE INDEX "project_plan_baselines_project_id_created_at_idx"
ON "app"."project_plan_baselines"("project_id", "created_at");
CREATE UNIQUE INDEX "project_plan_milestone_snapshots_baseline_id_milestone_id_key"
ON "app"."project_plan_milestone_snapshots"("baseline_id", "milestone_id");
CREATE INDEX "project_plan_milestone_snapshots_milestone_id_idx"
ON "app"."project_plan_milestone_snapshots"("milestone_id");
CREATE UNIQUE INDEX "project_plan_task_snapshots_baseline_id_task_id_key"
ON "app"."project_plan_task_snapshots"("baseline_id", "task_id");
CREATE INDEX "project_plan_task_snapshots_task_id_idx"
ON "app"."project_plan_task_snapshots"("task_id");
CREATE INDEX "project_plan_changes_project_id_changed_at_idx"
ON "app"."project_plan_changes"("project_id", "changed_at");
CREATE INDEX "project_plan_changes_entity_type_entity_id_changed_at_idx"
ON "app"."project_plan_changes"("entity_type", "entity_id", "changed_at");

ALTER TABLE "app"."project_plan_baselines"
ADD CONSTRAINT "project_plan_baselines_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."project_plan_milestone_snapshots"
ADD CONSTRAINT "project_plan_milestone_snapshots_baseline_id_fkey"
FOREIGN KEY ("baseline_id") REFERENCES "app"."project_plan_baselines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."project_plan_task_snapshots"
ADD CONSTRAINT "project_plan_task_snapshots_baseline_id_fkey"
FOREIGN KEY ("baseline_id") REFERENCES "app"."project_plan_baselines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."project_plan_changes"
ADD CONSTRAINT "project_plan_changes_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
