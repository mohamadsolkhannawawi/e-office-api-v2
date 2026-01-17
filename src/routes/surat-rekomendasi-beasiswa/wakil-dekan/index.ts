/**
 * Routes untuk role Wakil Dekan 1 - Surat Rekomendasi Beasiswa
 * Endpoint-endpoint untuk final approval
 */
import { Elysia, t } from "elysia";
import { Prisma } from "../../../db/index.ts";

const db = Prisma;

export const wakilDekanRoutes = new Elysia({
    prefix: "/wakil-dekan",
    tags: ["surat-rekomendasi-beasiswa-wakil-dekan"],
})
    /**
     * GET /wakil-dekan/pengajuan
     * List all applications pending final approval
     */
    .get("/pengajuan", async ({ set }: { set: any }) => {
        try {
            const applications = await db.letterInstance.findMany({
                where: {
                    letterTypeId: "surat-rekomendasi-beasiswa",
                    status: "IN_PROGRESS",
                    currentStep: 3, // After TU processing
                },
                orderBy: { updatedAt: "asc" },
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
                    nim: app.createdBy?.mahasiswa?.nim || "",
                    departemen:
                        app.createdBy?.mahasiswa?.departemen?.name || "",
                    programStudi:
                        app.createdBy?.mahasiswa?.programStudi?.name || "",
                    status: app.status,
                    submittedAt: app.createdAt,
                })),
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
     * POST /wakil-dekan/pengajuan/:id/approve
     * Final approval/rejection of an application
     */
    .post(
        "/pengajuan/:id/approve",
        async ({ params, body, set }: { params: any; body: any; set: any }) => {
            try {
                const { id } = params;
                const { approved, notes } = body;

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
                        status: approved ? "COMPLETED" : "REJECTED",
                        currentStep: approved ? 4 : application.currentStep,
                    },
                });

                return {
                    success: true,
                    data: {
                        id: updated.id,
                        status: updated.status,
                        approved,
                        notes,
                    },
                };
            } catch (error) {
                console.error("Approve application error:", error);
                set.status = 500;
                return {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Approval failed",
                };
            }
        },
        {
            params: t.Object({
                id: t.String(),
            }),
            body: t.Object({
                approved: t.Boolean(),
                notes: t.Optional(t.String()),
            }),
        }
    )

    /**
     * GET /wakil-dekan/laporan
     * Get report/statistics
     */
    .get("/laporan", async ({ set }: { set: any }) => {
        try {
            const [total, pending, completed, rejected] = await Promise.all([
                db.letterInstance.count({
                    where: { letterTypeId: "surat-rekomendasi-beasiswa" },
                }),
                db.letterInstance.count({
                    where: {
                        letterTypeId: "surat-rekomendasi-beasiswa",
                        status: { in: ["PENDING", "IN_PROGRESS"] },
                    },
                }),
                db.letterInstance.count({
                    where: {
                        letterTypeId: "surat-rekomendasi-beasiswa",
                        status: "COMPLETED",
                    },
                }),
                db.letterInstance.count({
                    where: {
                        letterTypeId: "surat-rekomendasi-beasiswa",
                        status: "REJECTED",
                    },
                }),
            ]);

            return {
                success: true,
                data: {
                    total,
                    pending,
                    completed,
                    rejected,
                    completionRate:
                        total > 0 ? ((completed / total) * 100).toFixed(1) : 0,
                },
            };
        } catch (error) {
            console.error("Get report error:", error);
            set.status = 500;
            return {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch report",
            };
        }
    });

export default wakilDekanRoutes;
