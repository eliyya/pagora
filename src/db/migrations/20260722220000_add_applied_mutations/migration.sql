CREATE TABLE "applied_mutations" (
    "mutation_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applied_mutations_pkey"
    PRIMARY KEY ("card_id", "mutation_id")
);

CREATE INDEX "applied_mutations_user_id_idx"
ON "applied_mutations"("user_id");

ALTER TABLE "applied_mutations"
ADD CONSTRAINT "applied_mutations_card_id_fkey"
FOREIGN KEY ("card_id") REFERENCES "cards"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "applied_mutations"
ADD CONSTRAINT "applied_mutations_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
