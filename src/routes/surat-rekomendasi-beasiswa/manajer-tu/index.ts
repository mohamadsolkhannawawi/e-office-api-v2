/**
 * Routes untuk role Manajer TU - Surat Rekomendasi Beasiswa
 * Endpoint-endpoint untuk pengelolaan surat masuk/keluar
 */
import { Elysia, t } from "elysia";
import { Prisma } from "../../../db/index.ts";

const db = Prisma;

export const manajerTURoutes = new Elysia({
    prefix: "/manajer-tu",
    tags: ["surat-rekomendasi-beasiswa-manajer-tu"],
})
    /**
     * GET /manajer-tu/incoming
     * List all incoming applications (verified by supervisor)
     */
    .get("/incoming", async ({ set }: { set: any }) => {
        try {
            const applications = await db.letterInstance.findMany({
                where: {
                    letterTypeId: "surat-rekomendasi-beasiswa",
                    status: "IN_PROGRESS",
                    currentStep: 2, // After supervisor verification
                },
                orderBy: { updatedAt: "desc" },
                include: {
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
                data: applications.map((app: any) => ({
                    id: app.id,
                    scholarshipName: app.scholarshipName,
                    applicantName: app.createdBy?.name || "",
                    departemen:
                        app.createdBy?.mahasiswa?.departemen?.name || "",
                    status: app.status,
                    receivedAt: app.updatedAt,
                })),
            };
        } catch (error) {
            console.error("List incoming error:", error);
            set.status = 500;
            return {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch incoming applications",
            };
        }
    })

    /**
     * GET /manajer-tu/outgoing
     * List all outgoing/processed applications
     */
    .get("/outgoing", async ({ set }: { set: any }) => {
        try {
            const applications = await db.letterInstance.findMany({
                where: {
                    letterTypeId: "surat-rekomendasi-beasiswa",
                    OR: [{ status: "COMPLETED" }, { currentStep: { gte: 3 } }],
                },
                orderBy: { updatedAt: "desc" },
                include: {
                    createdBy: {
                        include: {
                            mahasiswa: {
                                include: {
                                    departemen: true,
                                },
                            },
                        },
                    },
                },
            });

            return {
                success: true,
                data: applications.map((app: any) => ({
                    id: app.id,
                    scholarshipName: app.scholarshipName,
                    applicantName: app.createdBy?.name || "",
                    departemen:
                        app.createdBy?.mahasiswa?.departemen?.name || "",
                    status: app.status,
                    processedAt: app.updatedAt,
                })),
            };
        } catch (error) {
            console.error("List outgoing error:", error);
            set.status = 500;
            return {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch outgoing applications",
            };
        }
    })

    /**
     * POST /manajer-tu/pengajuan/:id/process
     * Process an application (forward to next step)
     */
    .post(
        "/pengajuan/:id/process",
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

                const updated = await db.letterInstance.update({
                    where: { id },
                    data: {
                        currentStep:
                            action === "forward"
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
                console.error("Process application error:", error);
                set.status = 500;
                return {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Processing failed",
                };
            }
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            body: t.Object({
                action: t.String({ enum: ["forward", "return"] }),
                notes: t.Optional(t.String()),
            }),
        }
    );

export default manajerTURoutes;
