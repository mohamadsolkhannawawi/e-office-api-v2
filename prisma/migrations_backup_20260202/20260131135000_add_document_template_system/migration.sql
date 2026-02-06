-- CreateEnum
CREATE TYPE "DocumentFormat" AS ENUM ('DOCX', 'PDF', 'HTML');

-- CreateTable
CREATE TABLE "document_template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "templatePath" TEXT NOT NULL,
    "templateType" "TemplateEngine" NOT NULL DEFAULT 'HANDLEBARS',
    "version" TEXT NOT NULL DEFAULT 'v1',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "schemaDefinition" JSONB NOT NULL,
    "supportedFormats" "DocumentFormat"[] DEFAULT ARRAY['DOCX']::"DocumentFormat"[],
    "letterTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "document_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_generation_log" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "letterInstanceId" TEXT NOT NULL,
    "generatedFormat" "DocumentFormat" NOT NULL,
    "fileSize" INTEGER,
    "filePath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "processingTimeMs" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_generation_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_variable" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "variableName" TEXT NOT NULL,
    "variableType" TEXT NOT NULL DEFAULT 'string',
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" TEXT,
    "description" TEXT,
    "validationRules" JSONB,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_variable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_template_letterTypeId_idx" ON "document_template"("letterTypeId");

-- CreateIndex
CREATE INDEX "document_template_isActive_idx" ON "document_template"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "document_template_name_version_key" ON "document_template"("name", "version");

-- CreateIndex
CREATE INDEX "document_generation_log_templateId_idx" ON "document_generation_log"("templateId");

-- CreateIndex
CREATE INDEX "document_generation_log_letterInstanceId_idx" ON "document_generation_log"("letterInstanceId");

-- CreateIndex
CREATE INDEX "document_generation_log_status_idx" ON "document_generation_log"("status");

-- CreateIndex
CREATE UNIQUE INDEX "template_variable_templateId_variableName_key" ON "template_variable"("templateId", "variableName");

-- AddForeignKey
ALTER TABLE "document_template" ADD CONSTRAINT "document_template_letterTypeId_fkey" FOREIGN KEY ("letterTypeId") REFERENCES "letter_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_log" ADD CONSTRAINT "document_generation_log_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_log" ADD CONSTRAINT "document_generation_log_letterInstanceId_fkey" FOREIGN KEY ("letterInstanceId") REFERENCES "letter_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
