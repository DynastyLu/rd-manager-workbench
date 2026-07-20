CREATE TABLE IF NOT EXISTS "app"."partner_projects" (
  "partner_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "role" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "app"."partner_projects"
  ADD COLUMN IF NOT EXISTS "role" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'partner_projects_pkey'
      AND conrelid = 'app.partner_projects'::regclass
  ) THEN
    ALTER TABLE "app"."partner_projects"
      ADD CONSTRAINT "partner_projects_pkey" PRIMARY KEY ("partner_id", "project_id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "partner_projects_project_id_idx"
  ON "app"."partner_projects"("project_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'partner_projects_partner_id_fkey'
      AND conrelid = 'app.partner_projects'::regclass
  ) THEN
    ALTER TABLE "app"."partner_projects"
      ADD CONSTRAINT "partner_projects_partner_id_fkey"
      FOREIGN KEY ("partner_id") REFERENCES "app"."partners"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'partner_projects_project_id_fkey'
      AND conrelid = 'app.partner_projects'::regclass
  ) THEN
    ALTER TABLE "app"."partner_projects"
      ADD CONSTRAINT "partner_projects_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "app"."communication_records"
  ADD COLUMN IF NOT EXISTS "task_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "communication_records_task_id_key"
  ON "app"."communication_records"("task_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'communication_records_task_id_fkey'
      AND conrelid = 'app.communication_records'::regclass
  ) THEN
    ALTER TABLE "app"."communication_records"
      ADD CONSTRAINT "communication_records_task_id_fkey"
      FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "app"."non_project_rd_items"
  ADD COLUMN IF NOT EXISTS "task_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "non_project_rd_items_task_id_key"
  ON "app"."non_project_rd_items"("task_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'non_project_rd_items_task_id_fkey'
      AND conrelid = 'app.non_project_rd_items'::regclass
  ) THEN
    ALTER TABLE "app"."non_project_rd_items"
      ADD CONSTRAINT "non_project_rd_items_task_id_fkey"
      FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
