CREATE TYPE app."BackupKind" AS ENUM ('MANUAL', 'SCHEDULED', 'PRE_RESTORE');
CREATE TYPE app."BackupStatus" AS ENUM (
  'CREATING', 'CREATED', 'VERIFIED', 'RESTORING', 'RESTORED', 'FAILED'
);
CREATE TYPE app."RestorePreflightStatus" AS ENUM ('READY', 'INVALID', 'EXPIRED', 'CONSUMED');
CREATE TYPE app."AuditOutcome" AS ENUM ('SUCCEEDED', 'FAILED');

CREATE TABLE app.governance_settings (
  id TEXT NOT NULL,
  auto_backup_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_backup_time_local TEXT NOT NULL DEFAULT '02:00',
  retention_days INTEGER NOT NULL DEFAULT 30,
  last_auto_backup_local_date DATE,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT governance_settings_pkey PRIMARY KEY (id),
  CONSTRAINT governance_settings_singleton_check CHECK (id = 'singleton'),
  CONSTRAINT governance_settings_auto_backup_time_local_check
    CHECK (auto_backup_time_local ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT governance_settings_retention_days_check CHECK (retention_days BETWEEN 1 AND 365)
);

CREATE TABLE app.backup_records (
  id TEXT NOT NULL,
  kind app."BackupKind" NOT NULL,
  status app."BackupStatus" NOT NULL DEFAULT 'CREATING',
  relative_directory TEXT NOT NULL,
  scheduled_local_date DATE,
  schema_version TEXT NOT NULL,
  manifest_sha256 TEXT,
  database_sha256 TEXT,
  file_count INTEGER NOT NULL DEFAULT 0,
  byte_size BIGINT NOT NULL DEFAULT 0,
  failure_code TEXT,
  failure_message TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMPTZ(6),
  restored_at TIMESTAMPTZ(6),
  CONSTRAINT backup_records_pkey PRIMARY KEY (id),
  CONSTRAINT backup_records_file_count_check CHECK (file_count >= 0),
  CONSTRAINT backup_records_byte_size_check CHECK (byte_size >= 0),
  CONSTRAINT backup_records_scheduled_date_check CHECK (
    (kind = 'SCHEDULED' AND scheduled_local_date IS NOT NULL)
    OR (kind <> 'SCHEDULED' AND scheduled_local_date IS NULL)
  )
);

CREATE TABLE app.restore_preflights (
  id TEXT NOT NULL,
  backup_id TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  status app."RestorePreflightStatus" NOT NULL DEFAULT 'READY',
  warnings JSONB NOT NULL,
  summary JSONB NOT NULL,
  confirmation_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT restore_preflights_pkey PRIMARY KEY (id),
  CONSTRAINT restore_preflights_backup_id_fkey
    FOREIGN KEY (backup_id) REFERENCES app.backup_records(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE app.audit_logs (
  id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  outcome app."AuditOutcome" NOT NULL,
  changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata JSONB NOT NULL,
  trace_id TEXT,
  occurred_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX backup_records_status_created_at_idx
  ON app.backup_records(status, created_at);
CREATE UNIQUE INDEX backup_records_scheduled_local_date_key
  ON app.backup_records(scheduled_local_date)
  WHERE kind = 'SCHEDULED' AND scheduled_local_date IS NOT NULL;
CREATE INDEX restore_preflights_backup_id_status_idx
  ON app.restore_preflights(backup_id, status);
CREATE INDEX restore_preflights_status_expires_at_idx
  ON app.restore_preflights(status, expires_at);
CREATE INDEX audit_logs_occurred_at_idx
  ON app.audit_logs(occurred_at);
CREATE INDEX audit_logs_entity_type_entity_id_occurred_at_idx
  ON app.audit_logs(entity_type, entity_id, occurred_at);
CREATE INDEX audit_logs_action_outcome_occurred_at_idx
  ON app.audit_logs(action, outcome, occurred_at);

CREATE OR REPLACE FUNCTION app.reject_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_logs_immutable_update
BEFORE UPDATE ON app.audit_logs
FOR EACH ROW EXECUTE FUNCTION app.reject_audit_log_mutation();

CREATE TRIGGER audit_logs_immutable_delete
BEFORE DELETE ON app.audit_logs
FOR EACH ROW EXECUTE FUNCTION app.reject_audit_log_mutation();
