CREATE TABLE "app"."external_sync_sessions" (
  "id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "status" TEXT NOT NULL,
  "preflight_run_id" TEXT,
  "commit_run_id" TEXT,
  "preflight" JSONB,
  "preflight_hash" TEXT,
  "resolutions" JSONB,
  "expires_at" TIMESTAMPTZ(6),
  "error_code" TEXT,
  "committed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "external_sync_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_sync_sessions_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "app"."extension_profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "external_sync_sessions_preflight_run_id_key"
  ON "app"."external_sync_sessions"("preflight_run_id");
CREATE UNIQUE INDEX "external_sync_sessions_commit_run_id_key"
  ON "app"."external_sync_sessions"("commit_run_id");
CREATE INDEX "external_sync_sessions_profile_id_status_created_at_idx"
  ON "app"."external_sync_sessions"("profile_id", "status", "created_at");
CREATE INDEX "external_sync_sessions_expires_at_idx"
  ON "app"."external_sync_sessions"("expires_at");
