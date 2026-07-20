DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'app' AND t.typname = 'IntelligenceScheduleFrequency'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'app' AND t.typname = 'IntelligenceCollectionFrequency'
  ) THEN
    ALTER TYPE app."IntelligenceScheduleFrequency" RENAME TO "IntelligenceCollectionFrequency";
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE app."IntelligenceSourceKind" AS ENUM ('WEBSITE', 'RSS', 'NEWSLETTER', 'DATABASE', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE app."IntelligenceSourceKind" ADD VALUE IF NOT EXISTS 'DATABASE';
  ALTER TYPE app."IntelligenceSourceKind" ADD VALUE IF NOT EXISTS 'MANUAL';
END $$;
DO $$ BEGIN
  CREATE TYPE app."IntelligenceCollectionFrequency" AS ENUM ('MANUAL', 'DAILY', 'WEEKLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE app."IntelligenceRunTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'CONNECTOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE app."IntelligenceRunTrigger" ADD VALUE IF NOT EXISTS 'CONNECTOR';
END $$;
DO $$ BEGIN
  CREATE TYPE app."IntelligenceRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE app."IntelligenceRunStatus" ADD VALUE IF NOT EXISTS 'RUNNING' BEFORE 'SUCCEEDED';
END $$;
DO $$ BEGIN
  CREATE TYPE app."IntelligencePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE app."IntelligenceItemStatus" AS ENUM ('NEW', 'REVIEWING', 'ACTIONED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE app."IntelligenceConversionKind" AS ENUM ('TASK', 'RISK', 'MEETING', 'KNOWLEDGE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE app."IntelligenceBriefKind" AS ENUM ('DAILY', 'WEEKLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  IF to_regclass('app.intelligence_schedules') IS NOT NULL
     AND to_regclass('app.intelligence_collection_plans') IS NULL THEN
    ALTER TABLE app.intelligence_schedules RENAME TO intelligence_collection_plans;
  END IF;
  IF to_regclass('app.intelligence_source_occurrences') IS NOT NULL
     AND to_regclass('app.intelligence_occurrences') IS NULL THEN
    ALTER TABLE app.intelligence_source_occurrences RENAME TO intelligence_occurrences;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS app.intelligence_topics (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  archived_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT intelligence_topics_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS app.intelligence_topic_projects (
  topic_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT intelligence_topic_projects_pkey PRIMARY KEY (topic_id, project_id),
  CONSTRAINT intelligence_topic_projects_topic_id_fkey FOREIGN KEY (topic_id)
    REFERENCES app.intelligence_topics(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT intelligence_topic_projects_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES app.projects(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS app.intelligence_sources (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind app."IntelligenceSourceKind" NOT NULL DEFAULT 'WEBSITE',
  url TEXT,
  credibility INTEGER NOT NULL DEFAULT 3,
  notes TEXT,
  archived_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT intelligence_sources_pkey PRIMARY KEY (id),
  CONSTRAINT intelligence_sources_credibility_check CHECK (credibility BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS app.intelligence_collection_plans (
  id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  name TEXT NOT NULL,
  frequency app."IntelligenceCollectionFrequency" NOT NULL DEFAULT 'MANUAL',
  run_at_local_time TEXT,
  weekday INTEGER,
  enabled BOOLEAN NOT NULL DEFAULT true,
  connector_profile_id TEXT,
  last_run_at TIMESTAMPTZ(6),
  next_run_at TIMESTAMPTZ(6),
  archived_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT intelligence_collection_plans_pkey PRIMARY KEY (id),
  CONSTRAINT intelligence_collection_plans_source_id_fkey FOREIGN KEY (source_id)
    REFERENCES app.intelligence_sources(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT intelligence_collection_plans_frequency_check CHECK (
    (frequency = 'MANUAL' AND run_at_local_time IS NULL AND weekday IS NULL)
    OR (frequency = 'DAILY' AND run_at_local_time IS NOT NULL AND weekday IS NULL)
    OR (frequency = 'WEEKLY' AND run_at_local_time IS NOT NULL AND weekday BETWEEN 1 AND 7)
  ),
  CONSTRAINT intelligence_collection_plans_local_time_check CHECK (
    run_at_local_time IS NULL OR run_at_local_time ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
  )
);

CREATE TABLE IF NOT EXISTS app.intelligence_runs (
  id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  trigger app."IntelligenceRunTrigger" NOT NULL DEFAULT 'MANUAL',
  status app."IntelligenceRunStatus" NOT NULL,
  started_at TIMESTAMPTZ(6) NOT NULL,
  finished_at TIMESTAMPTZ(6),
  item_count INTEGER NOT NULL DEFAULT 0,
  input_summary TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT intelligence_runs_pkey PRIMARY KEY (id),
  CONSTRAINT intelligence_runs_plan_id_fkey FOREIGN KEY (plan_id)
    REFERENCES app.intelligence_collection_plans(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT intelligence_runs_item_count_check CHECK (item_count >= 0),
  CONSTRAINT intelligence_runs_finished_at_check CHECK (
    finished_at IS NULL OR finished_at >= started_at
  ),
  CONSTRAINT intelligence_runs_error_check CHECK (
    (status = 'FAILED' AND error_message IS NOT NULL AND btrim(error_message) <> '')
    OR (status <> 'FAILED' AND error_message IS NULL AND error_code IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS app.intelligence_items (
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  impact TEXT,
  recommendation TEXT,
  canonical_url TEXT,
  published_at TIMESTAMPTZ(6),
  priority app."IntelligencePriority" NOT NULL DEFAULT 'MEDIUM',
  status app."IntelligenceItemStatus" NOT NULL DEFAULT 'NEW',
  content_hash TEXT NOT NULL,
  archived_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT intelligence_items_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS app.intelligence_occurrences (
  id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_url TEXT,
  captured_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  raw_title TEXT,
  raw_summary TEXT,
  CONSTRAINT intelligence_occurrences_pkey PRIMARY KEY (id),
  CONSTRAINT intelligence_occurrences_item_id_fkey FOREIGN KEY (item_id)
    REFERENCES app.intelligence_items(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT intelligence_occurrences_source_id_fkey FOREIGN KEY (source_id)
    REFERENCES app.intelligence_sources(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS app.intelligence_item_topics (
  item_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT intelligence_item_topics_pkey PRIMARY KEY (item_id, topic_id),
  CONSTRAINT intelligence_item_topics_item_id_fkey FOREIGN KEY (item_id)
    REFERENCES app.intelligence_items(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT intelligence_item_topics_topic_id_fkey FOREIGN KEY (topic_id)
    REFERENCES app.intelligence_topics(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS app.intelligence_item_projects (
  item_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT intelligence_item_projects_pkey PRIMARY KEY (item_id, project_id),
  CONSTRAINT intelligence_item_projects_item_id_fkey FOREIGN KEY (item_id)
    REFERENCES app.intelligence_items(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT intelligence_item_projects_project_id_fkey FOREIGN KEY (project_id)
    REFERENCES app.projects(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS app.intelligence_conversions (
  id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  kind app."IntelligenceConversionKind" NOT NULL,
  target_id TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT intelligence_conversions_pkey PRIMARY KEY (id),
  CONSTRAINT intelligence_conversions_item_id_fkey FOREIGN KEY (item_id)
    REFERENCES app.intelligence_items(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS app.intelligence_briefs (
  id TEXT NOT NULL,
  kind app."IntelligenceBriefKind" NOT NULL,
  brief_date DATE NOT NULL,
  title TEXT NOT NULL,
  introduction TEXT,
  archived_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT intelligence_briefs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS app.intelligence_brief_items (
  id TEXT NOT NULL,
  brief_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT intelligence_brief_items_pkey PRIMARY KEY (id),
  CONSTRAINT intelligence_brief_items_brief_id_fkey FOREIGN KEY (brief_id)
    REFERENCES app.intelligence_briefs(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT intelligence_brief_items_item_id_fkey FOREIGN KEY (item_id)
    REFERENCES app.intelligence_items(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_sources' AND column_name = 'base_url')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_sources' AND column_name = 'url') THEN
    ALTER TABLE app.intelligence_sources RENAME COLUMN base_url TO url;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_collection_plans' AND column_name = 'is_enabled')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_collection_plans' AND column_name = 'enabled') THEN
    ALTER TABLE app.intelligence_collection_plans RENAME COLUMN is_enabled TO enabled;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_runs' AND column_name = 'schedule_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_runs' AND column_name = 'plan_id') THEN
    ALTER TABLE app.intelligence_runs RENAME COLUMN schedule_id TO plan_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_items' AND column_name = 'dedupe_key')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_items' AND column_name = 'content_hash') THEN
    ALTER TABLE app.intelligence_items RENAME COLUMN dedupe_key TO content_hash;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_items' AND column_name = 'impact_assessment')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_items' AND column_name = 'impact') THEN
    ALTER TABLE app.intelligence_items RENAME COLUMN impact_assessment TO impact;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_items' AND column_name = 'recommended_action')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_items' AND column_name = 'recommendation') THEN
    ALTER TABLE app.intelligence_items RENAME COLUMN recommended_action TO recommendation;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_occurrences' AND column_name = 'intelligence_item_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_occurrences' AND column_name = 'item_id') THEN
    ALTER TABLE app.intelligence_occurrences RENAME COLUMN intelligence_item_id TO item_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_occurrences' AND column_name = 'source_title')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_occurrences' AND column_name = 'raw_title') THEN
    ALTER TABLE app.intelligence_occurrences RENAME COLUMN source_title TO raw_title;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_item_topics' AND column_name = 'intelligence_item_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_item_topics' AND column_name = 'item_id') THEN
    ALTER TABLE app.intelligence_item_topics RENAME COLUMN intelligence_item_id TO item_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_item_projects' AND column_name = 'intelligence_item_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_item_projects' AND column_name = 'item_id') THEN
    ALTER TABLE app.intelligence_item_projects RENAME COLUMN intelligence_item_id TO item_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_brief_items' AND column_name = 'intelligence_brief_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_brief_items' AND column_name = 'brief_id') THEN
    ALTER TABLE app.intelligence_brief_items RENAME COLUMN intelligence_brief_id TO brief_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_brief_items' AND column_name = 'intelligence_item_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_brief_items' AND column_name = 'item_id') THEN
    ALTER TABLE app.intelligence_brief_items RENAME COLUMN intelligence_item_id TO item_id;
  END IF;
END $$;

ALTER TABLE app.intelligence_topics ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE app.intelligence_topic_projects ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE app.intelligence_collection_plans ADD COLUMN IF NOT EXISTS connector_profile_id TEXT;
ALTER TABLE app.intelligence_collection_plans ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ(6);
ALTER TABLE app.intelligence_runs ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE app.intelligence_items ADD COLUMN IF NOT EXISTS status app."IntelligenceItemStatus" NOT NULL DEFAULT 'NEW';
ALTER TABLE app.intelligence_occurrences ADD COLUMN IF NOT EXISTS raw_summary TEXT;
ALTER TABLE app.intelligence_item_topics ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE app.intelligence_item_projects ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE app.intelligence_brief_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_runs' AND column_name = 'source_id') THEN
    ALTER TABLE app.intelligence_runs ALTER COLUMN source_id DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'intelligence_occurrences' AND column_name = 'source_key') THEN
    ALTER TABLE app.intelligence_occurrences ALTER COLUMN source_key DROP NOT NULL;
  END IF;
  IF to_regclass('app.intelligence_task_conversions') IS NOT NULL THEN
    INSERT INTO app.intelligence_conversions (id, item_id, kind, target_id, created_at)
    SELECT concat('legacy-task-', task_id), intelligence_item_id, 'TASK', task_id, created_at
    FROM app.intelligence_task_conversions
    ON CONFLICT DO NOTHING;
  END IF;
  IF to_regclass('app.intelligence_risk_conversions') IS NOT NULL THEN
    INSERT INTO app.intelligence_conversions (id, item_id, kind, target_id, created_at)
    SELECT concat('legacy-risk-', risk_id), intelligence_item_id, 'RISK', risk_id, created_at
    FROM app.intelligence_risk_conversions
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intelligence_collection_plans_source_id_fkey') THEN
    ALTER TABLE app.intelligence_collection_plans ADD CONSTRAINT intelligence_collection_plans_source_id_fkey
      FOREIGN KEY (source_id) REFERENCES app.intelligence_sources(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intelligence_runs_plan_id_fkey') THEN
    ALTER TABLE app.intelligence_runs ADD CONSTRAINT intelligence_runs_plan_id_fkey
      FOREIGN KEY (plan_id) REFERENCES app.intelligence_collection_plans(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intelligence_occurrences_item_id_fkey') THEN
    ALTER TABLE app.intelligence_occurrences ADD CONSTRAINT intelligence_occurrences_item_id_fkey
      FOREIGN KEY (item_id) REFERENCES app.intelligence_items(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intelligence_occurrences_source_id_fkey') THEN
    ALTER TABLE app.intelligence_occurrences ADD CONSTRAINT intelligence_occurrences_source_id_fkey
      FOREIGN KEY (source_id) REFERENCES app.intelligence_sources(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intelligence_item_topics_topic_id_fkey') THEN
    ALTER TABLE app.intelligence_item_topics ADD CONSTRAINT intelligence_item_topics_topic_id_fkey
      FOREIGN KEY (topic_id) REFERENCES app.intelligence_topics(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intelligence_item_projects_project_id_fkey') THEN
    ALTER TABLE app.intelligence_item_projects ADD CONSTRAINT intelligence_item_projects_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES app.projects(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intelligence_brief_items_brief_id_fkey') THEN
    ALTER TABLE app.intelligence_brief_items ADD CONSTRAINT intelligence_brief_items_brief_id_fkey
      FOREIGN KEY (brief_id) REFERENCES app.intelligence_briefs(id) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS intelligence_topics_active_name_key
  ON app.intelligence_topics(lower(name)) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS intelligence_topics_archived_at_updated_at_idx
  ON app.intelligence_topics(archived_at, updated_at);
CREATE INDEX IF NOT EXISTS intelligence_topic_projects_project_id_idx
  ON app.intelligence_topic_projects(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_sources_active_name_key
  ON app.intelligence_sources(lower(name)) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS intelligence_sources_archived_at_updated_at_idx
  ON app.intelligence_sources(archived_at, updated_at);
CREATE INDEX IF NOT EXISTS intelligence_collection_plans_source_id_archived_at_enabled_idx
  ON app.intelligence_collection_plans(source_id, archived_at, enabled);
CREATE INDEX IF NOT EXISTS intelligence_collection_plans_enabled_next_run_at_idx
  ON app.intelligence_collection_plans(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS intelligence_runs_plan_id_started_at_idx
  ON app.intelligence_runs(plan_id, started_at);
CREATE INDEX IF NOT EXISTS intelligence_runs_status_started_at_idx
  ON app.intelligence_runs(status, started_at);
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_items_content_hash_key
  ON app.intelligence_items(content_hash);
CREATE INDEX IF NOT EXISTS intelligence_items_archived_at_published_at_idx
  ON app.intelligence_items(archived_at, published_at);
CREATE INDEX IF NOT EXISTS intelligence_items_archived_at_priority_status_idx
  ON app.intelligence_items(archived_at, priority, status);
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_occurrences_item_id_source_id_source_url_key
  ON app.intelligence_occurrences(item_id, source_id, source_url);
CREATE INDEX IF NOT EXISTS intelligence_occurrences_source_id_captured_at_idx
  ON app.intelligence_occurrences(source_id, captured_at);
CREATE INDEX IF NOT EXISTS intelligence_item_topics_topic_id_idx
  ON app.intelligence_item_topics(topic_id);
CREATE INDEX IF NOT EXISTS intelligence_item_projects_project_id_idx
  ON app.intelligence_item_projects(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_conversions_item_id_kind_key
  ON app.intelligence_conversions(item_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_conversions_kind_target_id_key
  ON app.intelligence_conversions(kind, target_id);
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_briefs_kind_brief_date_key
  ON app.intelligence_briefs(kind, brief_date);
CREATE INDEX IF NOT EXISTS intelligence_briefs_archived_at_brief_date_idx
  ON app.intelligence_briefs(archived_at, brief_date);
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_brief_items_brief_id_item_id_key
  ON app.intelligence_brief_items(brief_id, item_id);
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_brief_items_brief_id_sequence_key
  ON app.intelligence_brief_items(brief_id, sequence);
CREATE INDEX IF NOT EXISTS intelligence_brief_items_item_id_idx
  ON app.intelligence_brief_items(item_id);
