-- AlterTable
ALTER TABLE "letter_instance" ADD COLUMN     "stampAppliedAt" TIMESTAMP(3),
ADD COLUMN     "stampId" TEXT;

-- CreateTable
CREATE TABLE "user_stamp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "stampType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_stamp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_stamp_userId_idx" ON "user_stamp"("userId");

-- AddForeignKey
ALTER TABLE "user_stamp" ADD CONSTRAINT "user_stamp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
