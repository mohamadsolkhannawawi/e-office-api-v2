/**
 * Routes untuk role Mahasiswa - Surat Rekomendasi Beasiswa
 * Endpoint-endpoint yang diakses oleh mahasiswa untuk pengajuan beasiswa
 */
import { Elysia, t } from "elysia";
import { AttachmentService } from "../../../services/attachment.service.ts";
import { MinioService } from "../../../services/minio.service.ts";
import { Prisma } from "../../../db/index.ts";

const db = Prisma;

export const mahasiswaRoutes = new Elysia({
    prefix: "/mahasiswa",
    tags: ["surat-rekomendasi-beasiswa-mahasiswa"],
})
    /**
     * POST /mahasiswa/pengajuan
     * Create new scholarship application
     */
    .post(
        "/pengajuan",
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
                        schema: {},
                        scholarshipName: namaBeasiswa,
                        values: values || {},
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
                values: t.Record(t.String(), t.Any()),
            }),
        }
    )

    /**
     * GET /mahasiswa/pengajuan
     * List all applications for current mahasiswa
     */
    .get("/pengajuan", async ({ set }: { set: any }) => {
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
     * GET /mahasiswa/pengajuan/:id
     * Get application detail for mahasiswa
     */
    .get(
        "/pengajuan/:id",
        async ({ params, set }: { params: any; set: any }) => {
            try {
                const { id } = params;

                const application = await db.letterInstance.findUnique({
                    where: { id },
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

                const mahasiswa = application.createdBy?.mahasiswa;
                const formData = {
                    namaLengkap: application.createdBy?.name || "",
                    email: application.createdBy?.email || "",
                    role: "Mahasiswa",
                    nim: mahasiswa?.nim,
                    departemen: mahasiswa?.departemen?.name,
                    programStudi: mahasiswa?.programStudi?.name,
                    tempatLahir: mahasiswa?.tempatLahir,
                    tanggalLahir: mahasiswa?.tanggalLahir,
                    ...(application.values &&
                    typeof application.values === "object"
                        ? application.values
                        : {}),
                    namaBeasiswa: application.scholarshipName,
                };

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
                                let downloadUrl = "";
                                try {
                                    downloadUrl =
                                        await MinioService.getPresignedUrl(
                                            "",
                                            att.domain,
                                            3600
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
                id: t.String(),
            }),
        }
    )

    /**
     * POST /mahasiswa/pengajuan/:id/upload
     * Upload attachment for an application
     */
    .post(
        "/pengajuan/:id/upload",
        async ({ params, body, set }: { params: any; body: any; set: any }) => {
            try {
                const { id } = params;
                const { file, category } = body;

                const letterInstance = await db.letterInstance.findUnique({
                    where: { id },
                });

                if (!letterInstance) {
                    set.status = 404;
                    return { error: "Letter instance not found" };
                }

                const attachment = await AttachmentService.uploadAttachment({
                    file,
                    letterInstanceId: id,
                    userId: letterInstance.createdById,
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
                id: t.String(),
            }),
            body: t.Object({
                file: t.File(),
                category: t.String({ enum: ["Utama", "Tambahan"] }),
            }),
        }
    )

    /**
     * GET /mahasiswa/pengajuan/:id/attachments
     * Get all attachments for an application
     */
    .get(
        "/pengajuan/:id/attachments",
        async ({ params, set }: { params: any; set: any }) => {
            try {
                const { id } = params;

                const letterInstance = await db.letterInstance.findUnique({
                    where: { id },
                });

                if (!letterInstance) {
                    set.status = 404;
                    return { error: "Letter instance not found" };
                }

                const attachments =
                    await AttachmentService.getLetterAttachments(id);

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
                id: t.String(),
            }),
        }
    )

    /**
     * DELETE /mahasiswa/attachments/:attachmentId
     * Delete an attachment
     */
    .delete(
        "/attachments/:attachmentId",
        async ({ params, set }: { params: any; set: any }) => {
            try {
                const { attachmentId } = params;

                const attachment = await db.attachment.findUnique({
                    where: { id: attachmentId },
                    include: { letterInstance: true },
                });

                if (!attachment) {
                    set.status = 404;
                    return { error: "Attachment not found" };
                }

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
    );

export default mahasiswaRoutes;
