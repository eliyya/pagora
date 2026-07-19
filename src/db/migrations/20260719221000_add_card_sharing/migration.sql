CREATE TYPE "CardPermission" AS ENUM ('read', 'write');

CREATE TYPE "CardInvitationStatus" AS ENUM ('pending', 'accepted', 'declined', 'canceled');

CREATE TABLE "card_members" (
    "id" TEXT NOT NULL DEFAULT snowflake(),
    "card_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" "CardPermission" NOT NULL DEFAULT 'read',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "card_invitations" (
    "id" TEXT NOT NULL DEFAULT snowflake(),
    "card_id" TEXT NOT NULL,
    "inviter_id" TEXT NOT NULL,
    "invitee_id" TEXT NOT NULL,
    "permission" "CardPermission" NOT NULL DEFAULT 'read',
    "status" "CardInvitationStatus" NOT NULL DEFAULT 'pending',
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "card_members_card_id_user_id_key" ON "card_members"("card_id", "user_id");
CREATE INDEX "card_members_user_id_idx" ON "card_members"("user_id");
CREATE INDEX "card_invitations_card_id_idx" ON "card_invitations"("card_id");
CREATE INDEX "card_invitations_invitee_id_status_idx" ON "card_invitations"("invitee_id", "status");
CREATE INDEX "card_invitations_inviter_id_idx" ON "card_invitations"("inviter_id");

ALTER TABLE "card_members" ADD CONSTRAINT "card_members_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "card_members" ADD CONSTRAINT "card_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "card_invitations" ADD CONSTRAINT "card_invitations_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "card_invitations" ADD CONSTRAINT "card_invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "card_invitations" ADD CONSTRAINT "card_invitations_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
