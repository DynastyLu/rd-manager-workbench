-- CreateEnum
CREATE TYPE "app"."BusinessVisibility" AS ENUM ('PRIVATE', 'INVOLVED', 'ORGANIZATION');

-- AlterTable
ALTER TABLE "app"."application_cases" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."content_documents" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT,
ADD COLUMN     "visibility" "app"."BusinessVisibility" NOT NULL DEFAULT 'PRIVATE';

-- AlterTable
ALTER TABLE "app"."data_tables" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT,
ADD COLUMN     "visibility" "app"."BusinessVisibility" NOT NULL DEFAULT 'PRIVATE';

-- AlterTable
ALTER TABLE "app"."data_views" ADD COLUMN     "owner_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."decisions" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."employee_week_plan_items" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."employee_work_items" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."intelligence_briefs" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."intelligence_collection_plans" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."intelligence_items" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."intelligence_sources" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."intelligence_topics" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."issues" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."knowledge_spaces" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT,
ADD COLUMN     "visibility" "app"."BusinessVisibility" NOT NULL DEFAULT 'PRIVATE';

-- AlterTable
ALTER TABLE "app"."meeting_actions" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."meetings" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "organizer_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."milestones" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."non_project_rd_items" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."progress_reports" ADD COLUMN     "created_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."projects" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT,
ADD COLUMN     "visibility" "app"."BusinessVisibility" NOT NULL DEFAULT 'PRIVATE';

-- AlterTable
ALTER TABLE "app"."reminder_rules" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."risks" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- AlterTable
ALTER TABLE "app"."tasks" ADD COLUMN     "assignee_user_id" TEXT,
ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "updated_by_user_id" TEXT;

