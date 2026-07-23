BEGIN;

LOCK TABLE "app"."tasks" IN ACCESS EXCLUSIVE MODE;

CREATE SEQUENCE IF NOT EXISTS "app"."task_code_seq"
AS BIGINT
INCREMENT BY 1
MINVALUE 1
MAXVALUE 1099511627775
START WITH 1
NO CYCLE;

SELECT SETVAL(
  'app.task_code_seq',
  GREATEST((SELECT COUNT(*) FROM "app"."tasks"), 1),
  EXISTS(SELECT 1 FROM "app"."tasks")
);

CREATE OR REPLACE FUNCTION "app"."generate_task_code"()
RETURNS TEXT
LANGUAGE SQL
VOLATILE
AS $$
  WITH RECURSIVE "candidates" AS (
    SELECT 'TASK-' || LPAD(UPPER(TO_HEX(NEXTVAL('app.task_code_seq'))), 10, '0') AS "code"
    UNION ALL
    SELECT 'TASK-' || LPAD(UPPER(TO_HEX(NEXTVAL('app.task_code_seq'))), 10, '0')
    FROM "candidates"
    WHERE EXISTS (
      SELECT 1
      FROM "app"."tasks"
      WHERE "tasks"."code" = "candidates"."code"
    )
  )
  SELECT "code"
  FROM "candidates"
  WHERE NOT EXISTS (
    SELECT 1
    FROM "app"."tasks"
    WHERE "tasks"."code" = "candidates"."code"
  )
  LIMIT 1;
$$;

ALTER TABLE "app"."tasks"
ALTER COLUMN "code" SET DEFAULT "app"."generate_task_code"();

COMMIT;

CREATE INDEX IF NOT EXISTS "resource_load_entries_employee_work_import_batch_id_archive_idx"
ON "app"."resource_load_entries"("employee_work_import_batch_id", "archived_at");
