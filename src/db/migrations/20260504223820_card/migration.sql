/*
  Warnings:

  - You are about to drop the column `user_id` on the `cards` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[owner_id,name]` on the table `cards` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `closing_day` to the `cards` table without a default value. This is not possible if the table is not empty.
  - Added the required column `credit_limit` to the `cards` table without a default value. This is not possible if the table is not empty.
  - Added the required column `due_day` to the `cards` table without a default value. This is not possible if the table is not empty.
  - Added the required column `last4` to the `cards` table without a default value. This is not possible if the table is not empty.
  - Added the required column `owner_id` to the `cards` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CARD_BRAND" AS ENUM ('mastercard', 'visa', 'amex');

-- DropForeignKey
ALTER TABLE "cards" DROP CONSTRAINT "cards_user_id_fkey";

-- DropIndex
DROP INDEX "cards_user_id_name_key";

-- AlterTable
ALTER TABLE "cards" DROP COLUMN "user_id",
ADD COLUMN     "bank" TEXT,
ADD COLUMN     "brand" "CARD_BRAND" NOT NULL DEFAULT 'mastercard',
ADD COLUMN     "closing_day" INTEGER NOT NULL,
ADD COLUMN     "credit_limit" INTEGER NOT NULL,
ADD COLUMN     "due_day" INTEGER NOT NULL,
ADD COLUMN     "last4" TEXT NOT NULL,
ADD COLUMN     "owner_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "cards_owner_id_name_key" ON "cards"("owner_id", "name");

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
