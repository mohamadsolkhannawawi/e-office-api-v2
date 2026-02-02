-- AlterTable
ALTER TABLE "letter_instance" ADD COLUMN     "letterNumber" TEXT;

-- AlterTable
ALTER TABLE "mahasiswa" ADD COLUMN     "ipk" DOUBLE PRECISION,
ADD COLUMN     "ips" DOUBLE PRECISION,
ADD COLUMN     "semester" INTEGER;

-- CreateTable
CREATE TABLE "letter_history" (
    "id" TEXT NOT NULL,
    "letterInstanceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_version" (
    "id" TEXT NOT NULL,
    "letterInstanceId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_signature" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_signature_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "letter_history" ADD CONSTRAINT "letter_history_letterInstanceId_fkey" FOREIGN KEY ("letterInstanceId") REFERENCES "letter_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_history" ADD CONSTRAINT "letter_history_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_version" ADD CONSTRAINT "letter_version_letterInstanceId_fkey" FOREIGN KEY ("letterInstanceId") REFERENCES "letter_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_signature" ADD CONSTRAINT "user_signature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

