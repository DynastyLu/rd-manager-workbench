-- Create document_chunks table with vector support
CREATE TABLE app.document_chunks (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id TEXT NOT NULL,
  chunk_index INT NOT NULL,
  content     TEXT NOT NULL,
  token_count INT NOT NULL DEFAULT 0,
  embedding   public.vector(1536),
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT fk_document_chunks_document FOREIGN KEY (document_id) REFERENCES app.content_documents(id) ON DELETE CASCADE,
  UNIQUE (document_id, chunk_index)
);

-- Create knowledge_sessions table
CREATE TABLE app.knowledge_sessions (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Create knowledge_messages table
CREATE TABLE app.knowledge_messages (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id  TEXT NOT NULL,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  citations   JSONB,
  token_count INT,
  created_at  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT fk_knowledge_messages_session FOREIGN KEY (session_id) REFERENCES app.knowledge_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_knowledge_messages_session ON app.knowledge_messages(session_id, created_at);

-- Create ai_usage_logs table
CREATE TABLE app.ai_usage_logs (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  operation       TEXT NOT NULL,
  model           TEXT NOT NULL,
  token_count     INT NOT NULL,
  estimated_cost  DOUBLE PRECISION,
  document_id     TEXT,
  session_id      TEXT,
  success         BOOLEAN NOT NULL,
  error_code      TEXT,
  created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_logs_created ON app.ai_usage_logs(created_at);

-- Create HNSW index for vector similarity search
CREATE INDEX idx_document_chunks_embedding ON app.document_chunks
  USING hnsw (embedding public.vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);
