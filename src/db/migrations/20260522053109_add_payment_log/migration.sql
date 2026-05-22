-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('success', 'failed', 'pending', 'refunded');

-- CreateTable
CREATE TABLE "PaymentLog" (
    "id" TEXT NOT NULL DEFAULT snowflake(),
    "charge_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentLog_charge_id_idx" ON "PaymentLog"("charge_id");

-- CreateIndex
CREATE INDEX "PaymentLog_created_at_idx" ON "PaymentLog"("created_at");

-- AddForeignKey
ALTER TABLE "PaymentLog" ADD CONSTRAINT "PaymentLog_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "chargues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
