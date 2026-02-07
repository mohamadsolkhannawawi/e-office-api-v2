import { Elysia, t } from "elysia";
import { Prisma } from "../../db/index.js";
import { pdfConversionService } from "../../services/pdf/PdfConversionService.js";
import { SuratRekomendasiTemplateService } from "../../services/template/index.js";
import { DocumentCleanupService } from "../../services/DocumentCleanupService.js";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = Prisma;

export const templatesRoute = new Elysia({ prefix: "/templates" })

    // Get all document templates
    .get("/", async () => {
        try {
            const templates = await prisma.documentTemplate.findMany({
                where: { isActive: true },
                include: {
                    letterType: true,
                    variables: true,
                    _count: {
                        select: {
                            generationLogs: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
            });

            return {
                success: true,
                data: templates,
            };
        } catch (error: any) {
            console.error("Error fetching templates:", error);
            return {
                success: false,
                error: error.message,
            };
        }
    })

    // Get template by letter type name
    .get(
        "/by-letter-type/:letterTypeName",
        async ({ params: { letterTypeName } }) => {
            try {
                const template = await prisma.documentTemplate.findFirst({
                    where: {
                        letterType: {
                            name: {
                                contains: letterTypeName,
                                mode: "insensitive",
                            },
                        },
                        isActive: true,
                    },
                    include: {
                        letterType: true,
                    },
                    orderBy: { createdAt: "desc" },
                });

                if (!template) {
                    return {
                        success: false,
                        error: `No template found for letter type: ${letterTypeName}`,
                    };
                }

                return {
                    success: true,
                    data: template,
                };
            } catch (error: any) {
                console.error("Error fetching template by letter type:", error);
                return {
                    success: false,
                    error: error.message,
                };
            }
        },
        {
            params: t.Object({
                letterTypeName: t.String(),
            }),
        },
    )

    // Get specific template by ID
    .get(
        "/:id",
        async ({ params: { id } }) => {
            try {
                const template = await prisma.documentTemplate.findUnique({
                    where: { id },
                    include: {
                        letterType: true,
                        variables: {
                            orderBy: { variableName: "asc" },
                        },
                        generationLogs: {
                            take: 10,
                            orderBy: { generatedAt: "desc" },
                            include: {
                                letterInstance: {
                                    select: {
                                        id: true,
                                        letterNumber: true,
                                        status: true,
                                    },
                                },
                            },
                        },
                    },
                });

                if (!template) {
                    return {
                        success: false,
                        error: "Template not found",
                    };
                }

                return {
                    success: true,
                    data: template,
                };
            } catch (error: any) {
                console.error("Error fetching template:", error);
                return {
                    success: false,
                    error: error.message,
                };
            }
        },
        {
            params: t.Object({
                id: t.String(),
            }),
        },
    )

    // Generate document from template
    .post(
        "/generate/:templateId",
        async ({ params: { templateId }, body, set }) => {
            try {
                const { letterInstanceId, format = "DOCX" } = body;

                // Get template
                const template = await prisma.documentTemplate.findUnique({
                    where: { id: templateId },
                    include: { letterType: true },
                });

                if (!template) {
                    set.status = 404;
                    return {
                        success: false,
                        error: "Template not found",
                    };
                }

                // Get letter instance
                const letterInstance = await prisma.letterInstance.findUnique({
                    where: { id: letterInstanceId },
                    include: {
                        createdBy: {
                            include: {
                                mahasiswa: true,
                                pegawai: true,
                            },
                        },
                        stamp: true,
                    },
                });

                if (!letterInstance) {
                    set.status = 404;
                    return {
                        success: false,
                        error: "Letter instance not found",
                    };
                }

                // Get leadership config
                const leadershipConfig = await prisma.letterConfig.findUnique({
                    where: { key: "WAKIL_DEKAN_1" },
                });

                // Initialize template service
                const templateService = new SuratRekomendasiTemplateService();

                // Get user signature if available
                let signatureUrl = undefined;
                if (letterInstance.createdBy) {
                    const userSignature = await prisma.userSignature.findFirst({
                        where: {
                            userId: letterInstance.createdBy.id,
                            isDefault: true,
                        },
                        orderBy: { createdAt: "desc" },
                    });

                    if (userSignature) {
                        signatureUrl = userSignature.url;
                    }
                }

                // Prepare data
                const templateData = {
                    letterInstanceId: letterInstance.id,
                    applicationData: letterInstance.values,
                    letterNumber: letterInstance.letterNumber || undefined,
                    signatureUrl: signatureUrl,
                };

                // Validate data
                const validation =
                    templateService.validateSuratRekomendasiData(templateData);
                if (!validation.valid) {
                    set.status = 400;
                    return {
                        success: false,
                        error: "Invalid template data",
                        details: validation.errors,
                    };
                }

                // Log generation start
                const generationLog = await prisma.documentGenerationLog.create(
                    {
                        data: {
                            templateId: template.id,
                            letterInstanceId: letterInstance.id,
                            generatedFormat: format as any,
                            status: "PENDING",
                        },
                    },
                );

                const startTime = Date.now();

                try {
                    // Generate document
                    const documentBuffer =
                        await templateService.generateSuratRekomendasi(
                            templateData,
                        );

                    const processingTime = Date.now() - startTime;
                    const fileSize = documentBuffer.length;

                    // Save document
                    const filename = `surat-rekomendasi-${letterInstance.id}-${Date.now()}.${format.toLowerCase()}`;
                    const filePath = join("uploads", "generated", filename);

                    // Ensure directory exists
                    const fs = require("fs");
                    const uploadDir = join(
                        process.cwd(),
                        "uploads",
                        "generated",
                    );
                    if (!fs.existsSync(uploadDir)) {
                        fs.mkdirSync(uploadDir, { recursive: true });
                    }

                    // 🧹 Cleanup old documents before creating new ones
                    console.log(
                        `🧹 [generate] Cleaning up old documents for: ${letterInstanceId}`,
                    );
                    await DocumentCleanupService.cleanupOldDocuments(
                        letterInstanceId,
                    );

                    writeFileSync(
                        join(process.cwd(), filePath),
                        documentBuffer,
                    );

                    // Update generation log
                    await prisma.documentGenerationLog.update({
                        where: { id: generationLog.id },
                        data: {
                            status: "SUCCESS",
                            fileSize,
                            filePath,
                            processingTimeMs: processingTime,
                        },
                    });

                    return {
                        success: true,
                        data: {
                            filename,
                            filePath,
                            fileSize,
                            processingTimeMs: processingTime,
                            downloadUrl: `/api/templates/download/${generationLog.id}`,
                        },
                    };
                } catch (error: any) {
                    // Update generation log with error
                    await prisma.documentGenerationLog.update({
                        where: { id: generationLog.id },
                        data: {
                            status: "FAILED",
                            errorMessage: error.message,
                            processingTimeMs: Date.now() - startTime,
                        },
                    });

                    throw error;
                }
            } catch (error: any) {
                console.error("Error generating document:", error);
                set.status = 500;
                return {
                    success: false,
                    error: error.message,
                };
            }
        },
        {
            params: t.Object({
                templateId: t.String(),
            }),
            body: t.Object({
                letterInstanceId: t.String(),
                format: t.Optional(
                    t.Union([t.Literal("DOCX"), t.Literal("PDF")]),
                ),
            }),
        },
    )

    // Download generated document
    .get(
        "/download/:logId",
        async ({ params: { logId }, set }) => {
            try {
                const log = await prisma.documentGenerationLog.findUnique({
                    where: { id: logId },
                    include: {
                        template: true,
                        letterInstance: true,
                    },
                });

                if (!log || !log.filePath) {
                    set.status = 404;
                    return {
                        success: false,
                        error: "File not found",
                    };
                }

                const fs = require("fs");
                const fullPath = join(process.cwd(), log.filePath);

                if (!fs.existsSync(fullPath)) {
                    set.status = 404;
                    return {
                        success: false,
                        error: "File not found on disk",
                    };
                }

                // Increment verified count if this is a verification
                await prisma.documentGenerationLog.update({
                    where: { id: logId },
                    data: {
                        // Could add download count here
                    },
                });

                const fileBuffer = fs.readFileSync(fullPath);
                const mimeType =
                    log.generatedFormat === "PDF"
                        ? "application/pdf"
                        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

                const filename = `surat-rekomendasi-${log.letterInstance.letterNumber || log.letterInstanceId}.${log.generatedFormat.toLowerCase()}`;

                set.headers = {
                    "Content-Type": mimeType,
                    "Content-Disposition": `attachment; filename="${filename}"`,
                    "Content-Length": fileBuffer.length.toString(),
                };

                return fileBuffer;
            } catch (error: any) {
                console.error("Error downloading document:", error);
                set.status = 500;
                return {
                    success: false,
                    error: error.message,
                };
            }
        },
        {
            params: t.Object({
                logId: t.String(),
            }),
        },
    )

    // Get template schema for validation
    .get(
        "/:id/schema",
        async ({ params: { id } }) => {
            try {
                const template = await prisma.documentTemplate.findUnique({
                    where: { id },
                    include: {
                        variables: true,
                    },
                });

                if (!template) {
                    return {
                        success: false,
                        error: "Template not found",
                    };
                }

                return {
                    success: true,
                    data: {
                        schema: template.schemaDefinition,
                        variables: template.variables,
                    },
                };
            } catch (error: any) {
                console.error("Error fetching template schema:", error);
                return {
                    success: false,
                    error: error.message,
                };
            }
        },
        {
            params: t.Object({
                id: t.String(),
            }),
        },
    )

    // Get generation logs for a letter instance
    .get(
        "/logs/letter/:letterInstanceId",
        async ({ params: { letterInstanceId } }) => {
            try {
                const logs = await prisma.documentGenerationLog.findMany({
                    where: { letterInstanceId },
                    include: {
                        template: true,
                    },
                    orderBy: { generatedAt: "desc" },
                });

                return {
                    success: true,
                    data: logs,
                };
            } catch (error: any) {
                console.error("Error fetching generation logs:", error);
                return {
                    success: false,
                    error: error.message,
                };
            }
        },
        {
            params: t.Object({
                letterInstanceId: t.String(),
            }),
        },
    )

    // Debug endpoint to test template service directly
    .post(
        "/debug-generate/:templateId",
        async ({ params: { templateId }, body, set }) => {
            try {
                const { templateData } = body;

                console.log(
                    "Debug generate started with data:",
                    JSON.stringify(templateData, null, 2),
                );

                // Get template info
                const template = await prisma.documentTemplate.findUnique({
                    where: { id: templateId },
                    include: { letterType: true },
                });

                if (!template) {
                    set.status = 404;
                    return {
                        success: false,
                        error: "Template not found",
                    };
                }

                console.log(
                    "Template found:",
                    template.name,
                    "Path:",
                    template.templatePath,
                );

                // Test DocumentTemplateService directly
                const {
                    DocumentTemplateService,
                } = require("../../services/template/DocumentTemplateService.js");
                const docService = new DocumentTemplateService();

                const templateFileName = template.templatePath;
                console.log(
                    "Attempting to generate with template:",
                    templateFileName,
                );

                const documentBuffer = await docService.generateDocument(
                    templateFileName,
                    templateData,
                );

                console.log(
                    "Document generated successfully, size:",
                    documentBuffer.length,
                );

                // Save for testing
                const filename = `debug-document-${Date.now()}.docx`;
                const filePath = `uploads/generated/${filename}`;
                const fs = require("fs");
                const uploadDir = join(process.cwd(), "uploads", "generated");

                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }

                writeFileSync(join(process.cwd(), filePath), documentBuffer);

                return {
                    success: true,
                    data: {
                        filename,
                        filePath,
                        templateUsed: templateFileName,
                        message:
                            "Document generated successfully in debug mode",
                        downloadUrl: `/api/templates/download-test/${filename}`,
                    },
                };
            } catch (error: any) {
                console.error("Debug generate error:", error);
                return {
                    success: false,
                    error: error.message,
                    stack: error.stack,
                };
            }
        },
        {
            params: t.Object({
                templateId: t.String(),
            }),
            body: t.Object({
                templateData: t.Object({
                    nama_lengkap: t.String(),
                    nim: t.String(),
                    tempat_lahir: t.String(),
                    tanggal_lahir: t.String(),
                    no_hp: t.String(),
                    program_studi: t.String(),
                    semester: t.String(),
                    ipk: t.String(),
                    ips: t.String(),
                    keperluan: t.String(),
                    nama_penandatangan: t.String(),
                    nip_penandatangan: t.String(),
                    nomor_surat: t.Optional(t.String()),
                    tahun_akademik: t.Optional(t.String()),
                }),
            }),
        },
    )

    // Test generate document (for development/testing)
    .post(
        "/test-generate/:templateId",
        async ({ params: { templateId }, body, set }) => {
            try {
                const { templateData } = body;

                // Get template
                const template = await prisma.documentTemplate.findUnique({
                    where: { id: templateId },
                    include: { letterType: true },
                });

                if (!template) {
                    set.status = 404;
                    return {
                        success: false,
                        error: "Template not found",
                    };
                }

                // Initialize template service
                const templateService = new SuratRekomendasiTemplateService();

                // Test data preparation without database dependency
                const testData = {
                    letterInstanceId: "test-" + Date.now(),
                    applicationData: templateData,
                    letterNumber: "TEST/UN7.F8.1/KM/01/2025",
                };

                // Generate document
                const documentBuffer =
                    await templateService.generateSuratRekomendasi(testData);

                if (!documentBuffer) {
                    set.status = 500;
                    return {
                        success: false,
                        error: "Failed to generate document",
                    };
                }

                // Save file for download
                const filename = `test-document-${Date.now()}.docx`;
                const filePath = `uploads/generated/${filename}`;
                const fs = require("fs");
                const uploadDir = join(process.cwd(), "uploads", "generated");

                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }

                writeFileSync(join(process.cwd(), filePath), documentBuffer);

                return {
                    success: true,
                    data: {
                        filename,
                        filePath,
                        templateName: template.name,
                        message: "Document generated successfully for testing",
                        downloadUrl: `/api/templates/download-test/${filename}`,
                    },
                };
            } catch (error: any) {
                console.error("Error in test generate:", error);
                set.status = 500;
                return {
                    success: false,
                    error: error.message,
                };
            }
        },
        {
            params: t.Object({
                templateId: t.String(),
            }),
            body: t.Object({
                templateData: t.Object({
                    nama_lengkap: t.String(),
                    nim: t.String(),
                    tempat_lahir: t.String(),
                    tanggal_lahir: t.String(),
                    no_hp: t.String(),
                    program_studi: t.String(),
                    semester: t.String(),
                    ipk: t.String(),
                    ips: t.String(),
                    keperluan: t.String(),
                    nama_penandatangan: t.String(),
                    nip_penandatangan: t.String(),
                    nomor_surat: t.Optional(t.String()),
                    tahun_akademik: t.Optional(t.String()),
                }),
            }),
        },
    )

    // Download test generated file
    .get(
        "/download-test/:filename",
        async ({ params: { filename }, set }) => {
            try {
                const filePath = join(
                    process.cwd(),
                    "uploads",
                    "generated",
                    filename,
                );
                const fs = require("fs");

                if (!fs.existsSync(filePath)) {
                    set.status = 404;
                    return {
                        success: false,
                        error: "File not found",
                    };
                }

                const fileBuffer = fs.readFileSync(filePath);
                set.headers["content-type"] =
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                set.headers["content-disposition"] =
                    `attachment; filename="${filename}"`;

                return new Response(fileBuffer);
            } catch (error: any) {
                console.error("Error downloading test file:", error);
                set.status = 500;
                return {
                    success: false,
                    error: error.message,
                };
            }
        },
        {
            params: t.Object({
                filename: t.String(),
            }),
        },
    )

    // Get pre-generated document for a letter instance (auto-generated during approval)
    .get(
        "/letter/:letterInstanceId/download",
        async ({ params: { letterInstanceId }, set }) => {
            try {
                // Find latest generation log for this letter instance
                const log = await prisma.documentGenerationLog.findFirst({
                    where: { letterInstanceId },
                    orderBy: { generatedAt: "desc" },
                });

                if (!log || !log.filePath) {
                    set.status = 404;
                    return {
                        success: false,
                        error: "Document not found. It may still be generating.",
                    };
                }

                // Get letter instance data for filename
                const letterInstance = await prisma.letterInstance.findUnique({
                    where: { id: letterInstanceId },
                    include: {
                        createdBy: {
                            include: {
                                mahasiswa: true,
                            },
                        },
                    },
                });

                const fs = require("fs");
                const fullPath = join(process.cwd(), log.filePath);

                if (!fs.existsSync(fullPath)) {
                    set.status = 404;
                    return {
                        success: false,
                        error: "File not found on disk",
                    };
                }

                const fileBuffer = fs.readFileSync(fullPath);
                const mimeType =
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

                // Generate formal filename: surat-rekomendasi_{nama}_{nim}_{beasiswa}.docx
                const studentName =
                    letterInstance?.createdBy?.name || "unknown";
                const nim =
                    letterInstance?.createdBy?.mahasiswa?.nim || "unknown";
                const scholarshipName =
                    letterInstance?.scholarshipName ||
                    (letterInstance?.values as any)?.namaBeasiswa ||
                    "beasiswa";

                // Sanitize filename: remove special chars, replace spaces with underscores
                const sanitize = (str: string) =>
                    str
                        .toLowerCase()
                        .replace(/[^a-z0-9\s]/gi, "")
                        .replace(/\s+/g, "_")
                        .substring(0, 50); // Limit length

                const filename = `surat-rekomendasi_${sanitize(studentName)}_${sanitize(nim)}_${sanitize(scholarshipName)}.docx`;

                set.headers = {
                    "Content-Type": mimeType,
                    "Content-Disposition": `attachment; filename="${filename}"`,
                    "Content-Length": fileBuffer.length.toString(),
                    // Allow CORS for frontend filename extraction
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Expose-Headers":
                        "Content-Disposition, Content-Length",
                };

                return fileBuffer;
            } catch (error: any) {
                console.error(
                    "Error downloading pre-generated document:",
                    error,
                );
                set.status = 500;
                return {
                    success: false,
                    error: error.message,
                };
            }
        },
        {
            params: t.Object({
                letterInstanceId: t.String(),
            }),
        },
    )

    // 🔴 PREVIEW DOCX - Get pre-generated document for preview in browser
    // This endpoint returns the DOCX file with inline disposition so it can be previewed
    .get(
        "/letter/:letterInstanceId/preview",
        async ({ params: { letterInstanceId }, set }) => {
            try {
                console.log(
                    `📄 [preview] Fetching preview for: ${letterInstanceId}`,
                );

                // Find latest generation log for this letter instance
                const log = await prisma.documentGenerationLog.findFirst({
                    where: { letterInstanceId },
                    orderBy: { generatedAt: "desc" },
                });

                if (!log || !log.filePath) {
                    console.log(
                        `❌ [preview] No log found for: ${letterInstanceId}`,
                    );
                    set.status = 404;
                    return {
                        success: false,
                        error: "Document not found. It may still be generating or the application hasn't been submitted yet.",
                    };
                }

                console.log(
                    `📁 [preview] Found log, file path: ${log.filePath}`,
                );

                // Get letter instance data for filename
                const letterInstance = await prisma.letterInstance.findUnique({
                    where: { id: letterInstanceId },
                    include: {
                        createdBy: {
                            include: {
                                mahasiswa: true,
                            },
                        },
                    },
                });

                const fs = require("fs");
                const fullPath = join(process.cwd(), log.filePath);

                if (!fs.existsSync(fullPath)) {
                    console.log(
                        `❌ [preview] File not found on disk: ${fullPath}`,
                    );
                    set.status = 404;
                    return {
                        success: false,
                        error: "File not found on disk. Please try again later.",
                    };
                }

                const fileBuffer = fs.readFileSync(fullPath);
                console.log(
                    `✅ [preview] File loaded, size: ${fileBuffer.length} bytes`,
                );

                const mimeType =
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

                // Generate formal filename: surat-rekomendasi_{nama}_{nim}_{beasiswa}.docx
                const studentName =
                    letterInstance?.createdBy?.name || "unknown";
                const nim =
                    letterInstance?.createdBy?.mahasiswa?.nim || "unknown";
                const scholarshipName =
                    letterInstance?.scholarshipName ||
                    (letterInstance?.values as any)?.namaBeasiswa ||
                    "beasiswa";

                // Sanitize filename: remove special chars, replace spaces with underscores
                const sanitize = (str: string) =>
                    str
                        .toLowerCase()
                        .replace(/[^a-z0-9\s]/gi, "")
                        .replace(/\s+/g, "_")
                        .substring(0, 50);

                const filename = `surat-rekomendasi_${sanitize(studentName)}_${sanitize(nim)}_${sanitize(scholarshipName)}.docx`;

                // Use inline disposition for preview (not download)
                set.headers = {
                    "Content-Type": mimeType,
                    "Content-Disposition": `inline; filename="${filename}"`,
                    "Content-Length": fileBuffer.length.toString(),
                    // Allow CORS for frontend preview
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Expose-Headers":
                        "Content-Disposition, Content-Length",
                };

                return fileBuffer;
            } catch (error: any) {
                console.error(
                    "❌ [preview] Error fetching document for preview:",
                    error,
                );
                set.status = 500;
                return {
                    success: false,
                    error: error.message,
                };
            }
        },
        {
            params: t.Object({
                letterInstanceId: t.String(),
            }),
        },
    )

    // 🔴 Check if DOCX preview is available for a letter instance
    .get(
        "/letter/:letterInstanceId/preview-status",
        async ({ params: { letterInstanceId } }) => {
            try {
                const log = await prisma.documentGenerationLog.findFirst({
                    where: { letterInstanceId },
                    orderBy: { generatedAt: "desc" },
                });

                if (!log || !log.filePath) {
                    return {
                        success: true,
                        data: {
                            available: false,
                            reason: "not_generated",
                        },
                    };
                }

                const fs = require("fs");
                const fullPath = join(process.cwd(), log.filePath);

                if (!fs.existsSync(fullPath)) {
                    return {
                        success: true,
                        data: {
                            available: false,
                            reason: "file_missing",
                        },
                    };
                }

                return {
                    success: true,
                    data: {
                        available: true,
                        generatedAt: log.generatedAt,
                        fileSize: log.fileSize,
                        previewUrl: `/api/templates/letter/${letterInstanceId}/preview`,
                        downloadUrl: `/api/templates/letter/${letterInstanceId}/download`,
                    },
                };
            } catch (error: any) {
                console.error("Error checking preview status:", error);
                return {
                    success: false,
                    error: error.message,
                };
            }
        },
        {
            params: t.Object({
                letterInstanceId: t.String(),
            }),
        },
    )

    // 🔴 Get PDF for a letter instance (converts from DOCX)
    .get(
        "/letter/:letterInstanceId/pdf",
        async ({ params: { letterInstanceId }, set }) => {
            try {
                // Find latest generation log
                const log = await prisma.documentGenerationLog.findFirst({
                    where: { letterInstanceId },
                    orderBy: { generatedAt: "desc" },
                });

                if (!log || !log.filePath) {
                    set.status = 404;
                    return {
                        success: false,
                        error: "Document not found. It may still be generating.",
                    };
                }

                const fs = require("fs");
                const fullPath = join(process.cwd(), log.filePath);

                if (!fs.existsSync(fullPath)) {
                    set.status = 404;
                    return {
                        success: false,
                        error: "File not found on disk",
                    };
                }

                // Check if PDF conversion is available
                if (!pdfConversionService.isAvailable()) {
                    set.status = 503;
                    return {
                        success: false,
                        error: "PDF conversion service is not available (LibreOffice not found)",
                    };
                }

                // Convert to PDF
                const pdfPath =
                    await pdfConversionService.getPdfForDocx(fullPath);

                const fileBuffer = fs.readFileSync(pdfPath);

                // Get letter instance data for filename
                const letterInstance = await prisma.letterInstance.findUnique({
                    where: { id: letterInstanceId },
                    include: {
                        createdBy: {
                            include: {
                                mahasiswa: true,
                            },
                        },
                    },
                });

                // Generate formal filename
                const studentName =
                    letterInstance?.createdBy?.name || "unknown";
                const nim =
                    letterInstance?.createdBy?.mahasiswa?.nim || "unknown";
                const scholarshipName =
                    letterInstance?.scholarshipName ||
                    (letterInstance?.values as any)?.namaBeasiswa ||
                    "beasiswa";

                const sanitize = (str: string) =>
                    str
                        .toLowerCase()
                        .replace(/[^a-z0-9\s]/gi, "")
                        .replace(/\s+/g, "_")
                        .substring(0, 50);

                const filename = `surat-rekomendasi_${sanitize(studentName)}_${sanitize(nim)}_${sanitize(scholarshipName)}.pdf`;

                set.headers = {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": `inline; filename="${filename}"`,
                    "Content-Length": fileBuffer.length.toString(),
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Expose-Headers":
                        "Content-Disposition, Content-Length",
                };

                return fileBuffer;
            } catch (error: any) {
                console.error("Error generating PDF:", error);
                set.status = 500;
                return {
                    success: false,
                    error: error.message,
                };
            }
        },
        {
            params: t.Object({
                letterInstanceId: t.String(),
            }),
        },
    )

    // 🔴 Trigger on-demand DOCX generation for a letter instance
    // Used when document wasn't auto-generated or needs to be regenerated
    .post(
        "/letter/:letterInstanceId/generate",
        async ({ params: { letterInstanceId }, set }) => {
            try {
                // Get letter instance with all needed data
                const letterInstance = await prisma.letterInstance.findUnique({
                    where: { id: letterInstanceId },
                    include: {
                        createdBy: {
                            include: {
                                mahasiswa: {
                                    include: {
                                        departemen: true,
                                        programStudi: true,
                                    },
                                },
                                pegawai: true,
                            },
                        },
                        stamp: true,
                        letterType: true,
                    },
                });

                if (!letterInstance) {
                    set.status = 404;
                    return {
                        success: false,
                        error: "Letter instance not found",
                    };
                }

                // Get template
                const template = await prisma.documentTemplate.findFirst({
                    where: {
                        isActive: true,
                        letterTypeId: letterInstance.letterTypeId,
                    },
                });

                if (!template) {
                    set.status = 404;
                    return {
                        success: false,
                        error: "Template not found for this letter type",
                    };
                }

                // Get leadership config
                const leadershipConfig = await prisma.letterConfig.findUnique({
                    where: { key: "WAKIL_DEKAN_1" },
                });

                // Get WD1 signature if applicable (step >= 4)
                let signatureUrl = undefined;
                const letterValues = (letterInstance.values as any) || {};

                if (letterValues.wd1_signature) {
                    signatureUrl = letterValues.wd1_signature;
                } else if (
                    letterInstance.currentStep &&
                    letterInstance.currentStep >= 4
                ) {
                    const wd1Users = await prisma.userRole.findMany({
                        where: { role: { name: "WAKIL_DEKAN_1" } },
                        include: { user: true },
                    });

                    if (wd1Users.length > 0) {
                        const firstWd1User = wd1Users[0];
                        if (firstWd1User) {
                            const wd1Signature =
                                await prisma.userSignature.findFirst({
                                    where: {
                                        userId: firstWd1User.userId,
                                        isDefault: true,
                                    },
                                    orderBy: { createdAt: "desc" },
                                });

                            if (wd1Signature) {
                                signatureUrl = wd1Signature.url;
                            }
                        }
                    }
                }

                // Get stamp URL
                let stampUrl = undefined;
                if (letterInstance.stamp) {
                    stampUrl = letterInstance.stamp.url;
                }

                // Prepare template data
                const mahasiswa = letterInstance.createdBy?.mahasiswa;
                const templateData = {
                    letterInstanceId: letterInstance.id,
                    applicationData: {
                        ...letterValues,
                        namaLengkap:
                            letterInstance.createdBy?.name ||
                            letterValues.namaLengkap,
                        nim: mahasiswa?.nim || letterValues.nim,
                        tempatLahir:
                            mahasiswa?.tempatLahir || letterValues.tempatLahir,
                        tanggalLahir:
                            mahasiswa?.tanggalLahir ||
                            letterValues.tanggalLahir,
                        noHp: mahasiswa?.noHp || letterValues.noHp,
                        semester: mahasiswa?.semester || letterValues.semester,
                        ipk: mahasiswa?.ipk || letterValues.ipk,
                        ips: mahasiswa?.ips || letterValues.ips,
                        departemen:
                            mahasiswa?.departemen?.name ||
                            letterValues.departemen ||
                            letterValues.jurusan,
                        programStudi:
                            mahasiswa?.programStudi?.name ||
                            letterValues.programStudi ||
                            letterValues.prodi,
                    },
                    letterNumber: letterInstance.letterNumber || undefined,
                    signatureUrl: signatureUrl,
                    stampUrl: stampUrl,
                    publishedAt: letterInstance.publishedAt || undefined,
                    leadershipConfig: leadershipConfig
                        ? {
                              name: (leadershipConfig.value as any)?.name || "",
                              nip: (leadershipConfig.value as any)?.nip || "",
                              jabatan:
                                  (leadershipConfig.value as any)?.jabatan ||
                                  "",
                          }
                        : undefined,
                };

                // Initialize template service
                const templateService = new SuratRekomendasiTemplateService();

                // Generate document
                const startTime = Date.now();
                const documentBuffer =
                    await templateService.generateSuratRekomendasi(
                        templateData,
                    );
                const processingTimeMs = Date.now() - startTime;

                // Save generated file
                const fs = require("fs");
                const filename = `surat-rekomendasi-${letterInstance.id}-${Date.now()}.docx`;
                const filePath = join("uploads", "generated", filename);

                const uploadDir = join(process.cwd(), "uploads", "generated");
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }

                // 🧹 Cleanup old documents before creating new ones
                console.log(
                    `🧹 [letter/generate] Cleaning up old documents for: ${letterInstanceId}`,
                );
                await DocumentCleanupService.cleanupOldDocuments(
                    letterInstanceId,
                );

                writeFileSync(join(process.cwd(), filePath), documentBuffer);

                // Delete old generation log if exists (this is now redundant since cleanup already handles this)
                await prisma.documentGenerationLog.deleteMany({
                    where: { letterInstanceId },
                });

                // Create new generation log
                await prisma.documentGenerationLog.create({
                    data: {
                        templateId: template.id,
                        letterInstanceId: letterInstance.id,
                        generatedFormat: "DOCX",
                        status: "SUCCESS",
                        filePath,
                        fileSize: documentBuffer.length,
                        processingTimeMs,
                    },
                });

                console.log(
                    `✅ [on-demand generate] Document generated for: ${letterInstanceId}`,
                );

                return {
                    success: true,
                    data: {
                        filePath,
                        fileSize: documentBuffer.length,
                        processingTimeMs,
                    },
                };
            } catch (error: any) {
                console.error("Error generating document on-demand:", error);
                set.status = 500;
                return {
                    success: false,
                    error: error.message,
                };
            }
        },
        {
            params: t.Object({
                letterInstanceId: t.String(),
            }),
        },
    );

export default templatesRoute;
