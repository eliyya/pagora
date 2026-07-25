CREATE TYPE "ChargeKind" AS ENUM (
    'single',
    'installment_parent',
    'installment'
);

ALTER TABLE "chargues"
ADD COLUMN "kind" "ChargeKind" NOT NULL DEFAULT 'single',
ADD COLUMN "installment_parent_id" TEXT,
ADD COLUMN "installment_number" INTEGER,
ADD COLUMN "installment_count" INTEGER,
ADD COLUMN "scheduled_for" DATE;

UPDATE "chargues"
SET "scheduled_for" = "created_at"::date;

ALTER TABLE "chargues"
ALTER COLUMN "scheduled_for" SET NOT NULL,
ALTER COLUMN "scheduled_for" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "chargues"
ADD CONSTRAINT "chargues_installment_shape_check" CHECK (
    (
        "kind" = 'single'
        AND "installment_parent_id" IS NULL
        AND "installment_number" IS NULL
        AND "installment_count" IS NULL
    )
    OR (
        "kind" = 'installment_parent'
        AND "installment_parent_id" IS NULL
        AND "installment_number" IS NULL
        AND "installment_count" BETWEEN 2 AND 60
    )
    OR (
        "kind" = 'installment'
        AND "installment_parent_id" IS NOT NULL
        AND "installment_number" BETWEEN 1 AND 60
        AND "installment_count" BETWEEN 2 AND 60
        AND "installment_number" <= "installment_count"
    )
),
ADD CONSTRAINT "chargues_installment_not_self_parent_check" CHECK (
    "installment_parent_id" IS NULL
    OR "installment_parent_id" <> "id"
);

CREATE INDEX "chargues_installment_parent_id_idx"
ON "chargues"("installment_parent_id");

CREATE UNIQUE INDEX "chargues_installment_parent_id_installment_number_key"
ON "chargues"("installment_parent_id", "installment_number");

CREATE UNIQUE INDEX "chargues_id_card_id_key"
ON "chargues"("id", "card_id");

CREATE INDEX "chargues_card_id_kind_scheduled_for_idx"
ON "chargues"("card_id", "kind", "scheduled_for");

ALTER TABLE "chargues"
ADD CONSTRAINT "chargues_installment_parent_id_fkey"
FOREIGN KEY ("installment_parent_id", "card_id")
REFERENCES "chargues"("id", "card_id")
ON DELETE CASCADE ON UPDATE CASCADE;
