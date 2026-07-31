-- AlterTable
ALTER TABLE "app"."knowledge_sessions" ADD COLUMN     "owner_user_id" TEXT;

-- CreateIndex
CREATE INDEX "knowledge_sessions_owner_user_id_archived_at_updated_at_idx" ON "app"."knowledge_sessions"("owner_user_id", "archived_at", "updated_at");
