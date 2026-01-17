/**
 * Routes untuk role UPA - Surat Rekomendasi Beasiswa
 * Endpoint-endpoint untuk manajemen beasiswa dan laporan
 */
import { Elysia, t } from "elysia";
import { Prisma } from "../../../db/index.ts";

const db = Prisma;

export const upaRoutes = new Elysia({
    prefix: "/upa",
    tags: ["surat-rekomendasi-beasiswa-upa"],
})
    /**
     * GET /upa/beasiswa
     * List all scholarship types
     */
    .get("/beasiswa", async ({ set }: { set: any }) => {
        try {
            // For now return static list, can be made dynamic later
            const scholarships = [
                { id: "internal", name: "Beasiswa Internal", active: true },
                { id: "external", name: "Beasiswa External", active: true },
                { id: "akademik", name: "Beasiswa Akademik", active: true },
            ];

            return {
                success: true,
                data: scholarships,
            };
        } catch (error) {
            console.error("List scholarships error:", error);
            set.status = 500;
            return {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch scholarships",
            };
        }
    })

    /**
     * GET /upa/pengajuan
     * List all applications (all statuses)
     */
    .get("/pengajuan", async ({ query, set }: { query: any; set: any }) => {
        try {
            const { status, page = 1, limit = 20 } = query;

            const where: any = {
                letterTypeId: "surat-rekomendasi-beasiswa",
            };

            if (status) {
                where.status = status;
            }

            const [applications, total] = await Promise.all([
                db.letterInstance.findMany({
                    where,
                    orderBy: { createdAt: "desc" },
                    skip: (Number(page) - 1) * Number(limit),
                    take: Number(limit),
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
                }),
                db.letterInstance.count({ where }),
            ]);

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
                    currentStep: app.currentStep,
                    createdAt: app.createdAt,
                    updatedAt: app.updatedAt,
                })),
                meta: {
                    total,
                    page: Number(page),
                    limit: Number(limit),
                    totalPages: Math.ceil(total / Number(limit)),
                },
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
     * GET /upa/laporan
     * Get comprehensive report/statistics
     */
    .get("/laporan", async ({ set }: { set: any }) => {
        try {
            const [total, pending, inProgress, completed, rejected] =
                await Promise.all([
                    db.letterInstance.count({
                        where: { letterTypeId: "surat-rekomendasi-beasiswa" },
                    }),
                    db.letterInstance.count({
                        where: {
                            letterTypeId: "surat-rekomendasi-beasiswa",
                            status: "PENDING",
                        },
                    }),
                    db.letterInstance.count({
                        where: {
                            letterTypeId: "surat-rekomendasi-beasiswa",
                            status: "IN_PROGRESS",
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

            // Get applications by department
            const byDepartment = await db.letterInstance.groupBy({
                by: ["createdById"],
                where: { letterTypeId: "surat-rekomendasi-beasiswa" },
                _count: true,
            });

            return {
                success: true,
                data: {
                    summary: {
                        total,
                        pending,
                        inProgress,
                        completed,
                        rejected,
                        approvalRate:
                            total > 0
                                ? ((completed / total) * 100).toFixed(1)
                                : 0,
                        rejectionRate:
                            total > 0
                                ? ((rejected / total) * 100).toFixed(1)
                                : 0,
                    },
                    byDepartment: byDepartment.length,
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
    })

    /**
     * GET /upa/laporan/export
     * Export report data
     */
    .get(
        "/laporan/export",
        async ({ query, set }: { query: any; set: any }) => {
            try {
                const { format = "json" } = query;

                const applications = await db.letterInstance.findMany({
                    where: { letterTypeId: "surat-rekomendasi-beasiswa" },
                    orderBy: { createdAt: "desc" },
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

                const data = applications.map((app: any) => ({
                    id: app.id,
                    scholarshipName: app.scholarshipName,
                    applicantName: app.createdBy?.name || "",
                    nim: app.createdBy?.mahasiswa?.nim || "",
                    departemen:
                        app.createdBy?.mahasiswa?.departemen?.name || "",
                    programStudi:
                        app.createdBy?.mahasiswa?.programStudi?.name || "",
                    status: app.status,
                    createdAt: app.createdAt,
                    updatedAt: app.updatedAt,
                }));

                return {
                    success: true,
                    format,
                    data,
                };
            } catch (error) {
                console.error("Export report error:", error);
                set.status = 500;
                return {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Failed to export report",
                };
            }
        }
    );

export default upaRoutes;
