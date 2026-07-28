-- Knowledge retrieval relies on pgvector for semantic search and pg_trgm for
-- keyword fallback. Keep this migration ordered immediately before the first
-- migration that references either extension so a clean database is deployable.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
