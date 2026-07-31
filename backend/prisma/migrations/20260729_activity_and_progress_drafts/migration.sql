ALTER TYPE "app"."ProgressReportSourceType"
  ADD VALUE IF NOT EXISTS 'EMPLOYEE_WEEKLY_DRAFT';

CREATE TYPE "app"."ProjectProgressDraftStatus" AS ENUM (
  'PENDING',
  'ADOPTED',
  'IGNORED',
  'INVALIDATED'
);

CREATE TYPE "app"."ActivityActorKind" AS ENUM (
  'HUMAN',
  'AUTOMATION',
  'SYSTEM'
);

CREATE TABLE "app"."project_progress_drafts" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "source_batch_id" TEXT NOT NULL,
  "source_version" INTEGER NOT NULL,
  "period_start_at" DATE NOT NULL,
  "period_end_at" DATE NOT NULL,
  "content_fingerprint" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "summary" TEXT NOT NULL,
  "completed_results" TEXT,
  "next_steps" TEXT,
  "blockers" TEXT,
  "risk_summary" TEXT,
  "hours_summary" TEXT,
  "unlinked_row_count" INTEGER NOT NULL DEFAULT 0,
  "status" "app"."ProjectProgressDraftStatus" NOT NULL DEFAULT 'PENDING',
  "adopted_report_id" TEXT,
  "adopted_at" TIMESTAMPTZ(6),
  "ignored_at" TIMESTAMPTZ(6),
  "invalidated_at" TIMESTAMPTZ(6),
  "invalidation_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "project_progress_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_progress_drafts_adopted_report_id_key"
  ON "app"."project_progress_drafts"("adopted_report_id");
CREATE UNIQUE INDEX "project_progress_drafts_project_source_fingerprint_key"
  ON "app"."project_progress_drafts"("project_id", "source_batch_id", "content_fingerprint");
CREATE INDEX "project_progress_drafts_project_status_period_idx"
  ON "app"."project_progress_drafts"("project_id", "status", "period_start_at");
CREATE INDEX "project_progress_drafts_source_status_idx"
  ON "app"."project_progress_drafts"("source_batch_id", "status");

ALTER TABLE "app"."project_progress_drafts"
  ADD CONSTRAINT "project_progress_drafts_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "project_progress_drafts_source_batch_id_fkey"
  FOREIGN KEY ("source_batch_id") REFERENCES "app"."employee_work_import_batches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "project_progress_drafts_adopted_report_id_fkey"
  FOREIGN KEY ("adopted_report_id") REFERENCES "app"."progress_reports"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Historical test and local databases may contain an action whose linked task
-- was removed before this relation became enforceable. Preserve the action,
-- clear only the dangling optional link, and then add the forward constraint.
UPDATE "app"."meeting_actions" AS "action"
SET "task_id" = NULL
WHERE "action"."task_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "app"."tasks" AS "task"
    WHERE "task"."id" = "action"."task_id"
  );

ALTER TABLE "app"."meeting_actions"
  ADD CONSTRAINT "meeting_actions_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "app"."activity_records" (
  "id" TEXT NOT NULL,
  "actor_kind" "app"."ActivityActorKind" NOT NULL,
  "actor_id" TEXT,
  "actor_name" TEXT,
  "object_type" TEXT NOT NULL,
  "object_id" TEXT NOT NULL,
  "project_id" TEXT,
  "employee_id" TEXT,
  "action" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "source_path" TEXT NOT NULL,
  "metadata" JSONB,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activity_records_project_occurred_id_idx"
  ON "app"."activity_records"("project_id", "occurred_at", "id");
CREATE INDEX "activity_records_employee_occurred_id_idx"
  ON "app"."activity_records"("employee_id", "occurred_at", "id");
CREATE INDEX "activity_records_object_occurred_idx"
  ON "app"."activity_records"("object_type", "object_id", "occurred_at");
CREATE INDEX "activity_records_occurred_id_idx"
  ON "app"."activity_records"("occurred_at", "id");

ALTER TABLE "app"."activity_records"
  ADD CONSTRAINT "activity_records_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "activity_records_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "app"."resource_profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "app"."prevent_activity_record_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity_records are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "activity_records_no_update"
  BEFORE UPDATE OR DELETE ON "app"."activity_records"
  FOR EACH ROW EXECUTE FUNCTION "app"."prevent_activity_record_mutation"();

