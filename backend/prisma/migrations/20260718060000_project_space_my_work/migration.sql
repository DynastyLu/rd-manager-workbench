CREATE TABLE "app"."task_reminders" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "remind_at" TIMESTAMPTZ(6) NOT NULL,
  "dismissed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "task_reminders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."task_laters" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "deferred_until" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "task_laters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_reminders_task_id_key" ON "app"."task_reminders"("task_id");
CREATE INDEX "task_reminders_remind_at_dismissed_at_idx" ON "app"."task_reminders"("remind_at", "dismissed_at");
CREATE UNIQUE INDEX "task_laters_task_id_key" ON "app"."task_laters"("task_id");
CREATE INDEX "task_laters_deferred_until_idx" ON "app"."task_laters"("deferred_until");

ALTER TABLE "app"."task_reminders" ADD CONSTRAINT "task_reminders_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."task_laters" ADD CONSTRAINT "task_laters_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "app"."tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
