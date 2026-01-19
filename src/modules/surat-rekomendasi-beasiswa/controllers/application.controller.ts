import { Prisma } from "../../../db/index.ts";
import { MinioService } from "../../../shared/services/minio.service.ts";

const db = Prisma;

export class ApplicationController {
    static async createApplication({ body, set }: { body: any; set: any }) {
        try {
            const { namaBeasiswa, values } = body;
            // ... (start of file)

            // Find default user (from seed) untuk development
            // TODO: Replace dengan actual authenticated user dari session
            const defaultUser = await db.user.findFirst({
                where: { email: "admin@university.ac.id" },
            });

            if (!defaultUser) {
                set.status = 500;
                return {
                    error: "Default user not found. Please run database seed first (bun run prisma db seed).",
                };
            }

            // Verify letterType exists
            const letterType = await db.letterType.findUnique({
                where: { id: "surat-rekomendasi-beasiswa" },
            });

            if (!letterType) {
                set.status = 500;
                return {
                    error: "LetterType 'surat-rekomendasi-beasiswa' not found. Please run database seed first.",
                };
            }

            // Create LetterInstance
            const letterInstance = await db.letterInstance.create({
                data: {
                    schema: {}, // Empty schema for now (will be populated later)
                    scholarshipName: namaBeasiswa,
                    values: values || {}, // JSON dengan ipk, ips, noHp, dll
                    status: "PENDING",
                    currentStep: 1,
                    letterTypeId: letterType.id,
                    createdById: defaultUser.id,
                },
            });

            set.status = 201;
            return {
                success: true,
                data: {
                    id: letterInstance.id,
                    scholarshipName: letterInstance.scholarshipName,
                    status: letterInstance.status,
                    createdAt: letterInstance.createdAt,
                },
            };
        } catch (error) {
            console.error("Create application error:", error);
            set.status = 500;
            return {
                error:
                    error instanceof Error
                        ? error.message
                        : "Internal server error",
            };
        }
    }

    static async listApplications({ set }: { set: any }) {
        try {
            const applications = await db.letterInstance.findMany({
                where: {
                    letterTypeId: "surat-rekomendasi-beasiswa",
                },
                orderBy: { createdAt: "desc" },
                include: {
                    attachments: {
                        where: { deletedAt: null },
                    },
                    createdBy: {
                        include: {
                            mahasiswa: {
                                include: {
                                    departemen: true,
                                    programStudi: true,
                                },
                            },
                        },
                    },
                },
            });

            return {
                success: true,
                data: applications.map((app: any) => {
                    const mahasiswa = app.createdBy?.mahasiswa;
                    const values =
                        app.values && typeof app.values === "object"
                            ? app.values
                            : {};

                    return {
                        id: app.id,
                        scholarshipName: app.scholarshipName,
                        status: app.status,
                        currentStep: app.currentStep,
                        formData: {
                            namaLengkap: app.createdBy?.name || "",
                            email: app.createdBy?.email || "",
                            nim: mahasiswa?.nim || (values as any).nim || "",
                            departemen:
                                mahasiswa?.departemen?.name ||
                                (values as any).departemen ||
                                "",
                            programStudi:
                                mahasiswa?.programStudi?.name ||
                                (values as any).programStudi ||
                                "",
                            tempatLahir:
                                mahasiswa?.tempatLahir ||
                                (values as any).tempatLahir ||
                                "",
                            tanggalLahir:
                                mahasiswa?.tanggalLahir ||
                                (values as any).tanggalLahir ||
                                "",
                            noHp: (values as any).noHp || "",
                            ipk: (values as any).ipk || "",
                            ips: (values as any).ips || "",
                        },
                        attachmentsCount: app.attachments.length,
                        createdAt: app.createdAt,
                        updatedAt: app.updatedAt,
                    };
                }),
            };
        } catch (error) {
            console.error("List applications error:", error);
            set.status = 500;
            return {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch applications",
            };
        }
    }

    static async getApplicationDetail({
        params,
        set,
    }: {
        params: any;
        set: any;
    }) {
        try {
            const { applicationId } = params;

            // Get letter instance dengan attachments
            const application = await db.letterInstance.findUnique({
                where: { id: applicationId },
                include: {
                    attachments: {
                        where: { deletedAt: null },
                    },
                    createdBy: {
                        include: {
                            mahasiswa: {
                                include: {
                                    departemen: true,
                                    programStudi: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!application) {
                set.status = 404;
                return { error: "Application not found" };
            }

            // Skip ownership check for now

            // Reconstruct form data dari LetterInstance + relations
            const mahasiswa = application.createdBy?.mahasiswa;
            const formData = {
                namaLengkap: application.createdBy?.name || "",
                email: application.createdBy?.email || "",
                role: "Mahasiswa", // Bisa dari user role
                nim: mahasiswa?.nim,
                departemen: mahasiswa?.departemen?.name,
                programStudi: mahasiswa?.programStudi?.name,
                tempatLahir: mahasiswa?.tempatLahir,
                tanggalLahir: mahasiswa?.tanggalLahir,
                ...(application.values && typeof application.values === "object"
                    ? application.values
                    : {}), // ipk, ips, noHp dari values JSON
                namaBeasiswa: application.scholarshipName,
            };

            // Using default import because we can't import MinioService directly here conveniently solely for presigned URL without service class
            // But wait, Application Detail needs to generate presigned URLs for attachments directly?
            // The original code imported MinioService.
            // I should import MinioService here too.
            // Or better, let AttachmentService buffer this?
            // The original code did: await MinioService.getPresignedUrl

            // I will import { MinioService } from "../../../shared/services/minio.service.ts";
            // And I need to update the imports at top of file.

            // Wait, I am writing this content now. I'll add the import.

            return {
                success: true,
                data: {
                    id: application.id,
                    scholarshipName: application.scholarshipName,
                    formData,
                    status: application.status,
                    currentStep: application.currentStep,
                    attachments: await Promise.all(
                        application.attachments.map(async (att: any) => {
                            // Generate presigned URL for download
                            let downloadUrl = "";
                            try {
                                downloadUrl =
                                    await MinioService.getPresignedUrl(
                                        "",
                                        att.domain,
                                        3600,
                                    );
                            } catch (err) {
                                console.error(
                                    "Failed to generate presigned URL:",
                                    err,
                                );
                            }

                            return {
                                id: att.id,
                                filename: att.filename,
                                fileSize: att.fileSize,
                                mimeType: att.mimeType,
                                category: att.category,
                                attachmentType: att.attachmentType,
                                downloadUrl,
                                createdAt: att.createdAt,
                            };
                        }),
                    ),
                    createdAt: application.createdAt,
                    updatedAt: application.updatedAt,
                },
            };
        } catch (error) {
            console.error("Get application error:", error);
            set.status = 500;
            return {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch application",
            };
        }
    }
}
