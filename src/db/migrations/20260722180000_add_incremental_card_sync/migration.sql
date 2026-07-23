ALTER TABLE "cards"
ADD COLUMN "sync_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "chargues"
ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "card_changes" (
    "id" BIGSERIAL NOT NULL,
    "card_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_changes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "card_changes_version_check" CHECK ("version" > 0),
    CONSTRAINT "card_changes_entity_check" CHECK (
        "entity" IN ('charge', 'category', 'payment')
    ),
    CONSTRAINT "card_changes_operation_check" CHECK (
        "operation" IN ('upsert', 'delete')
    )
);

CREATE INDEX "card_changes_card_id_version_idx"
ON "card_changes"("card_id", "version");

ALTER TABLE "card_changes"
ADD CONSTRAINT "card_changes_card_id_fkey"
FOREIGN KEY ("card_id") REFERENCES "cards"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
