-- AddForeignKey
ALTER TABLE "template_variable" ADD CONSTRAINT "template_variable_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_instance" ADD CONSTRAINT "letter_instance_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "user_stamp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
