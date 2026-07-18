CREATE TYPE "app"."DataTableSource" AS ENUM ('CUSTOM', 'PROJECTS', 'WORK_TASKS', 'MEETING_ACTIONS', 'DOCUMENTS', 'RISKS_DECISIONS');
CREATE TYPE "app"."DataFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DATETIME', 'SINGLE_SELECT', 'MULTI_SELECT', 'CHECKBOX', 'LINK', 'ATTACHMENT', 'RELATION', 'CREATED_AT', 'UPDATED_AT');
CREATE TYPE "app"."DataViewType" AS ENUM ('GRID', 'KANBAN', 'CALENDAR', 'FORM');

CREATE TABLE "app"."data_workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "data_workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."data_tables" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "app"."DataTableSource" NOT NULL DEFAULT 'CUSTOM',
    "preset_key" TEXT,
    "icon" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "data_tables_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."data_fields" (
    "id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "app"."DataFieldType" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "data_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."data_records" (
    "id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "data_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."data_views" (
    "id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "app"."DataViewType" NOT NULL DEFAULT 'GRID',
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "data_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "data_tables_preset_key_key" ON "app"."data_tables"("preset_key");
CREATE INDEX "data_workspaces_archived_at_sequence_name_idx" ON "app"."data_workspaces"("archived_at", "sequence", "name");
CREATE INDEX "data_tables_workspace_id_archived_at_sequence_idx" ON "app"."data_tables"("workspace_id", "archived_at", "sequence");
CREATE UNIQUE INDEX "data_fields_table_id_key_key" ON "app"."data_fields"("table_id", "key");
CREATE INDEX "data_fields_table_id_archived_at_sequence_idx" ON "app"."data_fields"("table_id", "archived_at", "sequence");
CREATE INDEX "data_records_table_id_updated_at_idx" ON "app"."data_records"("table_id", "updated_at");
CREATE INDEX "data_views_table_id_sequence_idx" ON "app"."data_views"("table_id", "sequence");

ALTER TABLE "app"."data_tables" ADD CONSTRAINT "data_tables_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "app"."data_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."data_fields" ADD CONSTRAINT "data_fields_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "app"."data_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."data_records" ADD CONSTRAINT "data_records_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "app"."data_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."data_views" ADD CONSTRAINT "data_views_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "app"."data_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
