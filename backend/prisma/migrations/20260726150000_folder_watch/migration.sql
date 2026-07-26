-- Create folder_watches table
CREATE TABLE app.folder_watches (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  label         TEXT NOT NULL,
  folder_path   TEXT NOT NULL,
  space_id      TEXT NOT NULL REFERENCES app.knowledge_spaces(id) ON DELETE CASCADE,
  "recursive"   BOOLEAN NOT NULL DEFAULT TRUE,
  status        TEXT NOT NULL DEFAULT 'ACTIVE',
  error_message TEXT,
  last_sync_at  TIMESTAMPTZ(6),
  created_at    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Create folder_files table
CREATE TABLE app.folder_files (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  watch_id    TEXT NOT NULL REFERENCES app.folder_watches(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES app.content_documents(id) ON DELETE CASCADE,
  file_hash   TEXT,
  status      TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  UNIQUE (watch_id, file_path)
);
