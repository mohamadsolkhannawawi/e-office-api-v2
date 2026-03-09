-- AlterTable: Add isActive column to user
ALTER TABLE "user" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: mirror current emailVerified status so already-deactivated users stay inactive
UPDATE "user" SET "isActive" = "emailVerified";
