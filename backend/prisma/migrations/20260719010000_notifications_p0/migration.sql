CREATE TYPE "app"."ReminderSourceType" AS ENUM ('TASK', 'CALENDAR_EVENT', 'MEETING');
CREATE TYPE "app"."NotificationStatus" AS ENUM ('UNREAD', 'READ', 'DISMISSED', 'SNOOZED');

CREATE TABLE "app"."reminder_rules" (
  "id" TEXT NOT NULL,
  "source_type" "app"."ReminderSourceType" NOT NULL,
  "source_id" TEXT NOT NULL,
  "remind_at" TIMESTAMPTZ(6) NOT NULL,
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reminder_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."notifications" (
  "id" TEXT NOT NULL,
  "reminder_rule_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "app"."NotificationStatus" NOT NULL DEFAULT 'UNREAD',
  "source_type" "app"."ReminderSourceType" NOT NULL,
  "source_id" TEXT NOT NULL,
  "source_path" TEXT NOT NULL,
  "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
  "triggered_at" TIMESTAMPTZ(6) NOT NULL,
  "read_at" TIMESTAMPTZ(6),
  "dismissed_at" TIMESTAMPTZ(6),
  "snoozed_until" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notifications_read_state_check" CHECK ("status" <> 'READ' OR "read_at" IS NOT NULL),
  CONSTRAINT "notifications_dismissed_state_check" CHECK ("status" <> 'DISMISSED' OR "dismissed_at" IS NOT NULL),
  CONSTRAINT "notifications_snoozed_state_check" CHECK ("status" <> 'SNOOZED' OR "snoozed_until" IS NOT NULL)
);

CREATE UNIQUE INDEX "reminder_rules_source_type_source_id_remind_at_key"
  ON "app"."reminder_rules"("source_type", "source_id", "remind_at");
CREATE INDEX "reminder_rules_archived_at_remind_at_idx"
  ON "app"."reminder_rules"("archived_at", "remind_at");
CREATE INDEX "reminder_rules_active_due_idx"
  ON "app"."reminder_rules"("remind_at")
  WHERE "archived_at" IS NULL;

CREATE UNIQUE INDEX "notifications_reminder_rule_id_key"
  ON "app"."notifications"("reminder_rule_id");
CREATE UNIQUE INDEX "notifications_source_type_source_id_scheduled_for_key"
  ON "app"."notifications"("source_type", "source_id", "scheduled_for");
CREATE INDEX "notifications_status_triggered_at_idx"
  ON "app"."notifications"("status", "triggered_at");
CREATE INDEX "notifications_status_snoozed_until_idx"
  ON "app"."notifications"("status", "snoozed_until");
CREATE INDEX "notifications_due_snooze_idx"
  ON "app"."notifications"("snoozed_until")
  WHERE "status" = 'SNOOZED';

ALTER TABLE "app"."notifications"
  ADD CONSTRAINT "notifications_reminder_rule_id_fkey"
  FOREIGN KEY ("reminder_rule_id") REFERENCES "app"."reminder_rules"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
