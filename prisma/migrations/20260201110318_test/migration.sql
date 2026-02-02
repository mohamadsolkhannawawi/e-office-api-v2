-- CreateEnum
CREATE TYPE "TemplateEngine" AS ENUM ('HANDLEBARS', 'RAW');

-- CreateEnum
CREATE TYPE "DocumentFormat" AS ENUM ('DOCX', 'PDF', 'HTML');

-- CreateEnum
CREATE TYPE "LetterStatus" AS ENUM ('DRAFT', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'REVISION');

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "isAnonymous" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mahasiswa" (
    "id" TEXT NOT NULL,
    "nim" TEXT NOT NULL,
    "tahunMasuk" TEXT NOT NULL,
    "noHp" TEXT NOT NULL,
    "alamat" TEXT,
    "tempatLahir" TEXT,
    "tanggalLahir" TIMESTAMP(3),
    "semester" INTEGER,
    "ipk" DOUBLE PRECISION,
    "ips" DOUBLE PRECISION,
    "userId" TEXT NOT NULL,
    "departemenId" TEXT NOT NULL,
    "programStudiId" TEXT NOT NULL,

    CONSTRAINT "mahasiswa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pegawai" (
    "id" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "jabatan" TEXT NOT NULL,
    "noHp" TEXT,
    "userId" TEXT NOT NULL,
    "departemenId" TEXT NOT NULL,
    "programStudiId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pegawai_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departemen" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "departemen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_studi" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "departemenId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "program_studi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "category" TEXT,
    "attachmentType" TEXT,
    "letterInstanceId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_type" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "letter_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_template" (
    "id" TEXT NOT NULL,
    "versionName" TEXT NOT NULL,
    "schemaDefinition" JSONB NOT NULL,
    "formFields" JSONB NOT NULL,
    "templateEngine" "TemplateEngine" NOT NULL DEFAULT 'HANDLEBARS',
    "letterTypeId" TEXT NOT NULL,

    CONSTRAINT "letter_template_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "letter_instance" (
    "id" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "values" JSONB NOT NULL,
    "status" "LetterStatus" NOT NULL DEFAULT 'PENDING',
    "currentStep" INTEGER,
    "scholarshipName" TEXT,
    "letterNumber" TEXT,
    "currentRoleId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "stampId" TEXT,
    "stampAppliedAt" TIMESTAMP(3),
    "letterTypeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "letter_instance_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "letter_history" (
    "id" TEXT NOT NULL,
    "letterInstanceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "status" TEXT,
    "roleId" TEXT,
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
    "signatureType" TEXT NOT NULL,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_signature_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "entityId" TEXT,
    "letterInstanceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_userId_providerId_key" ON "account"("userId", "providerId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permission_resource_action_key" ON "permission"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_userId_roleId_key" ON "user_role"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permission_roleId_permissionId_key" ON "role_permission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "mahasiswa_userId_key" ON "mahasiswa"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "pegawai_userId_key" ON "pegawai"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "departemen_code_key" ON "departemen"("code");

-- CreateIndex
CREATE UNIQUE INDEX "program_studi_code_key" ON "program_studi"("code");

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

-- CreateIndex
CREATE UNIQUE INDEX "letter_verification_applicationId_key" ON "letter_verification"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "letter_verification_code_key" ON "letter_verification"("code");

-- CreateIndex
CREATE INDEX "user_stamp_userId_idx" ON "user_stamp"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "letter_config_key_key" ON "letter_config"("key");

-- CreateIndex
CREATE UNIQUE INDEX "letter_counter_year_type_key" ON "letter_counter"("year", "type");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mahasiswa" ADD CONSTRAINT "mahasiswa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mahasiswa" ADD CONSTRAINT "mahasiswa_departemenId_fkey" FOREIGN KEY ("departemenId") REFERENCES "departemen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mahasiswa" ADD CONSTRAINT "mahasiswa_programStudiId_fkey" FOREIGN KEY ("programStudiId") REFERENCES "program_studi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pegawai" ADD CONSTRAINT "pegawai_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pegawai" ADD CONSTRAINT "pegawai_departemenId_fkey" FOREIGN KEY ("departemenId") REFERENCES "departemen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pegawai" ADD CONSTRAINT "pegawai_programStudiId_fkey" FOREIGN KEY ("programStudiId") REFERENCES "program_studi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_studi" ADD CONSTRAINT "program_studi_departemenId_fkey" FOREIGN KEY ("departemenId") REFERENCES "departemen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_letterInstanceId_fkey" FOREIGN KEY ("letterInstanceId") REFERENCES "letter_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_template" ADD CONSTRAINT "letter_template_letterTypeId_fkey" FOREIGN KEY ("letterTypeId") REFERENCES "letter_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template" ADD CONSTRAINT "document_template_letterTypeId_fkey" FOREIGN KEY ("letterTypeId") REFERENCES "letter_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_log" ADD CONSTRAINT "document_generation_log_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_log" ADD CONSTRAINT "document_generation_log_letterInstanceId_fkey" FOREIGN KEY ("letterInstanceId") REFERENCES "letter_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_variable" ADD CONSTRAINT "template_variable_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_instance" ADD CONSTRAINT "letter_instance_currentRoleId_fkey" FOREIGN KEY ("currentRoleId") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_instance" ADD CONSTRAINT "letter_instance_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "user_stamp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_instance" ADD CONSTRAINT "letter_instance_letterTypeId_fkey" FOREIGN KEY ("letterTypeId") REFERENCES "letter_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_instance" ADD CONSTRAINT "letter_instance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_verification" ADD CONSTRAINT "letter_verification_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "letter_instance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_history" ADD CONSTRAINT "letter_history_letterInstanceId_fkey" FOREIGN KEY ("letterInstanceId") REFERENCES "letter_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_history" ADD CONSTRAINT "letter_history_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_history" ADD CONSTRAINT "letter_history_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_version" ADD CONSTRAINT "letter_version_letterInstanceId_fkey" FOREIGN KEY ("letterInstanceId") REFERENCES "letter_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_signature" ADD CONSTRAINT "user_signature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stamp" ADD CONSTRAINT "user_stamp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_letterInstanceId_fkey" FOREIGN KEY ("letterInstanceId") REFERENCES "letter_instance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
