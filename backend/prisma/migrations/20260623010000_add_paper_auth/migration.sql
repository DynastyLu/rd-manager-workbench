CREATE TABLE "paper_users" (
  "id" SERIAL NOT NULL,
  "username" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'user',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "paper_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "paper_refresh_tokens" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "token_hash" TEXT NOT NULL,
  "revoked" BOOLEAN NOT NULL DEFAULT false,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "paper_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "paper_users_username_key" ON "paper_users"("username");
CREATE UNIQUE INDEX "paper_refresh_tokens_token_hash_key" ON "paper_refresh_tokens"("token_hash");
CREATE INDEX "paper_refresh_tokens_user_id_idx" ON "paper_refresh_tokens"("user_id");
CREATE INDEX "paper_refresh_tokens_expires_at_idx" ON "paper_refresh_tokens"("expires_at");

ALTER TABLE "paper_refresh_tokens"
  ADD CONSTRAINT "paper_refresh_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "paper_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