-- CreateTable
CREATE TABLE "app"."project_members" (
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "app"."work_task_participants" (
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "work_task_participants_pkey" PRIMARY KEY ("task_id","user_id")
);

-- CreateTable
CREATE TABLE "app"."meeting_participants" (
    "meeting_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("meeting_id","user_id")
);

-- CreateTable
CREATE TABLE "app"."document_user_shares" (
    "document_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "document_user_shares_pkey" PRIMARY KEY ("document_id","user_id")
);

-- CreateTable
CREATE TABLE "app"."document_role_shares" (
    "document_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "document_role_shares_pkey" PRIMARY KEY ("document_id","role_id")
);

-- CreateTable
CREATE TABLE "app"."knowledge_space_members" (
    "space_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "can_edit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "knowledge_space_members_pkey" PRIMARY KEY ("space_id","user_id")
);

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "app"."project_members"("user_id");

-- CreateIndex
CREATE INDEX "work_task_participants_user_id_idx" ON "app"."work_task_participants"("user_id");

-- CreateIndex
CREATE INDEX "meeting_participants_user_id_idx" ON "app"."meeting_participants"("user_id");

-- CreateIndex
CREATE INDEX "document_user_shares_user_id_idx" ON "app"."document_user_shares"("user_id");

-- CreateIndex
CREATE INDEX "document_role_shares_role_id_idx" ON "app"."document_role_shares"("role_id");

-- CreateIndex
CREATE INDEX "knowledge_space_members_user_id_idx" ON "app"."knowledge_space_members"("user_id");

-- CreateIndex
CREATE INDEX "content_documents_owner_user_id_visibility_idx" ON "app"."content_documents"("owner_user_id", "visibility");

-- CreateIndex
CREATE INDEX "meetings_organizer_user_id_idx" ON "app"."meetings"("organizer_user_id");

-- CreateIndex
CREATE INDEX "projects_owner_user_id_idx" ON "app"."projects"("owner_user_id");

-- CreateIndex
CREATE INDEX "tasks_owner_user_id_idx" ON "app"."tasks"("owner_user_id");

-- CreateIndex
CREATE INDEX "tasks_assignee_user_id_idx" ON "app"."tasks"("assignee_user_id");

-- AddForeignKey
ALTER TABLE "app"."projects" ADD CONSTRAINT "projects_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."projects" ADD CONSTRAINT "projects_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."projects" ADD CONSTRAINT "projects_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."milestones" ADD CONSTRAINT "milestones_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."milestones" ADD CONSTRAINT "milestones_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."milestones" ADD CONSTRAINT "milestones_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."tasks" ADD CONSTRAINT "tasks_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."reminder_rules" ADD CONSTRAINT "reminder_rules_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."reminder_rules" ADD CONSTRAINT "reminder_rules_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."knowledge_spaces" ADD CONSTRAINT "knowledge_spaces_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."knowledge_spaces" ADD CONSTRAINT "knowledge_spaces_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."knowledge_spaces" ADD CONSTRAINT "knowledge_spaces_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."content_documents" ADD CONSTRAINT "content_documents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."content_documents" ADD CONSTRAINT "content_documents_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."content_documents" ADD CONSTRAINT "content_documents_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."progress_reports" ADD CONSTRAINT "progress_reports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."application_cases" ADD CONSTRAINT "application_cases_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."application_cases" ADD CONSTRAINT "application_cases_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."application_cases" ADD CONSTRAINT "application_cases_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."risks" ADD CONSTRAINT "risks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."risks" ADD CONSTRAINT "risks_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."risks" ADD CONSTRAINT "risks_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."issues" ADD CONSTRAINT "issues_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."issues" ADD CONSTRAINT "issues_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."issues" ADD CONSTRAINT "issues_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."decisions" ADD CONSTRAINT "decisions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."decisions" ADD CONSTRAINT "decisions_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."meetings" ADD CONSTRAINT "meetings_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."meetings" ADD CONSTRAINT "meetings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."meetings" ADD CONSTRAINT "meetings_organizer_user_id_fkey" FOREIGN KEY ("organizer_user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."meeting_actions" ADD CONSTRAINT "meeting_actions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."meeting_actions" ADD CONSTRAINT "meeting_actions_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."meeting_actions" ADD CONSTRAINT "meeting_actions_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."data_tables" ADD CONSTRAINT "data_tables_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."data_tables" ADD CONSTRAINT "data_tables_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."data_tables" ADD CONSTRAINT "data_tables_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."data_views" ADD CONSTRAINT "data_views_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."non_project_rd_items" ADD CONSTRAINT "non_project_rd_items_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."non_project_rd_items" ADD CONSTRAINT "non_project_rd_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."non_project_rd_items" ADD CONSTRAINT "non_project_rd_items_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."employee_work_items" ADD CONSTRAINT "employee_work_items_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."employee_work_items" ADD CONSTRAINT "employee_work_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."employee_week_plan_items" ADD CONSTRAINT "employee_week_plan_items_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."employee_week_plan_items" ADD CONSTRAINT "employee_week_plan_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."intelligence_topics" ADD CONSTRAINT "intelligence_topics_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."intelligence_topics" ADD CONSTRAINT "intelligence_topics_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."intelligence_topics" ADD CONSTRAINT "intelligence_topics_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."intelligence_sources" ADD CONSTRAINT "intelligence_sources_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."intelligence_sources" ADD CONSTRAINT "intelligence_sources_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."intelligence_sources" ADD CONSTRAINT "intelligence_sources_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."intelligence_collection_plans" ADD CONSTRAINT "intelligence_collection_plans_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."intelligence_collection_plans" ADD CONSTRAINT "intelligence_collection_plans_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."intelligence_collection_plans" ADD CONSTRAINT "intelligence_collection_plans_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."intelligence_items" ADD CONSTRAINT "intelligence_items_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."intelligence_items" ADD CONSTRAINT "intelligence_items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."intelligence_items" ADD CONSTRAINT "intelligence_items_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."intelligence_briefs" ADD CONSTRAINT "intelligence_briefs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."intelligence_briefs" ADD CONSTRAINT "intelligence_briefs_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."intelligence_briefs" ADD CONSTRAINT "intelligence_briefs_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "app"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_task_participants" ADD CONSTRAINT "work_task_participants_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."work_task_participants" ADD CONSTRAINT "work_task_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "app"."meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."document_user_shares" ADD CONSTRAINT "document_user_shares_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "app"."content_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."document_user_shares" ADD CONSTRAINT "document_user_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."document_role_shares" ADD CONSTRAINT "document_role_shares_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "app"."content_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."document_role_shares" ADD CONSTRAINT "document_role_shares_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."knowledge_space_members" ADD CONSTRAINT "knowledge_space_members_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "app"."knowledge_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."knowledge_space_members" ADD CONSTRAINT "knowledge_space_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

