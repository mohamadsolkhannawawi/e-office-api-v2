/*
  Warnings:

  - A unique constraint covering the columns `[nim]` on the table `mahasiswa` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[nip]` on the table `pegawai` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "mahasiswa_nim_key" ON "mahasiswa"("nim");

-- CreateIndex
CREATE UNIQUE INDEX "pegawai_nip_key" ON "pegawai"("nip");

-- AddForeignKey
ALTER TABLE "template_variable" ADD CONSTRAINT "template_variable_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_instance" ADD CONSTRAINT "letter_instance_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "user_stamp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
