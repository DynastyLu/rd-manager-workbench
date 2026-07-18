CREATE TYPE "app"."RiskLikelihood" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "app"."RiskImpact" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "app"."RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "app"."RiskStatus" AS ENUM ('OPEN', 'MITIGATING', 'CLOSED');
CREATE TYPE "app"."IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TYPE "app"."DecisionStatus" AS ENUM ('DRAFT', 'DECIDED', 'SUPERSEDED');
CREATE TYPE "app"."AgreementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED');
CREATE TYPE "app"."CommunicationType" AS ENUM ('EMAIL', 'PHONE', 'MEETING', 'CHAT', 'VISIT', 'OTHER');
CREATE TYPE "app"."MeetingStatus" AS ENUM ('PLANNED', 'HELD', 'CANCELLED');
CREATE TYPE "app"."MeetingActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

CREATE TABLE "app"."risks" (
  "id" TEXT NOT NULL, "project_id" TEXT, "milestone_id" TEXT, "task_id" TEXT,
  "title" TEXT NOT NULL, "description" TEXT, "likelihood" "app"."RiskLikelihood" NOT NULL,
  "impact" "app"."RiskImpact" NOT NULL, "level" "app"."RiskLevel" NOT NULL,
  "mitigation" TEXT, "owner_name" TEXT, "status" "app"."RiskStatus" NOT NULL DEFAULT 'OPEN',
  "closed_at" TIMESTAMPTZ(6), "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "risks_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "app"."issues" (
  "id" TEXT NOT NULL, "project_id" TEXT, "milestone_id" TEXT, "task_id" TEXT,
  "title" TEXT NOT NULL, "description" TEXT, "impact_object" TEXT, "proposed_resolution" TEXT,
  "owner_name" TEXT, "due_at" TIMESTAMPTZ(6), "verification_result" TEXT,
  "status" "app"."IssueStatus" NOT NULL DEFAULT 'OPEN', "closed_at" TIMESTAMPTZ(6),
  "archived_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "app"."meetings" (
  "id" TEXT NOT NULL, "project_id" TEXT, "title" TEXT NOT NULL, "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
  "held_at" TIMESTAMPTZ(6), "status" "app"."MeetingStatus" NOT NULL DEFAULT 'PLANNED', "agenda" TEXT,
  "minutes" TEXT, "participant_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "app"."decisions" (
  "id" TEXT NOT NULL, "project_id" TEXT, "milestone_id" TEXT, "task_id" TEXT, "meeting_id" TEXT,
  "title" TEXT NOT NULL, "background" TEXT, "alternatives" JSONB NOT NULL, "basis" TEXT, "conclusion" TEXT,
  "participant_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "app"."DecisionStatus" NOT NULL DEFAULT 'DRAFT', "decided_at" TIMESTAMPTZ(6), "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "app"."partners" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "short_name" TEXT, "category" TEXT, "address" TEXT, "notes" TEXT,
  "archived_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "app"."partner_contacts" (
  "id" TEXT NOT NULL, "partner_id" TEXT NOT NULL, "name" TEXT NOT NULL, "title" TEXT, "phone" TEXT,
  "email" TEXT, "notes" TEXT, "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "partner_contacts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "app"."partner_agreements" (
  "id" TEXT NOT NULL, "partner_id" TEXT NOT NULL, "title" TEXT NOT NULL, "agreement_no" TEXT,
  "status" "app"."AgreementStatus" NOT NULL DEFAULT 'DRAFT', "start_at" TIMESTAMPTZ(6), "end_at" TIMESTAMPTZ(6),
  "notes" TEXT, "archived_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "partner_agreements_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "app"."communication_records" (
  "id" TEXT NOT NULL, "partner_id" TEXT NOT NULL, "project_id" TEXT, "contact_id" TEXT,
  "type" "app"."CommunicationType" NOT NULL, "occurred_at" TIMESTAMPTZ(6) NOT NULL, "subject" TEXT NOT NULL,
  "summary" TEXT, "promises" TEXT, "owner_name" TEXT, "next_follow_up_at" TIMESTAMPTZ(6), "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "communication_records_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "app"."meeting_agenda_items" (
  "id" TEXT NOT NULL, "meeting_id" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT,
  "sequence" INTEGER NOT NULL DEFAULT 0, "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "meeting_agenda_items_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "app"."meeting_actions" (
  "id" TEXT NOT NULL, "meeting_id" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT,
  "owner_name" TEXT, "due_at" TIMESTAMPTZ(6), "status" "app"."MeetingActionStatus" NOT NULL DEFAULT 'OPEN',
  "task_id" TEXT, "archived_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "meeting_actions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "meeting_actions_task_id_key" ON "app"."meeting_actions"("task_id");
CREATE INDEX "risks_project_id_archived_at_status_idx" ON "app"."risks"("project_id", "archived_at", "status");
CREATE INDEX "risks_task_id_idx" ON "app"."risks"("task_id");
CREATE INDEX "issues_project_id_archived_at_status_idx" ON "app"."issues"("project_id", "archived_at", "status");
CREATE INDEX "issues_due_at_idx" ON "app"."issues"("due_at");
CREATE INDEX "decisions_project_id_archived_at_status_idx" ON "app"."decisions"("project_id", "archived_at", "status");
CREATE INDEX "decisions_meeting_id_idx" ON "app"."decisions"("meeting_id");
CREATE INDEX "partners_archived_at_name_idx" ON "app"."partners"("archived_at", "name");
CREATE INDEX "partner_contacts_partner_id_archived_at_idx" ON "app"."partner_contacts"("partner_id", "archived_at");
CREATE INDEX "partner_agreements_partner_id_archived_at_status_idx" ON "app"."partner_agreements"("partner_id", "archived_at", "status");
CREATE INDEX "communication_records_partner_id_archived_at_occurred_at_idx" ON "app"."communication_records"("partner_id", "archived_at", "occurred_at");
CREATE INDEX "communication_records_next_follow_up_at_idx" ON "app"."communication_records"("next_follow_up_at");
CREATE INDEX "meetings_project_id_archived_at_status_idx" ON "app"."meetings"("project_id", "archived_at", "status");
CREATE INDEX "meetings_scheduled_at_idx" ON "app"."meetings"("scheduled_at");
CREATE INDEX "meeting_agenda_items_meeting_id_archived_at_sequence_idx" ON "app"."meeting_agenda_items"("meeting_id", "archived_at", "sequence");
CREATE INDEX "meeting_actions_meeting_id_archived_at_due_at_idx" ON "app"."meeting_actions"("meeting_id", "archived_at", "due_at");
ALTER TABLE "app"."risks" ADD CONSTRAINT "risks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."risks" ADD CONSTRAINT "risks_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "app"."milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."risks" ADD CONSTRAINT "risks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."issues" ADD CONSTRAINT "issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."issues" ADD CONSTRAINT "issues_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "app"."milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."issues" ADD CONSTRAINT "issues_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."meetings" ADD CONSTRAINT "meetings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."decisions" ADD CONSTRAINT "decisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."decisions" ADD CONSTRAINT "decisions_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "app"."milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."decisions" ADD CONSTRAINT "decisions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."decisions" ADD CONSTRAINT "decisions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "app"."meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."partner_contacts" ADD CONSTRAINT "partner_contacts_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "app"."partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."partner_agreements" ADD CONSTRAINT "partner_agreements_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "app"."partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."communication_records" ADD CONSTRAINT "communication_records_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "app"."partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."communication_records" ADD CONSTRAINT "communication_records_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."communication_records" ADD CONSTRAINT "communication_records_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "app"."partner_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app"."meeting_agenda_items" ADD CONSTRAINT "meeting_agenda_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "app"."meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app"."meeting_actions" ADD CONSTRAINT "meeting_actions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "app"."meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
