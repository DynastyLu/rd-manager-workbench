-- CreateEnum
CREATE TYPE "app"."ApplicationCaseStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "app"."ApplicationNodeStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "app"."RequirementStatus" AS ENUM ('SATISFIED', 'PENDING', 'TO_VERIFY', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "app"."MaterialReviewStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "app"."CorrectionStatus" AS ENUM ('OPEN', 'RESOLVED', 'WAIVED');

-- CreateEnum
CREATE TYPE "app"."SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "app"."workflow_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."workflow_template_nodes" (
    "id" TEXT NOT NULL,
    "workflow_template_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sequence" INTEGER NOT NULL,
    "prerequisite_node_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required_requirement_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required_material_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workflow_template_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."application_cases" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "workflow_template_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject_name" TEXT,
    "region" TEXT,
    "organization" TEXT,
    "batch" TEXT,
    "deadline_at" TIMESTAMPTZ(6),
    "collaborator_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "app"."ApplicationCaseStatus" NOT NULL DEFAULT 'DRAFT',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "application_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."application_nodes" (
    "id" TEXT NOT NULL,
    "application_case_id" TEXT NOT NULL,
    "workflow_template_node_id" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sequence" INTEGER NOT NULL,
    "prerequisite_node_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required_requirement_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required_material_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "snapshot" JSONB NOT NULL,
    "status" "app"."ApplicationNodeStatus" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "application_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."application_requirements" (
    "id" TEXT NOT NULL,
    "application_case_id" TEXT NOT NULL,
    "application_node_id" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "status" "app"."RequirementStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "application_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."application_materials" (
    "id" TEXT NOT NULL,
    "application_case_id" TEXT NOT NULL,
    "application_node_id" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "application_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."material_versions" (
    "id" TEXT NOT NULL,
    "application_material_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT,
    "checksum" TEXT,
    "file_size" INTEGER,
    "note" TEXT,
    "review_status" "app"."MaterialReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "is_final" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."evidence_records" (
    "id" TEXT NOT NULL,
    "application_case_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source_uri" TEXT,
    "collected_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evidence_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."evidence_record_links" (
    "id" TEXT NOT NULL,
    "evidence_record_id" TEXT NOT NULL,
    "application_requirement_id" TEXT,
    "application_material_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_record_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."correction_records" (
    "id" TEXT NOT NULL,
    "application_case_id" TEXT NOT NULL,
    "submission_record_id" TEXT,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "due_at" TIMESTAMPTZ(6),
    "status" "app"."CorrectionStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "correction_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."submission_records" (
    "id" TEXT NOT NULL,
    "application_case_id" TEXT NOT NULL,
    "reference_number" TEXT,
    "submitted_by_name" TEXT,
    "submitted_at" TIMESTAMPTZ(6),
    "status" "app"."SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "submission_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."correction_material_versions" (
    "correction_record_id" TEXT NOT NULL,
    "material_version_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correction_material_versions_pkey" PRIMARY KEY ("correction_record_id", "material_version_id")
);

-- CreateTable
CREATE TABLE "app"."submission_material_versions" (
    "submission_record_id" TEXT NOT NULL,
    "material_version_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_material_versions_pkey" PRIMARY KEY ("submission_record_id", "material_version_id")
);

-- CreateIndex
CREATE INDEX "workflow_templates_archived_at_name_idx" ON "app"."workflow_templates"("archived_at", "name");

-- CreateIndex
CREATE INDEX "workflow_template_nodes_workflow_template_id_sequence_idx" ON "app"."workflow_template_nodes"("workflow_template_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_template_nodes_workflow_template_id_code_key" ON "app"."workflow_template_nodes"("workflow_template_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "application_cases_code_key" ON "app"."application_cases"("code");

-- CreateIndex
CREATE INDEX "application_cases_project_id_archived_at_idx" ON "app"."application_cases"("project_id", "archived_at");

-- CreateIndex
CREATE INDEX "application_cases_workflow_template_id_archived_at_idx" ON "app"."application_cases"("workflow_template_id", "archived_at");

-- CreateIndex
CREATE INDEX "application_cases_status_deadline_at_idx" ON "app"."application_cases"("status", "deadline_at");

-- CreateIndex
CREATE INDEX "application_nodes_application_case_id_sequence_idx" ON "app"."application_nodes"("application_case_id", "sequence");

-- CreateIndex
CREATE INDEX "application_nodes_workflow_template_node_id_idx" ON "app"."application_nodes"("workflow_template_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_nodes_application_case_id_code_key" ON "app"."application_nodes"("application_case_id", "code");

-- CreateIndex
CREATE INDEX "application_requirements_application_case_id_status_idx" ON "app"."application_requirements"("application_case_id", "status");

-- CreateIndex
CREATE INDEX "application_requirements_application_node_id_idx" ON "app"."application_requirements"("application_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_requirements_application_case_id_code_key" ON "app"."application_requirements"("application_case_id", "code");

-- CreateIndex
CREATE INDEX "application_materials_application_case_id_is_required_idx" ON "app"."application_materials"("application_case_id", "is_required");

-- CreateIndex
CREATE INDEX "application_materials_application_node_id_idx" ON "app"."application_materials"("application_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_materials_application_case_id_code_key" ON "app"."application_materials"("application_case_id", "code");

-- CreateIndex
CREATE INDEX "material_versions_application_material_id_created_at_idx" ON "app"."material_versions"("application_material_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "material_versions_application_material_id_version_number_key" ON "app"."material_versions"("application_material_id", "version_number");

-- CreateIndex
CREATE INDEX "evidence_records_application_case_id_collected_at_idx" ON "app"."evidence_records"("application_case_id", "collected_at");

-- CreateIndex
CREATE INDEX "evidence_record_links_evidence_record_id_idx" ON "app"."evidence_record_links"("evidence_record_id");

-- CreateIndex
CREATE INDEX "evidence_record_links_application_requirement_id_idx" ON "app"."evidence_record_links"("application_requirement_id");

-- CreateIndex
CREATE INDEX "evidence_record_links_application_material_id_idx" ON "app"."evidence_record_links"("application_material_id");

-- CreateIndex
CREATE INDEX "correction_records_application_case_id_status_due_at_idx" ON "app"."correction_records"("application_case_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "correction_records_submission_record_id_idx" ON "app"."correction_records"("submission_record_id");

-- CreateIndex
CREATE INDEX "submission_records_application_case_id_submitted_at_idx" ON "app"."submission_records"("application_case_id", "submitted_at");

-- CreateIndex
CREATE INDEX "submission_records_status_submitted_at_idx" ON "app"."submission_records"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "correction_material_versions_material_version_id_idx" ON "app"."correction_material_versions"("material_version_id");

-- CreateIndex
CREATE INDEX "submission_material_versions_material_version_id_idx" ON "app"."submission_material_versions"("material_version_id");

-- AddForeignKey
ALTER TABLE "app"."workflow_template_nodes" ADD CONSTRAINT "workflow_template_nodes_workflow_template_id_fkey" FOREIGN KEY ("workflow_template_id") REFERENCES "app"."workflow_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."application_cases" ADD CONSTRAINT "application_cases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."application_cases" ADD CONSTRAINT "application_cases_workflow_template_id_fkey" FOREIGN KEY ("workflow_template_id") REFERENCES "app"."workflow_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."application_nodes" ADD CONSTRAINT "application_nodes_application_case_id_fkey" FOREIGN KEY ("application_case_id") REFERENCES "app"."application_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."application_nodes" ADD CONSTRAINT "application_nodes_workflow_template_node_id_fkey" FOREIGN KEY ("workflow_template_node_id") REFERENCES "app"."workflow_template_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."application_requirements" ADD CONSTRAINT "application_requirements_application_case_id_fkey" FOREIGN KEY ("application_case_id") REFERENCES "app"."application_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."application_requirements" ADD CONSTRAINT "application_requirements_application_node_id_fkey" FOREIGN KEY ("application_node_id") REFERENCES "app"."application_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."application_materials" ADD CONSTRAINT "application_materials_application_case_id_fkey" FOREIGN KEY ("application_case_id") REFERENCES "app"."application_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."application_materials" ADD CONSTRAINT "application_materials_application_node_id_fkey" FOREIGN KEY ("application_node_id") REFERENCES "app"."application_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."material_versions" ADD CONSTRAINT "material_versions_application_material_id_fkey" FOREIGN KEY ("application_material_id") REFERENCES "app"."application_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."evidence_records" ADD CONSTRAINT "evidence_records_application_case_id_fkey" FOREIGN KEY ("application_case_id") REFERENCES "app"."application_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."evidence_record_links" ADD CONSTRAINT "evidence_record_links_evidence_record_id_fkey" FOREIGN KEY ("evidence_record_id") REFERENCES "app"."evidence_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."evidence_record_links" ADD CONSTRAINT "evidence_record_links_application_requirement_id_fkey" FOREIGN KEY ("application_requirement_id") REFERENCES "app"."application_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."evidence_record_links" ADD CONSTRAINT "evidence_record_links_application_material_id_fkey" FOREIGN KEY ("application_material_id") REFERENCES "app"."application_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."correction_records" ADD CONSTRAINT "correction_records_application_case_id_fkey" FOREIGN KEY ("application_case_id") REFERENCES "app"."application_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."correction_records" ADD CONSTRAINT "correction_records_submission_record_id_fkey" FOREIGN KEY ("submission_record_id") REFERENCES "app"."submission_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."submission_records" ADD CONSTRAINT "submission_records_application_case_id_fkey" FOREIGN KEY ("application_case_id") REFERENCES "app"."application_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."correction_material_versions" ADD CONSTRAINT "correction_material_versions_correction_record_id_fkey" FOREIGN KEY ("correction_record_id") REFERENCES "app"."correction_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."correction_material_versions" ADD CONSTRAINT "correction_material_versions_material_version_id_fkey" FOREIGN KEY ("material_version_id") REFERENCES "app"."material_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."submission_material_versions" ADD CONSTRAINT "submission_material_versions_submission_record_id_fkey" FOREIGN KEY ("submission_record_id") REFERENCES "app"."submission_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."submission_material_versions" ADD CONSTRAINT "submission_material_versions_material_version_id_fkey" FOREIGN KEY ("material_version_id") REFERENCES "app"."material_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
