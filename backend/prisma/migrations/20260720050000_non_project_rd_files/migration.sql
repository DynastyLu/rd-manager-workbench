ALTER TABLE app.file_assets
  ADD COLUMN IF NOT EXISTS non_project_rd_item_id TEXT,
  ADD COLUMN IF NOT EXISTS non_project_rd_outcome_id TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'file_assets_non_project_rd_item_id_fkey') THEN
    ALTER TABLE app.file_assets ADD CONSTRAINT file_assets_non_project_rd_item_id_fkey
      FOREIGN KEY (non_project_rd_item_id) REFERENCES app.non_project_rd_items(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'file_assets_non_project_rd_outcome_id_fkey') THEN
    ALTER TABLE app.file_assets ADD CONSTRAINT file_assets_non_project_rd_outcome_id_fkey
      FOREIGN KEY (non_project_rd_outcome_id) REFERENCES app.non_project_rd_outcomes(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS file_assets_non_project_rd_item_id_status_updated_at_idx
  ON app.file_assets(non_project_rd_item_id, status, updated_at);
CREATE INDEX IF NOT EXISTS file_assets_non_project_rd_outcome_id_status_updated_at_idx
  ON app.file_assets(non_project_rd_outcome_id, status, updated_at);
