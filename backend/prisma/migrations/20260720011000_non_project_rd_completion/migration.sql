ALTER TABLE "app"."non_project_rd_items"
  ADD COLUMN IF NOT EXISTS "outcome_waived_reason" TEXT;
