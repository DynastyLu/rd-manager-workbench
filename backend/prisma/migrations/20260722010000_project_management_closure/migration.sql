ALTER TABLE "app"."projects"
ADD COLUMN "health_override" "app"."ProjectHealth";

ALTER TABLE "app"."tasks"
ADD COLUMN "completion_percent" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "app"."tasks"
ADD CONSTRAINT "tasks_completion_percent_check"
CHECK ("completion_percent" >= 0 AND "completion_percent" <= 100);
