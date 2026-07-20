ALTER TABLE "app"."file_assets"
  ADD COLUMN IF NOT EXISTS "partner_id" TEXT;

CREATE INDEX IF NOT EXISTS "file_assets_partner_id_status_updated_at_idx"
  ON "app"."file_assets"("partner_id", "status", "updated_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'file_assets_partner_id_fkey'
      AND conrelid = 'app.file_assets'::regclass
  ) THEN
    ALTER TABLE "app"."file_assets"
      ADD CONSTRAINT "file_assets_partner_id_fkey"
      FOREIGN KEY ("partner_id") REFERENCES "app"."partners"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
