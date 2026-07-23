BEGIN;

LOCK TABLE "app"."tasks" IN ACCESS EXCLUSIVE MODE;

CREATE SEQUENCE IF NOT EXISTS "app"."task_code_seq"
AS BIGINT
INCREMENT BY 1
MINVALUE 1
MAXVALUE 1099511627775
START WITH 1
NO CYCLE;

WITH "task_code_state" AS (
  SELECT
    COUNT(*)::BIGINT AS "task_count",
    COALESCE(
      MAX(
        (('x' || SUBSTRING("code" FROM 6))::BIT(40)::BIGINT)
      ) FILTER (WHERE "code" ~ '^TASK-[A-F0-9]{10}$'),
      0
    )::BIGINT AS "max_code_number"
  FROM "app"."tasks"
)
SELECT SETVAL(
  'app.task_code_seq',
  GREATEST("task_count", "max_code_number", 1),
  GREATEST("task_count", "max_code_number") > 0
)
FROM "task_code_state";

CREATE OR REPLACE FUNCTION "app"."generate_task_code"()
RETURNS TEXT
LANGUAGE SQL
VOLATILE
AS $$
  SELECT 'TASK-' || LPAD(
    UPPER(TO_HEX(NEXTVAL('app.task_code_seq'))),
    10,
    '0'
  );
$$;

ALTER TABLE "app"."tasks"
ALTER COLUMN "code" SET DEFAULT "app"."generate_task_code"();

CREATE INDEX IF NOT EXISTS "resource_load_entries_employee_work_import_batch_id_archive_idx"
ON "app"."resource_load_entries"("employee_work_import_batch_id", "archived_at");

COMMIT;
