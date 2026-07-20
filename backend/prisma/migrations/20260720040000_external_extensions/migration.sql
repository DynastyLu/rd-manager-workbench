DO $$ BEGIN
  CREATE TYPE app."ReminderChannel" AS ENUM ('IN_APP', 'DESKTOP', 'SMS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE app."ExtensionKind" AS ENUM ('SMS', 'AI', 'CALENDAR', 'CLOUD_DRIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE app."ExtensionRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE app."SmsDeliveryStatus" AS ENUM ('PENDING', 'RUNNING', 'SENT', 'FAILED', 'PREVIEW', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE app."ExternalSyncDirection" AS ENUM ('PULL_ONLY', 'PUSH_ONLY', 'BIDIRECTIONAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE app."ExternalConflictState" AS ENUM ('NONE', 'CONFLICT', 'KEEP_LOCAL', 'KEEP_REMOTE', 'CREATE_COPY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE app.reminder_rules
  ADD COLUMN IF NOT EXISTS channels app."ReminderChannel"[] NOT NULL
    DEFAULT ARRAY['IN_APP'::app."ReminderChannel"],
  ADD COLUMN IF NOT EXISTS important BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS app.extension_profiles (
  id TEXT NOT NULL,
  kind app."ExtensionKind" NOT NULL,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  public_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  credential_ref TEXT,
  permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  archived_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT extension_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT extension_profiles_provider_check CHECK (btrim(provider) <> ''),
  CONSTRAINT extension_profiles_name_check CHECK (btrim(name) <> ''),
  CONSTRAINT extension_profiles_credential_ref_check CHECK (
    credential_ref IS NULL OR credential_ref ~ '^credential:[A-Za-z0-9._:-]{1,180}$'
  )
);

CREATE TABLE IF NOT EXISTS app.extension_runs (
  id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  status app."ExtensionRunStatus" NOT NULL DEFAULT 'PENDING',
  input_sha256 TEXT NOT NULL,
  input_bytes INTEGER NOT NULL,
  output_sha256 TEXT,
  output_bytes INTEGER,
  confirmation_hash TEXT,
  completion_token_hash TEXT,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ(6),
  finished_at TIMESTAMPTZ(6),
  CONSTRAINT extension_runs_pkey PRIMARY KEY (id),
  CONSTRAINT extension_runs_profile_id_fkey FOREIGN KEY (profile_id)
    REFERENCES app.extension_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT extension_runs_operation_check CHECK (operation ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  CONSTRAINT extension_runs_hashes_check CHECK (
    input_sha256 ~ '^[0-9a-f]{64}$'
    AND (output_sha256 IS NULL OR output_sha256 ~ '^[0-9a-f]{64}$')
    AND (confirmation_hash IS NULL OR confirmation_hash ~ '^[0-9a-f]{64}$')
    AND (completion_token_hash IS NULL OR completion_token_hash ~ '^[0-9a-f]{64}$')
    AND input_bytes >= 0
    AND (output_bytes IS NULL OR output_bytes >= 0)
  ),
  CONSTRAINT extension_runs_body_free_metadata_check CHECK (
    jsonb_typeof(metadata) = 'object'
    AND NOT (metadata ?| ARRAY[
      'body', 'content', 'input', 'output', 'payload', 'prompt', 'secret',
      'token', 'password', 'phone', 'phoneNumber', 'text'
    ])
  ),
  CONSTRAINT extension_runs_status_time_check CHECK (
    (status = 'PENDING' AND started_at IS NULL AND finished_at IS NULL)
    OR (status = 'RUNNING' AND started_at IS NOT NULL AND finished_at IS NULL)
    OR (status IN ('SUCCEEDED', 'FAILED', 'REJECTED') AND finished_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS app.sms_recipients (
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  masked_phone TEXT NOT NULL,
  credential_ref TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  archived_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT sms_recipients_pkey PRIMARY KEY (id),
  CONSTRAINT sms_recipients_credential_ref_key UNIQUE (credential_ref),
  CONSTRAINT sms_recipients_mask_check CHECK (
    masked_phone ~ '^\+?[0-9]{0,4}\*{4,12}[0-9]{2,4}$'
    AND masked_phone !~ '[0-9]{7,}'
  ),
  CONSTRAINT sms_recipients_credential_ref_check CHECK (
    credential_ref ~ '^credential:[A-Za-z0-9._:-]{1,180}$'
  )
);

CREATE TABLE IF NOT EXISTS app.sms_deliveries (
  id TEXT NOT NULL,
  reminder_rule_id TEXT,
  notification_id TEXT,
  recipient_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  extension_run_id TEXT,
  template_key TEXT NOT NULL,
  status app."SmsDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ(6),
  provider_message_id TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ(6),
  CONSTRAINT sms_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT sms_deliveries_extension_run_id_key UNIQUE (extension_run_id),
  CONSTRAINT sms_deliveries_reminder_rule_id_recipient_id_template_key_key
    UNIQUE (reminder_rule_id, recipient_id, template_key),
  CONSTRAINT sms_deliveries_reminder_rule_id_fkey FOREIGN KEY (reminder_rule_id)
    REFERENCES app.reminder_rules(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sms_deliveries_notification_id_fkey FOREIGN KEY (notification_id)
    REFERENCES app.notifications(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sms_deliveries_recipient_id_fkey FOREIGN KEY (recipient_id)
    REFERENCES app.sms_recipients(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sms_deliveries_profile_id_fkey FOREIGN KEY (profile_id)
    REFERENCES app.extension_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sms_deliveries_extension_run_id_fkey FOREIGN KEY (extension_run_id)
    REFERENCES app.extension_runs(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT sms_deliveries_attempt_count_check CHECK (attempt_count BETWEEN 0 AND 3),
  CONSTRAINT sms_deliveries_sent_at_check CHECK (
    (status = 'SENT' AND sent_at IS NOT NULL)
    OR (status <> 'SENT' AND sent_at IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS app.external_object_links (
  id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  local_type TEXT NOT NULL,
  local_id TEXT NOT NULL,
  remote_id TEXT NOT NULL,
  remote_version TEXT,
  sync_direction app."ExternalSyncDirection" NOT NULL DEFAULT 'PULL_ONLY',
  last_synced_at TIMESTAMPTZ(6),
  sync_hash TEXT,
  conflict_state app."ExternalConflictState" NOT NULL DEFAULT 'NONE',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT external_object_links_pkey PRIMARY KEY (id),
  CONSTRAINT external_object_links_profile_id_fkey FOREIGN KEY (profile_id)
    REFERENCES app.extension_profiles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT external_object_links_sync_hash_check CHECK (
    sync_hash IS NULL OR sync_hash ~ '^[0-9a-f]{64}$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS extension_profiles_active_name_key
  ON app.extension_profiles(kind, lower(name)) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS extension_profiles_kind_archived_at_enabled_idx
  ON app.extension_profiles(kind, archived_at, enabled);
CREATE INDEX IF NOT EXISTS extension_profiles_provider_archived_at_idx
  ON app.extension_profiles(provider, archived_at);
CREATE INDEX IF NOT EXISTS extension_runs_profile_id_created_at_idx
  ON app.extension_runs(profile_id, created_at);
CREATE INDEX IF NOT EXISTS extension_runs_status_created_at_idx
  ON app.extension_runs(status, created_at);
CREATE INDEX IF NOT EXISTS sms_recipients_archived_at_enabled_idx
  ON app.sms_recipients(archived_at, enabled);
CREATE INDEX IF NOT EXISTS sms_deliveries_status_next_attempt_at_idx
  ON app.sms_deliveries(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS sms_deliveries_profile_id_created_at_idx
  ON app.sms_deliveries(profile_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS external_object_links_profile_id_local_type_local_id_key
  ON app.external_object_links(profile_id, local_type, local_id);
CREATE UNIQUE INDEX IF NOT EXISTS external_object_links_profile_id_remote_id_key
  ON app.external_object_links(profile_id, remote_id);
CREATE INDEX IF NOT EXISTS external_object_links_profile_id_conflict_state_idx
  ON app.external_object_links(profile_id, conflict_state);
