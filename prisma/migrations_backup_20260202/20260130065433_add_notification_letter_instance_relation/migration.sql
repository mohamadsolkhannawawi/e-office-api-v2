-- DropForeignKey
ALTER TABLE "notification" DROP CONSTRAINT "notification_userId_fkey";

-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "letterInstanceId" TEXT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_letterInstanceId_fkey" FOREIGN KEY ("letterInstanceId") REFERENCES "letter_instance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
