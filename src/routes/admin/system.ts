import {
    authGuardPlugin,
    requirePermission,
} from "@backend/middlewares/auth.ts";
import { Prisma } from "@backend/db/index.ts";
import { Elysia, t } from "elysia";

export default new Elysia()
    .use(authGuardPlugin)
    // Get system statistics for dashboard
    .get(
        "/stats",
        async () => {
            try {
                console.log("[System Stats] Starting to fetch statistics...");

                // Get total users
                const totalUsers = await Prisma.user.count();
                console.log("[System Stats] Total users:", totalUsers);

                // Get active users (isActive=true)
                const activeUsers = await Prisma.user.count({
                    where: {
                        isActive: true,
                    },
                });
                console.log("[System Stats] Active users:", activeUsers);

                // Get total roles
                const totalRoles = await Prisma.role.count();
                console.log("[System Stats] Total roles:", totalRoles);

                // Get total departments
                const totalDepartments = await Prisma.departemen.count();
                console.log(
                    "[System Stats] Total departments:",
                    totalDepartments,
                );

                // Get total prodi
                const totalProdi = await Prisma.programStudi.count();
                console.log("[System Stats] Total prodi:", totalProdi);

                // Get user counts by role
                const userRoleCounts = await Prisma.userRole.groupBy({
                    by: ["roleId"],
                    _count: true,
                });
                console.log("[System Stats] User role counts:", userRoleCounts);

                const rolesWithCounts = await Promise.all(
                    userRoleCounts.map(async (urc) => {
                        const role = await Prisma.role.findUnique({
                            where: { id: urc.roleId },
                        });
                        return {
                            name: role?.name || "Unknown",
                            count: urc._count,
                        };
                    }),
                );
                console.log(
                    "[System Stats] Roles with counts:",
                    rolesWithCounts,
                );

                // Get storage used from document generation logs
                const generationLogs =
                    await Prisma.documentGenerationLog.aggregate({
                        _sum: {
                            fileSize: true,
                        },
                        where: {
                            status: "SUCCESS",
                            filePath: {
                                not: null,
                            },
                        },
                    });
                console.log(
                    "[System Stats] Generation logs aggregate:",
                    generationLogs,
                );
                // Convert bytes to MB if fileSize exists, otherwise estimate
                const totalBytes = generationLogs._sum.fileSize || 0;
                const storageUsed = totalBytes / (1024 * 1024); // Convert to MB
                console.log("[System Stats] Storage used (MB):", storageUsed);

                // Get active sessions count (sessions updated in last 7 days)
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                const activeSessions = await Prisma.session.count({
                    where: {
                        updatedAt: {
                            gte: sevenDaysAgo,
                        },
                    },
                });
                console.log("[System Stats] Active sessions:", activeSessions);

                // Get letter statistics (for backward compatibility)
                const totalLetters = await Prisma.letterInstance.count();
                console.log("[System Stats] Total letters:", totalLetters);

                const lettersByStatus = await Prisma.letterInstance.groupBy({
                    by: ["status"],
                    _count: true,
                });
                console.log(
                    "[System Stats] Letters by status:",
                    lettersByStatus,
                );

                // Get recent registrations (last 30 days)
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                const recentUsers = await Prisma.user.count({
                    where: {
                        createdAt: {
                            gte: thirtyDaysAgo,
                        },
                    },
                });
                console.log(
                    "[System Stats] Recent users (30 days):",
                    recentUsers,
                );

                // Get user trend data (daily for last 30 days)
                console.log(
                    "[System Stats] Calculating user trend (30 days)...",
                );
                const userTrendData = [];
                for (let i = 29; i >= 0; i--) {
                    const dayStart = new Date();
                    dayStart.setDate(dayStart.getDate() - i);
                    dayStart.setHours(0, 0, 0, 0);

                    const dayEnd = new Date(dayStart);
                    dayEnd.setHours(23, 59, 59, 999);

                    const count = await Prisma.user.count({
                        where: {
                            createdAt: {
                                gte: dayStart,
                                lte: dayEnd,
                            },
                        },
                    });

                    userTrendData.push({
                        count,
                        date: dayStart.toISOString().split("T")[0],
                    });
                }
                console.log("[System Stats] User trend data calculated");

                // Get weekly trend data (for backward compatibility)
                console.log("[System Stats] Calculating weekly trend...");
                const trendData = [];
                for (let i = 7; i >= 0; i--) {
                    const weekStart = new Date();
                    weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
                    const weekEnd = new Date();
                    weekEnd.setDate(weekEnd.getDate() - i * 7);

                    const count = await Prisma.user.count({
                        where: {
                            createdAt: {
                                gte: weekStart,
                                lt: weekEnd,
                            },
                        },
                    });

                    trendData.push({
                        week: `Week ${8 - i}`,
                        count,
                        date: weekStart.toISOString().split("T")[0],
                    });
                }
                console.log("[System Stats] Weekly trend calculated");

                const result = {
                    // Super Admin specific stats
                    totalUsers,
                    activeUsers,
                    totalRoles,
                    totalDepartments,
                    totalProdi,
                    storageUsed,
                    usersByRole: rolesWithCounts,
                    userTrend: userTrendData,

                    // Legacy stats (for other roles)
                    activeSessions,
                    totalLetters,
                    recentUsers,
                    lettersByStatus: lettersByStatus.map((l) => ({
                        status: l.status,
                        count: l._count,
                    })),
                    trend: trendData,
                };

                console.log(
                    "[System Stats] Successfully fetched all statistics",
                );
                return result;
            } catch (error) {
                console.error("[System Stats] ERROR:", error);
                throw error;
            }
        },
        {
            ...requirePermission("system", "stats"),
        },
    )
    // Get audit logs (letter history)
    .get(
        "/audit-logs",
        async ({ query }) => {
            const {
                page = 1,
                limit = 50,
                userId = "",
                action = "",
                startDate = "",
                endDate = "",
            } = query;

            const skip = (page - 1) * limit;

            // Build where clause
            const where: any = {};

            if (userId) {
                where.actionBy = userId;
            }

            if (action) {
                where.action = action;
            }

            // Date range filter
            if (startDate || endDate) {
                where.createdAt = {};
                if (startDate) {
                    where.createdAt.gte = new Date(startDate);
                }
                if (endDate) {
                    where.createdAt.lte = new Date(endDate);
                }
            }

            // Get total count
            const total = await Prisma.letterHistory.count({ where });

            // Get audit logs
            const logs = await Prisma.letterHistory.findMany({
                where,
                skip,
                take: limit,
                include: {
                    actor: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    letterInstance: {
                        select: {
                            id: true,
                            letterNumber: true,
                            letterType: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                    role: {
                        select: {
                            name: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
            });

            return {
                logs,
                meta: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            };
        },
        {
            ...requirePermission("system", "audit"),
            query: t.Object({
                page: t.Optional(t.Number()),
                limit: t.Optional(t.Number()),
                userId: t.Optional(t.String()),
                action: t.Optional(t.String()),
                startDate: t.Optional(t.String()),
                endDate: t.Optional(t.String()),
            }),
        },
    )
    // Get system configuration
    .get(
        "/config",
        async () => {
            const configs = await Prisma.letterConfig.findMany({
                orderBy: {
                    createdAt: "desc",
                },
            });

            return { configs };
        },
        {
            ...requirePermission("system", "config"),
        },
    )
    // Update system configuration
    .patch(
        "/config/:id",
        async ({ params: { id }, body: { value } }) => {
            const config = await Prisma.letterConfig.update({
                where: { id },
                data: { value },
            });

            return {
                message: "Configuration updated successfully",
                config,
            };
        },
        {
            ...requirePermission("system", "config"),
            params: t.Object({
                id: t.String(),
            }),
            body: t.Object({
                value: t.Any(),
            }),
        },
    );
