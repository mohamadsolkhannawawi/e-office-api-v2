/**
 * Routes untuk role Supervisor Akademik - Surat Rekomendasi Beasiswa
 * Endpoint-endpoint untuk verifikasi pengajuan beasiswa
 */
import { Elysia, t } from "elysia";
import { Prisma } from "../../../db/index.ts";

const db = Prisma;

export const supervisorRoutes = new Elysia({
    prefix: "/supervisor",
    tags: ["surat-rekomendasi-beasiswa-supervisor"],
})
    /**
     * GET /supervisor/pengajuan
     * List all applications pending verification
     */
    .get("/pengajuan", async ({ set }: { set: any }) => {
        try {
            const applications = await db.letterInstance.findMany({
                where: {
                    letterTypeId: "surat-rekomendasi-beasiswa",
                    status: "PENDING", // Only pending verification
                },
                orderBy: { createdAt: "asc" },
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
                        applicantName: app.createdBy?.name || "",
                        nim: mahasiswa?.nim || (values as any).nim || "",
                        departemen: mahasiswa?.departemen?.name || "",
                        programStudi: mahasiswa?.programStudi?.name || "",
                        attachmentsCount: app.attachments.length,
                        createdAt: app.createdAt,
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
     * GET /supervisor/pengajuan/:id
     * Get application detail for verification
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
                    nim: mahasiswa?.nim,
                    departemen: mahasiswa?.departemen?.name,
                    programStudi: mahasiswa?.programStudi?.name,
                    tempatLahir: mahasiswa?.tempatLahir,
                    tanggalLahir: mahasiswa?.tanggalLahir,
                    ...(application.values &&
                    typeof application.values === "object"
                        ? application.values
                        : {}),
                };

                return {
                    success: true,
                    data: {
                        id: application.id,
                        scholarshipName: application.scholarshipName,
                        formData,
                        status: application.status,
                        attachments: application.attachments.map(
                            (att: any) => ({
                                id: att.id,
                                filename: att.filename,
                                fileSize: att.fileSize,
                                mimeType: att.mimeType,
                                category: att.category,
                            })
                        ),
                        createdAt: application.createdAt,
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
     * POST /supervisor/pengajuan/:id/verify
     * Verify an application (approve/reject/revision)
     */
    .post(
        "/pengajuan/:id/verify",
        async ({ params, body, set }: { params: any; body: any; set: any }) => {
            try {
                const { id } = params;
                const { action, notes } = body;

                const application = await db.letterInstance.findUnique({
                    where: { id },
                });

                if (!application) {
                    set.status = 404;
                    return { error: "Application not found" };
                }

                let newStatus: string;
                switch (action) {
                    case "approve":
                        newStatus = "IN_PROGRESS"; // Move to next step
                        break;
                    case "reject":
                        newStatus = "REJECTED";
                        break;
                    case "revision":
                        newStatus = "PENDING"; // Stay pending but marked for revision
                        break;
                    default:
                        set.status = 400;
                        return { error: "Invalid action" };
                }

                const updated = await db.letterInstance.update({
                    where: { id },
                    data: {
                        status: newStatus as any,
                        currentStep:
                            action === "approve"
                                ? (application.currentStep || 1) + 1
                                : application.currentStep,
                    },
                });

                return {
                    success: true,
                    data: {
                        id: updated.id,
                        status: updated.status,
                        currentStep: updated.currentStep,
                        action,
                        notes,
                    },
                };
            } catch (error) {
                console.error("Verify application error:", error);
                set.status = 500;
                return {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Verification failed",
                };
            }
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            body: t.Object({
                action: t.String({ enum: ["approve", "reject", "revision"] }),
                notes: t.Optional(t.String()),
            }),
        }
    );

export default supervisorRoutes;