CREATE OR REPLACE FUNCTION "app"."capture_project_activity"()
RETURNS trigger AS $$
BEGIN
  INSERT INTO "app"."activity_records" (
    "id", "actor_kind", "object_type", "object_id", "project_id",
    "action", "summary", "source_path"
  ) VALUES (
    gen_random_uuid()::text, 'SYSTEM', 'PROJECT', NEW."id", NEW."id",
    CASE WHEN TG_OP = 'INSERT' THEN 'CREATED' ELSE 'UPDATED' END,
    left(CASE WHEN TG_OP = 'INSERT' THEN '创建项目：' ELSE '更新项目：' END || NEW."name", 500),
    '/projects/' || NEW."id"
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "app"."capture_progress_activity"()
RETURNS trigger AS $$
BEGIN
  INSERT INTO "app"."activity_records" (
    "id", "actor_kind", "object_type", "object_id", "project_id",
    "action", "summary", "source_path"
  ) VALUES (
    gen_random_uuid()::text, 'SYSTEM', 'PROGRESS_REPORT', NEW."id", NEW."project_id",
    'CREATED', left('提交项目进展：' || NEW."summary", 500),
    '/projects/' || NEW."project_id" || '?tab=progress'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "app"."capture_risk_activity"()
RETURNS trigger AS $$
BEGIN
  INSERT INTO "app"."activity_records" (
    "id", "actor_kind", "object_type", "object_id", "project_id",
    "action", "summary", "source_path"
  ) VALUES (
    gen_random_uuid()::text, 'SYSTEM', 'RISK', NEW."id", NEW."project_id",
    CASE WHEN TG_OP = 'INSERT' THEN 'CREATED' ELSE 'UPDATED' END,
    left(CASE WHEN TG_OP = 'INSERT' THEN '新增风险：' ELSE '更新风险：' END || NEW."title", 500),
    '/risks?riskId=' || NEW."id"
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "app"."capture_meeting_activity"()
RETURNS trigger AS $$
BEGIN
  INSERT INTO "app"."activity_records" (
    "id", "actor_kind", "object_type", "object_id", "project_id",
    "action", "summary", "source_path"
  ) VALUES (
    gen_random_uuid()::text, 'SYSTEM', 'MEETING', NEW."id", NEW."project_id",
    CASE WHEN TG_OP = 'INSERT' THEN 'CREATED' ELSE 'UPDATED' END,
    left(CASE WHEN TG_OP = 'INSERT' THEN '创建会议：' ELSE '更新会议：' END || NEW."title", 500),
    '/meetings?meetingId=' || NEW."id"
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "app"."capture_document_activity"()
RETURNS trigger AS $$
BEGIN
  IF NEW."project_id" IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO "app"."activity_records" (
    "id", "actor_kind", "object_type", "object_id", "project_id",
    "action", "summary", "source_path"
  ) VALUES (
    gen_random_uuid()::text, 'SYSTEM', 'DOCUMENT', NEW."id", NEW."project_id",
    CASE WHEN TG_OP = 'INSERT' THEN 'CREATED' ELSE 'UPDATED' END,
    left(CASE WHEN TG_OP = 'INSERT' THEN '新增文档：' ELSE '更新文档：' END || NEW."title", 500),
    '/knowledge?documentId=' || NEW."id"
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "projects_capture_activity"
  AFTER INSERT OR UPDATE ON "app"."projects"
  FOR EACH ROW EXECUTE FUNCTION "app"."capture_project_activity"();
CREATE TRIGGER "progress_reports_capture_activity"
  AFTER INSERT ON "app"."progress_reports"
  FOR EACH ROW EXECUTE FUNCTION "app"."capture_progress_activity"();
CREATE TRIGGER "risks_capture_activity"
  AFTER INSERT OR UPDATE ON "app"."risks"
  FOR EACH ROW EXECUTE FUNCTION "app"."capture_risk_activity"();
CREATE TRIGGER "meetings_capture_activity"
  AFTER INSERT OR UPDATE ON "app"."meetings"
  FOR EACH ROW EXECUTE FUNCTION "app"."capture_meeting_activity"();
CREATE TRIGGER "content_documents_capture_activity"
  AFTER INSERT OR UPDATE ON "app"."content_documents"
  FOR EACH ROW EXECUTE FUNCTION "app"."capture_document_activity"();
