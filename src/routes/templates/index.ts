import { Elysia, t } from "elysia";
import { Prisma } from "../../db/index.js";
import { pdfConversionService } from "../../services/pdf/PdfConversionService.js";
import { SuratRekomendasiTemplateService } from "../../services/template/index.js";
import { DocumentCleanupService } from "../../services/DocumentCleanupService.js";
import { MinioService } from "../../shared/services/minio.service.js";
import { writeFileSync } from "fs";
import { join } from "path";

const prisma = Prisma;

export const templatesRoute = new Elysia({ prefix: "/templates" })

  // Ambil semua template dokumen
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

  // Ambil template berdasarkan nama jenis surat
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

  // Ambil template spesifik berdasarkan ID
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

  // Generate dokumen dari template
  .post(
    "/generate/:templateId",
    async ({ params: { templateId }, body, set }) => {
      try {
        const { letterInstanceId, format = "DOCX" } = body;

        // Ambil template
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

        // Ambil letter instance
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
          },
        });

        if (!letterInstance) {
          set.status = 404;
          return {
            success: false,
            error: "Letter instance not found",
          };
        }

        // Ambil konfigurasi pimpinan
        const leadershipConfig = await prisma.letterConfig.findUnique({
          where: { key: "WAKIL_DEKAN_1" },
        });

        // Inisialisasi service template
        const templateService = new SuratRekomendasiTemplateService();

        // Ambil tanda tangan WD1 (bukan tanda tangan mahasiswa)
        let signatureUrl = undefined;
        const letterValues = (letterInstance.values as any) || {};

        if (letterValues.wd1_signature) {
          try {
            signatureUrl = await MinioService.refreshPresignedUrl(
              letterValues.wd1_signature,
            );
          } catch {
            signatureUrl = letterValues.wd1_signature;
          }
        } else if (
          letterInstance.currentStep &&
          letterInstance.currentStep >= 4
        ) {
          try {
            const wd1Users = await prisma.userRole.findMany({
              where: { role: { name: "WAKIL_DEKAN_1" } },
              include: { user: true },
            });

            if (wd1Users.length > 0 && wd1Users[0]) {
              const wd1Signature = await prisma.userSignature.findFirst({
                where: {
                  userId: wd1Users[0].userId,
                  isDefault: true,
                },
                orderBy: { createdAt: "desc" },
              });

              if (wd1Signature) {
                try {
                  signatureUrl = await MinioService.refreshPresignedUrl(
                    wd1Signature.url,
                  );
                } catch {
                  signatureUrl = wd1Signature.url;
                }
              }
            }
          } catch (err) {
            console.warn("⚠️ [generate] Failed to get WD1 signature:", err);
          }
        }

        // Ambil URL stempel dari letterInstance
        let stampUrl = undefined;
        if (letterInstance.stamp) {
          try {
            stampUrl = await MinioService.refreshPresignedUrl(
              letterInstance.stamp.url,
            );
          } catch {
            stampUrl = letterInstance.stamp.url;
          }
        }

        // Siapkan data dengan semua field yang dibutuhkan
        const mahasiswa = letterInstance.createdBy?.mahasiswa;
        const templateData = {
          letterInstanceId: letterInstance.id,
          applicationData: {
            namaLengkap: letterInstance.createdBy?.name || "",
            email: letterInstance.createdBy?.email || "",
            nim: mahasiswa?.nim || "",
            departemen: mahasiswa?.departemen?.name || "",
            programStudi: mahasiswa?.programStudi?.name || "",
            tempatLahir: mahasiswa?.tempatLahir || "",
            tanggalLahir: mahasiswa?.tanggalLahir || "",
            noHp: mahasiswa?.noHp || "",
            semester: mahasiswa?.semester ? String(mahasiswa.semester) : "",
            ipk: mahasiswa?.ipk ? String(mahasiswa.ipk) : "",
            ips: mahasiswa?.ips ? String(mahasiswa.ips) : "",
            ...letterValues,
            namaBeasiswa: letterInstance.scholarshipName,
          },
          letterNumber: letterInstance.letterNumber || undefined,
          signatureUrl: signatureUrl,
          stampUrl: stampUrl,
          publishedAt: letterInstance.publishedAt || undefined,
          jenis: letterValues.jenisBeasiswa || undefined,
          leadershipConfig: leadershipConfig
            ? {
                name: (leadershipConfig.value as any)?.name || "",
                nip: (leadershipConfig.value as any)?.nip || "",
                jabatan: (leadershipConfig.value as any)?.jabatan || "",
              }
            : undefined,
        };

        // Validasi data
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

        // Catat awal proses generate
        const generationLog = await prisma.documentGenerationLog.create({
          data: {
            templateId: template.id,
            letterInstanceId: letterInstance.id,
            generatedFormat: format as any,
            status: "PENDING",
          },
        });

        const startTime = Date.now();

        try {
          // Generate dokumen
          const documentBuffer =
            await templateService.generateSuratRekomendasi(templateData);

          const processingTime = Date.now() - startTime;
          const fileSize = documentBuffer.length;

          // Simpan dokumen
          const filename = `surat-rekomendasi-${letterInstance.id}-${Date.now()}.${format.toLowerCase()}`;
          const filePath = join("uploads", "generated", filename);

          // Pastikan direktori tersedia
          const fs = require("fs");
          const uploadDir = join(process.cwd(), "uploads", "generated");
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }

          // Bersihkan dokumen lama sebelum membuat dokumen baru
          console.log(
            `🧹 [generate] Cleaning up old documents for: ${letterInstanceId}`,
          );
          await DocumentCleanupService.cleanupOldDocuments(letterInstanceId);

          writeFileSync(join(process.cwd(), filePath), documentBuffer);

          // Perbarui log generate
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
          // Perbarui log generate dengan informasi error
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
        format: t.Optional(t.Union([t.Literal("DOCX"), t.Literal("PDF")])),
      }),
    },
  )

  // Unduh dokumen hasil generate
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

        // Tambahkan hitungan verifikasi jika diperlukan
        await prisma.documentGenerationLog.update({
          where: { id: logId },
          data: {
            // Dapat menambahkan hitungan unduh di sini
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

  // Ambil schema template untuk validasi
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

  // Ambil log generate untuk satu letter instance
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

  // Endpoint debug untuk menguji template service secara langsung
  .post(
    "/debug-generate/:templateId",
    async ({ params: { templateId }, body, set }) => {
      try {
        const { templateData } = body;

        console.log(
          "Debug generate started with data:",
          JSON.stringify(templateData, null, 2),
        );

        // Ambil informasi template
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

        // Uji DocumentTemplateService secara langsung
        const {
          DocumentTemplateService,
        } = require("../../services/template/DocumentTemplateService.js");
        const docService = new DocumentTemplateService();

        const templateFileName = template.templatePath;
        console.log("Attempting to generate with template:", templateFileName);

        const documentBuffer = await docService.generateDocument(
          templateFileName,
          templateData,
        );

        console.log(
          "Document generated successfully, size:",
          documentBuffer.length,
        );

        // Simpan hasil untuk pengujian
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
            message: "Document generated successfully in debug mode",
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

  // Uji generate dokumen (untuk development/testing)
  .post(
    "/test-generate/:templateId",
    async ({ params: { templateId }, body, set }) => {
      try {
        const { templateData } = body;

        // Ambil template
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

        // Inisialisasi service template
        const templateService = new SuratRekomendasiTemplateService();

        // Siapkan data uji tanpa ketergantungan database
        const testData = {
          letterInstanceId: "test-" + Date.now(),
          applicationData: templateData,
          letterNumber: "TEST/UN7.F8.1/KM/01/2025",
        };

        // Generate dokumen
        const documentBuffer =
          await templateService.generateSuratRekomendasi(testData);

        if (!documentBuffer) {
          set.status = 500;
          return {
            success: false,
            error: "Failed to generate document",
          };
        }

        // Simpan file untuk diunduh
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

  // Unduh file hasil generate untuk pengujian
  .get(
    "/download-test/:filename",
    async ({ params: { filename }, set }) => {
      try {
        const filePath = join(process.cwd(), "uploads", "generated", filename);
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

  // Ambil dokumen yang sudah digenerate untuk letter instance (auto-generate saat approval)
  .get(
    "/letter/:letterInstanceId/download",
    async ({ params: { letterInstanceId }, set }) => {
      try {
        // Cari log generate terbaru untuk letter instance ini
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

        // Ambil data letter instance untuk nama file
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

        // Bentuk nama file formal: surat-rekomendasi_{nama}_{nim}_{beasiswa}.docx
        const studentName = letterInstance?.createdBy?.name || "unknown";
        const nim = letterInstance?.createdBy?.mahasiswa?.nim || "unknown";
        const scholarshipName =
          letterInstance?.scholarshipName ||
          (letterInstance?.values as any)?.namaBeasiswa ||
          "beasiswa";

        // Sanitasi nama file: hapus karakter khusus, ganti spasi menjadi underscore
        const sanitize = (str: string) =>
          str
            .toLowerCase()
            .replace(/[^a-z0-9\s]/gi, "")
            .replace(/\s+/g, "_")
            .substring(0, 50); // Batasi panjang

        const filename = `surat-rekomendasi_${sanitize(studentName)}_${sanitize(nim)}_${sanitize(scholarshipName)}.docx`;

        set.headers = {
          "Content-Type": mimeType,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Length": fileBuffer.length.toString(),
          // Izinkan CORS agar frontend bisa membaca nama file
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers":
            "Content-Disposition, Content-Length",
        };

        return fileBuffer;
      } catch (error: any) {
        console.error("Error downloading pre-generated document:", error);
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

  // Preview DOCX - Ambil dokumen yang sudah digenerate untuk pratinjau di browser
  // Endpoint ini mengembalikan file DOCX dengan disposition inline agar bisa dipratinjau
  .get(
    "/letter/:letterInstanceId/preview",
    async ({ params: { letterInstanceId }, set }) => {
      try {
        console.log(`📄 [preview] Fetching preview for: ${letterInstanceId}`);

        // Cari log generate terbaru untuk letter instance ini
        const log = await prisma.documentGenerationLog.findFirst({
          where: { letterInstanceId },
          orderBy: { generatedAt: "desc" },
        });

        if (!log || !log.filePath) {
          console.log(`❌ [preview] No log found for: ${letterInstanceId}`);
          set.status = 404;
          return {
            success: false,
            error:
              "Document not found. It may still be generating or the application hasn't been submitted yet.",
          };
        }

        console.log(`📁 [preview] Found log, file path: ${log.filePath}`);

        // Ambil data letter instance untuk nama file
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
          console.log(`❌ [preview] File not found on disk: ${fullPath}`);
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

        // Bentuk nama file formal: surat-rekomendasi_{nama}_{nim}_{beasiswa}.docx
        const studentName = letterInstance?.createdBy?.name || "unknown";
        const nim = letterInstance?.createdBy?.mahasiswa?.nim || "unknown";
        const scholarshipName =
          letterInstance?.scholarshipName ||
          (letterInstance?.values as any)?.namaBeasiswa ||
          "beasiswa";

        // Sanitasi nama file: hapus karakter khusus, ganti spasi menjadi underscore
        const sanitize = (str: string) =>
          str
            .toLowerCase()
            .replace(/[^a-z0-9\s]/gi, "")
            .replace(/\s+/g, "_")
            .substring(0, 50);

        const filename = `surat-rekomendasi_${sanitize(studentName)}_${sanitize(nim)}_${sanitize(scholarshipName)}.docx`;

        // Gunakan disposition inline untuk pratinjau (bukan unduh)
        set.headers = {
          "Content-Type": mimeType,
          "Content-Disposition": `inline; filename="${filename}"`,
          "Content-Length": fileBuffer.length.toString(),
          // Izinkan CORS untuk kebutuhan pratinjau frontend
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

  // Cek ketersediaan pratinjau DOCX untuk letter instance
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

  // Ambil PDF untuk letter instance (konversi dari DOCX)
  .get(
    "/letter/:letterInstanceId/pdf",
    async ({ params: { letterInstanceId }, set }) => {
      try {
        // Cari log generate terbaru
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

        // Cek apakah layanan konversi PDF tersedia
        if (!pdfConversionService.isAvailable()) {
          set.status = 503;
          return {
            success: false,
            error:
              "PDF conversion service is not available (LibreOffice not found)",
          };
        }

        // Konversi ke PDF
        const pdfPath = await pdfConversionService.getPdfForDocx(fullPath);

        const fileBuffer = fs.readFileSync(pdfPath);

        // Ambil data letter instance untuk nama file
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

        // Bentuk nama file formal
        const studentName = letterInstance?.createdBy?.name || "unknown";
        const nim = letterInstance?.createdBy?.mahasiswa?.nim || "unknown";
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

  // Trigger generate DOCX on-demand untuk letter instance
  // Digunakan saat dokumen belum auto-generate atau perlu generate ulang
  .post(
    "/letter/:letterInstanceId/generate",
    async ({ params: { letterInstanceId }, set }) => {
      try {
        // Ambil letter instance dengan semua data yang dibutuhkan
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

        // Ambil template
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

        // Ambil konfigurasi pimpinan
        const leadershipConfig = await prisma.letterConfig.findUnique({
          where: { key: "WAKIL_DEKAN_1" },
        });

        // Ambil tanda tangan WD1 jika berlaku (step >= 4)
        let signatureUrl = undefined;
        const letterValues = (letterInstance.values as any) || {};

        if (letterValues.wd1_signature) {
          try {
            signatureUrl = await MinioService.refreshPresignedUrl(
              letterValues.wd1_signature,
            );
          } catch {
            signatureUrl = letterValues.wd1_signature;
          }
        } else if (
          letterInstance.currentStep &&
          letterInstance.currentStep >= 4
        ) {
          try {
            const wd1Users = await prisma.userRole.findMany({
              where: { role: { name: "WAKIL_DEKAN_1" } },
              include: { user: true },
            });

            if (wd1Users.length > 0) {
              const firstWd1User = wd1Users[0];
              if (firstWd1User) {
                const wd1Signature = await prisma.userSignature.findFirst({
                  where: {
                    userId: firstWd1User.userId,
                    isDefault: true,
                  },
                  orderBy: { createdAt: "desc" },
                });

                if (wd1Signature) {
                  try {
                    signatureUrl = await MinioService.refreshPresignedUrl(
                      wd1Signature.url,
                    );
                  } catch {
                    signatureUrl = wd1Signature.url;
                  }
                }
              }
            }
          } catch (err) {
            console.warn(
              "⚠️ [letter/generate] Failed to get WD1 signature:",
              err,
            );
          }
        }

        // Ambil URL stempel
        let stampUrl = undefined;
        if (letterInstance.stamp) {
          try {
            stampUrl = await MinioService.refreshPresignedUrl(
              letterInstance.stamp.url,
            );
          } catch {
            stampUrl = letterInstance.stamp.url;
          }
        }

        // Siapkan data template
        const mahasiswa = letterInstance.createdBy?.mahasiswa;
        const templateData = {
          letterInstanceId: letterInstance.id,
          applicationData: {
            ...letterValues,
            namaLengkap:
              letterInstance.createdBy?.name || letterValues.namaLengkap,
            nim: mahasiswa?.nim || letterValues.nim,
            tempatLahir: mahasiswa?.tempatLahir || letterValues.tempatLahir,
            tanggalLahir: mahasiswa?.tanggalLahir || letterValues.tanggalLahir,
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
          jenis: letterValues.jenisBeasiswa || undefined,
          leadershipConfig: leadershipConfig
            ? {
                name: (leadershipConfig.value as any)?.name || "",
                nip: (leadershipConfig.value as any)?.nip || "",
                jabatan: (leadershipConfig.value as any)?.jabatan || "",
              }
            : undefined,
        };

        // Inisialisasi service template
        const templateService = new SuratRekomendasiTemplateService();

        // Generate dokumen
        const startTime = Date.now();
        const documentBuffer =
          await templateService.generateSuratRekomendasi(templateData);
        const processingTimeMs = Date.now() - startTime;

        // Simpan file hasil generate
        const fs = require("fs");
        const filename = `surat-rekomendasi-${letterInstance.id}-${Date.now()}.docx`;
        const filePath = join("uploads", "generated", filename);

        const uploadDir = join(process.cwd(), "uploads", "generated");
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Bersihkan dokumen lama sebelum membuat dokumen baru
        console.log(
          `🧹 [letter/generate] Cleaning up old documents for: ${letterInstanceId}`,
        );
        await DocumentCleanupService.cleanupOldDocuments(letterInstanceId);

        writeFileSync(join(process.cwd(), filePath), documentBuffer);

        // Hapus log generate lama jika ada (redundan karena cleanup juga menangani ini)
        await prisma.documentGenerationLog.deleteMany({
          where: { letterInstanceId },
        });

        // Buat log generate baru
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
