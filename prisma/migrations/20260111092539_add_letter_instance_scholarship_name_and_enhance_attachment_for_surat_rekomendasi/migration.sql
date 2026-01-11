/*
  Warnings:

  - Added the required column `updatedAt` to the `letter_instance` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "attachment" ADD COLUMN     "attachmentType" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "letterInstanceId" TEXT,
ADD COLUMN     "mimeType" TEXT;

-- AlterTable
ALTER TABLE "letter_instance" ADD COLUMN     "scholarshipName" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_letterInstanceId_fkey" FOREIGN KEY ("letterInstanceId") REFERENCES "letter_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
