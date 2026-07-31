-- Activity records are immutable business events. Foreign-key SET NULL actions
-- are the one permitted mutation: they detach a deleted project/employee while
-- preserving the original object id, summary and occurrence time.
CREATE OR REPLACE FUNCTION "app"."prevent_activity_record_mutation"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (TO_JSONB(NEW) - 'project_id' - 'employee_id')
      IS NOT DISTINCT FROM
        (TO_JSONB(OLD) - 'project_id' - 'employee_id')
    AND (
      NEW."project_id" IS NOT DISTINCT FROM OLD."project_id"
      OR (OLD."project_id" IS NOT NULL AND NEW."project_id" IS NULL)
    )
    AND (
      NEW."employee_id" IS NOT DISTINCT FROM OLD."employee_id"
      OR (OLD."employee_id" IS NOT NULL AND NEW."employee_id" IS NULL)
    )
    AND (
      NEW."project_id" IS DISTINCT FROM OLD."project_id"
      OR NEW."employee_id" IS DISTINCT FROM OLD."employee_id"
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'activity_records are append-only';
END;
$$ LANGUAGE plpgsql;
