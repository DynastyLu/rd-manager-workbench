CREATE TYPE "app"."CalendarEventType" AS ENUM ('EVENT', 'INTERVIEW', 'REVIEW', 'OTHER');

CREATE TABLE "app"."calendar_events" (
  "id" TEXT NOT NULL,
  "project_id" TEXT,
  "title" TEXT NOT NULL,
  "start_at" TIMESTAMPTZ(6) NOT NULL,
  "end_at" TIMESTAMPTZ(6) NOT NULL,
  "all_day" BOOLEAN NOT NULL DEFAULT false,
  "location" TEXT,
  "link" TEXT,
  "notes" TEXT,
  "type" "app"."CalendarEventType" NOT NULL DEFAULT 'EVENT',
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calendar_events_time_order_check" CHECK ("end_at" > "start_at")
);

CREATE INDEX "calendar_events_start_at_end_at_idx"
  ON "app"."calendar_events"("start_at", "end_at");
CREATE INDEX "calendar_events_project_id_archived_at_start_at_idx"
  ON "app"."calendar_events"("project_id", "archived_at", "start_at");
CREATE INDEX "calendar_events_active_range_idx"
  ON "app"."calendar_events"("start_at", "end_at")
  WHERE "archived_at" IS NULL;

ALTER TABLE "app"."calendar_events"
  ADD CONSTRAINT "calendar_events_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
