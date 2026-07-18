CREATE UNIQUE INDEX "data_fields_one_active_primary_per_table_idx"
ON "app"."data_fields" ("table_id")
WHERE "is_primary" = true AND "archived_at" IS NULL;
