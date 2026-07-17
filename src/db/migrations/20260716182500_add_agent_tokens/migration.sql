-- CreateTable
CREATE TABLE "agent_tokens" (
    "id" TEXT NOT NULL DEFAULT snowflake(),
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_tokens_token_hash_key" ON "agent_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "agent_tokens_user_id_idx" ON "agent_tokens"("user_id");

-- CreateIndex
CREATE INDEX "agent_tokens_revoked_at_idx" ON "agent_tokens"("revoked_at");

-- AddForeignKey
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
