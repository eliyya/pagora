CREATE TABLE "charge_categories" (
    "id" TEXT NOT NULL DEFAULT snowflake(),
    "card_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthly_budget" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charge_categories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "chargues" ADD COLUMN "category_id" TEXT;

CREATE UNIQUE INDEX "charge_categories_card_id_name_key" ON "charge_categories"("card_id", "name");
CREATE INDEX "charge_categories_card_id_idx" ON "charge_categories"("card_id");
CREATE INDEX "chargues_category_id_idx" ON "chargues"("category_id");

ALTER TABLE "charge_categories" ADD CONSTRAINT "charge_categories_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chargues" ADD CONSTRAINT "chargues_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "charge_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
