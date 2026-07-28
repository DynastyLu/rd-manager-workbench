CREATE TYPE "app"."KnowledgeScopeType" AS ENUM (
  'ALL',
  'PROJECT',
  'SPACE',
  'FOLDER',
  'DOCUMENTS',
  'RECENT'
);

ALTER TABLE "app"."knowledge_sessions"
  ADD COLUMN "scope_type" "app"."KnowledgeScopeType" NOT NULL DEFAULT 'ALL',
  ADD COLUMN "scope_value" JSONB,
  ADD COLUMN "is_pinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archived_at" TIMESTAMPTZ(6);

UPDATE "app"."knowledge_sessions"
SET "archived_at" = "updated_at"
WHERE "status" = 'ARCHIVED'
  AND "archived_at" IS NULL;

ALTER TABLE "app"."knowledge_messages"
  ADD COLUMN "reply_to_message_id" TEXT;

CREATE INDEX "knowledge_sessions_archived_at_is_pinned_updated_at_idx"
  ON "app"."knowledge_sessions"("archived_at", "is_pinned", "updated_at");

CREATE INDEX "knowledge_messages_reply_to_message_id_idx"
  ON "app"."knowledge_messages"("reply_to_message_id");

ALTER TABLE "app"."knowledge_messages"
  ADD CONSTRAINT "knowledge_messages_reply_to_message_id_fkey"
  FOREIGN KEY ("reply_to_message_id")
  REFERENCES "app"."knowledge_messages"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
