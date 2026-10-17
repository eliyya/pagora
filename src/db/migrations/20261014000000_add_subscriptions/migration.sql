-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'paused', 'canceled');

-- AlterTable
ALTER TABLE "chargues" ADD COLUMN     "subscription_due_on" DATE,
ADD COLUMN     "subscription_id" TEXT;

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL DEFAULT snowflake(),
    "name" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "category_id" TEXT,
    "amount" INTEGER NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "starts_on" DATE NOT NULL,
    "next_due_on" DATE NOT NULL,
    "time_zone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscriptions_card_id_status_idx" ON "subscriptions"("card_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_status_next_due_on_idx" ON "subscriptions"("status", "next_due_on");

-- CreateIndex
CREATE INDEX "subscriptions_category_id_idx" ON "subscriptions"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_id_card_id_key" ON "subscriptions"("id", "card_id");

-- CreateIndex
CREATE UNIQUE INDEX "chargues_subscription_id_subscription_due_on_key" ON "chargues"("subscription_id", "subscription_due_on");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "charge_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chargues" ADD CONSTRAINT "chargues_subscription_id_card_id_fkey" FOREIGN KEY ("subscription_id", "card_id") REFERENCES "subscriptions"("id", "card_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Domain checks are maintained in SQL because Prisma does not model CHECK constraints.
ALTER TABLE "subscriptions"
ADD CONSTRAINT "subscriptions_amount_check" CHECK ("amount" > 0),
ADD CONSTRAINT "subscriptions_dates_check" CHECK ("next_due_on" >= "starts_on"),
ADD CONSTRAINT "subscriptions_revision_check" CHECK ("revision" >= 0),
ADD CONSTRAINT "subscriptions_name_check" CHECK (length(btrim("name")) > 0),
ADD CONSTRAINT "subscriptions_time_zone_check" CHECK (length(btrim("time_zone")) > 0);

ALTER TABLE "chargues"
ADD CONSTRAINT "chargues_subscription_shape_check" CHECK (
    ("subscription_id" IS NULL AND "subscription_due_on" IS NULL)
    OR (
        "subscription_id" IS NOT NULL
        AND "subscription_due_on" IS NOT NULL
        AND "kind" = 'single'
    )
);
