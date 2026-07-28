ALTER TABLE "app"."progress_reports"
ALTER COLUMN "completion_percent" TYPE DECIMAL(5, 2)
USING "completion_percent"::DECIMAL(5, 2),
ADD COLUMN "completed_results" TEXT;
