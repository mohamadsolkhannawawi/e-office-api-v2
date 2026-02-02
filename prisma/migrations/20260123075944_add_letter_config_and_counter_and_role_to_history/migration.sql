-- AlterEnum
ALTER TYPE "LetterStatus" ADD VALUE 'DRAFT';

-- AlterTable
ALTER TABLE "letter_history" ADD COLUMN     "roleId" TEXT;

-- AlterTable
ALTER TABLE "letter_instance" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ALTER COLUMN "createdAt" DROP NOT NULL,
ALTER COLUMN "updatedAt" DROP NOT NULL;

-- CreateTable
CREATE TABLE "letter_verification" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "letterNumber" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "verifiedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "letter_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_counter" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "letter_counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "letter_verification_applicationId_key" ON "letter_verification"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "letter_verification_code_key" ON "letter_verification"("code");

-- CreateIndex
CREATE UNIQUE INDEX "letter_config_key_key" ON "letter_config"("key");

-- CreateIndex
CREATE UNIQUE INDEX "letter_counter_year_type_key" ON "letter_counter"("year", "type");

-- AddForeignKey
ALTER TABLE "letter_verification" ADD CONSTRAINT "letter_verification_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "letter_instance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_history" ADD CONSTRAINT "letter_history_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

