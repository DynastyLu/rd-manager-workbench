CREATE SCHEMA IF NOT EXISTS "platform";

CREATE TYPE "platform"."TenantStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "platform"."JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED');

CREATE TABLE "platform"."tenants" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schema_name" TEXT NOT NULL,
    "status" "platform"."TenantStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform"."platform_operators" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "platform_operators_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform"."jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "platform"."JobStatus" NOT NULL DEFAULT 'QUEUED',
    "queue_job_id" TEXT,
    "tenant_id" TEXT,
    "tenant_key" TEXT,
    "operator_id" TEXT,
    "trace_id" TEXT,
    "input" JSONB,
    "result" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform"."generated_files" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "generated_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_key_key" ON "platform"."tenants"("key");
CREATE UNIQUE INDEX "tenants_schema_name_key" ON "platform"."tenants"("schema_name");
CREATE UNIQUE INDEX "platform_operators_email_key" ON "platform"."platform_operators"("email");
CREATE INDEX "jobs_type_status_idx" ON "platform"."jobs"("type", "status");
CREATE INDEX "jobs_tenant_id_idx" ON "platform"."jobs"("tenant_id");
CREATE INDEX "generated_files_job_id_idx" ON "platform"."generated_files"("job_id");

ALTER TABLE "platform"."generated_files"
ADD CONSTRAINT "generated_files_job_id_fkey"
FOREIGN KEY ("job_id") REFERENCES "platform"."jobs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
