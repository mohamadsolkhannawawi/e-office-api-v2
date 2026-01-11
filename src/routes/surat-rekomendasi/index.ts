import { Elysia, t } from "elysia";
import { AttachmentService } from "../../services/attachment.service.ts";
import { MinioService } from "../../services/minio.service.ts";
import { Prisma } from "../../db/index.ts";

const db = Prisma;

const suratRekomendasiRoutes = new Elysia({
    prefix: "/surat-rekomendasi",
    tags: ["surat-rekomendasi"],
})

    /**
     * POST /surat-rekomendasi/applications
     * Create new scholarship application (LetterInstance)
     */
    .post(
        "/applications",
        async ({ body, set }: { body: any; set: any }) => {
            try {
                const { namaBeasiswa, values } = body;

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
        },
        {
            body: t.Object({
                namaBeasiswa: t.String(),
                values: t.Record(t.String(), t.Any()), // JSON dengan ipk, ips, noHp, dll
            }),
        }
    )

    /**
     * GET /surat-rekomendasi/applications
     * List all scholarship applications
     */
    .get("/applications", async ({ set }: { set: any }) => {
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
    })

    /**
     * POST /surat-rekomendasi/:letterInstanceId/upload
     * Upload attachment file ke MinIO dan simpan metadata ke database
     */
    .post(
        "/:letterInstanceId/upload",
        async ({ params, body, set }: { params: any; body: any; set: any }) => {
            try {
                const { letterInstanceId } = params;
                const { file, category } = body;

                // Verify letter instance exists
                const letterInstance = await db.letterInstance.findUnique({
                    where: { id: letterInstanceId },
                });

                if (!letterInstance) {
                    set.status = 404;
                    return { error: "Letter instance not found" };
                }

                // Skip ownership check for now

                // Upload attachment
                const attachment = await AttachmentService.uploadAttachment({
                    file,
                    letterInstanceId,
                    userId: "temp-user",
                    category: category as "Utama" | "Tambahan",
                });

                set.status = 201;
                return {
                    success: true,
                    data: attachment,
                };
            } catch (error) {
                console.error("Upload attachment error:", error);
                set.status = 500;
                return {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Upload failed",
                };
            }
        },
        {
            params: t.Object({
                letterInstanceId: t.String(),
            }),
            body: t.Object({
                file: t.File(),
                category: t.String({ enum: ["Utama", "Tambahan"] }),
            }),
        }
    )

    /**
     * GET /surat-rekomendasi/:letterInstanceId/attachments
     * Get all attachments untuk sebuah application
     */
    .get(
        "/:letterInstanceId/attachments",
        async ({ params, set }: { params: any; set: any }) => {
            try {
                const { letterInstanceId } = params;

                // Verify letter instance exists
                const letterInstance = await db.letterInstance.findUnique({
                    where: { id: letterInstanceId },
                });

                if (!letterInstance) {
                    set.status = 404;
                    return { error: "Letter instance not found" };
                }

                // Skip ownership check for now

                // Get attachments
                const attachments =
                    await AttachmentService.getLetterAttachments(
                        letterInstanceId
                    );

                return {
                    success: true,
                    data: attachments,
                };
            } catch (error) {
                console.error("Get attachments error:", error);
                set.status = 500;
                return {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Failed to fetch attachments",
                };
            }
        },
        {
            params: t.Object({
                letterInstanceId: t.String(),
            }),
        }
    )

    /**
     * DELETE /surat-rekomendasi/attachments/:attachmentId
     * Delete attachment
     */
    .delete(
        "/attachments/:attachmentId",
        async ({ params, set }: { params: any; set: any }) => {
            try {
                const { attachmentId } = params;

                // Verify attachment exists
                const attachment = await db.attachment.findUnique({
                    where: { id: attachmentId },
                    include: { letterInstance: true },
                });

                if (!attachment) {
                    set.status = 404;
                    return { error: "Attachment not found" };
                }

                // Skip ownership check for now

                // Delete
                await AttachmentService.deleteAttachment(attachmentId);

                return {
                    success: true,
                    message: "Attachment deleted successfully",
                };
            } catch (error) {
                console.error("Delete attachment error:", error);
                set.status = 500;
                return {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Delete failed",
                };
            }
        },
        {
            params: t.Object({
                attachmentId: t.String(),
            }),
        }
    )

    /**
     * GET /surat-rekomendasi/applications/:applicationId
     * Get application detail beserta attachments
     */
    .get(
        "/applications/:applicationId",
        async ({ params, set }: { params: any; set: any }) => {
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
                    ...(application.values &&
                    typeof application.values === "object"
                        ? application.values
                        : {}), // ipk, ips, noHp dari values JSON
                    namaBeasiswa: application.scholarshipName,
                };

                return {
                    success: true,
                    data: {
                        id: application.id,
                        scholarshipName: application.scholarshipName, // Add at top level
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
                                            "", // Empty string - domain already contains full path
                                            att.domain,
                                            3600 // 1 hour expiry
                                        );
                                } catch (err) {
                                    console.error(
                                        "Failed to generate presigned URL:",
                                        err
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
                            })
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
        },
        {
            params: t.Object({
                applicationId: t.String(),
            }),
        }
    );

export default suratRekomendasiRoutes;
