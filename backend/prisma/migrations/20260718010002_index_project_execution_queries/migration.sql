-- CreateIndex
CREATE INDEX "milestones_planned_at_idx" ON "app"."milestones"("planned_at");

-- CreateIndex
CREATE INDEX "progress_reports_reported_at_idx" ON "app"."progress_reports"("reported_at");

-- CreateIndex
CREATE INDEX "tasks_archived_at_due_at_idx" ON "app"."tasks"("archived_at", "due_at");

-- CreateIndex
CREATE INDEX "tasks_assignee_name_archived_at_due_at_idx" ON "app"."tasks"("assignee_name", "archived_at", "due_at");
