/*
  Warnings:

  - The `status` column on the `letter_instance` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `form_fields` on the `letter_template` table. All the data in the column will be lost.
  - You are about to drop the column `letter_type_id` on the `letter_template` table. All the data in the column will be lost.
  - You are about to drop the column `schema_defintion` on the `letter_template` table. All the data in the column will be lost.
  - You are about to drop the column `version_name` on the `letter_template` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,providerId]` on the table `account` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `formFields` to the `letter_template` table without a default value. This is not possible if the table is not empty.
  - Added the required column `letterTypeId` to the `letter_template` table without a default value. This is not possible if the table is not empty.
  - Added the required column `schemaDefinition` to the `letter_template` table without a default value. This is not possible if the table is not empty.
  - Added the required column `versionName` to the `letter_template` table without a default value. This is not possible if the table is not empty.
  - Added the required column `signatureType` to the `user_signature` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TemplateEngine" AS ENUM ('HANDLEBARS', 'RAW');

-- CreateEnum
CREATE TYPE "LetterStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'REVISION');

-- DropForeignKey
ALTER TABLE "letter_template" DROP CONSTRAINT "letter_template_letter_type_id_fkey";

-- AlterTable
ALTER TABLE "letter_instance" ADD COLUMN     "currentRoleId" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
DROP COLUMN "status",
ADD COLUMN     "status" "LetterStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "letter_template" DROP COLUMN "form_fields",
DROP COLUMN "letter_type_id",
DROP COLUMN "schema_defintion",
DROP COLUMN "version_name",
ADD COLUMN     "formFields" JSONB NOT NULL,
ADD COLUMN     "letterTypeId" TEXT NOT NULL,
ADD COLUMN     "schemaDefinition" JSONB NOT NULL,
ADD COLUMN     "templateEngine" "TemplateEngine" NOT NULL DEFAULT 'HANDLEBARS',
ADD COLUMN     "versionName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "user_signature" ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "signatureType" TEXT NOT NULL;

-- DropEnum
DROP TYPE "Jenjang";

-- DropEnum
DROP TYPE "field_type";

-- DropEnum
DROP TYPE "letter_status";

-- DropEnum
DROP TYPE "step_status";

-- DropEnum
DROP TYPE "template_engine";

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_userId_providerId_key" ON "account"("userId", "providerId");

-- AddForeignKey
ALTER TABLE "letter_template" ADD CONSTRAINT "letter_template_letterTypeId_fkey" FOREIGN KEY ("letterTypeId") REFERENCES "letter_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_instance" ADD CONSTRAINT "letter_instance_currentRoleId_fkey" FOREIGN KEY ("currentRoleId") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
