import {
  authGuardPlugin,
  requirePermission,
} from "@backend/middlewares/auth.ts";
import { Prisma } from "@backend/db/index.ts";
import { Elysia, t } from "elysia";

/**
 * [ROUTE] Admin System Routes
 *
 * Menyediakan endpoint untuk:
 * - Statistik sistem dashboard
 * - Audit logs aktivitas surat
 * - Konfigurasi sistem
 */
export default new Elysia()
  .use(authGuardPlugin)
  // Ambil statistik sistem untuk dashboard
  .get(
    "/stats",
    async () => {
      try {
        console.log("[PROCESSING] [System Stats] Mulai ambil statistik...");

        // Ambil total user
        const totalUsers = await Prisma.user.count();
        console.log("[INFO] [System Stats] Total user:", totalUsers);

        // Ambil user aktif (isActive=true)
        const activeUsers = await Prisma.user.count({
          where: {
            isActive: true,
          },
        });
        console.log("[INFO] [System Stats] User aktif:", activeUsers);

        // Ambil total role
        const totalRoles = await Prisma.role.count();
        console.log("[INFO] [System Stats] Total role:", totalRoles);

        // Ambil total departemen
        const totalDepartments = await Prisma.departemen.count();
        console.log(
          "[INFO] [System Stats] Total departemen:",
          totalDepartments,
        );

        // Ambil total prodi
        const totalProdi = await Prisma.programStudi.count();
        console.log("[INFO] [System Stats] Total prodi:", totalProdi);

        // Ambil jumlah user per role
        const userRoleCounts = await Prisma.userRole.groupBy({
          by: ["roleId"],
          _count: true,
        });
        console.log(
          "[INFO] [System Stats] Jumlah user per role:",
          userRoleCounts,
        );

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
          "[INFO] [System Stats] Role dengan jumlah user:",
          rolesWithCounts,
        );

        // Ambil total storage terpakai dari document generation logs
        const generationLogs = await Prisma.documentGenerationLog.aggregate({
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
          "[INFO] [System Stats] Aggregate generation logs:",
          generationLogs,
        );
        // Konversi bytes ke MB jika fileSize tersedia
        const totalBytes = generationLogs._sum.fileSize || 0;
        const storageUsed = totalBytes / (1024 * 1024); // Konversi ke MB
        console.log(
          "[INFO] [System Stats] Storage terpakai (MB):",
          storageUsed,
        );

        // Ambil jumlah sesi aktif (session ter-update 7 hari terakhir)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const activeSessions = await Prisma.session.count({
          where: {
            updatedAt: {
              gte: sevenDaysAgo,
            },
          },
        });
        console.log("[INFO] [System Stats] Sesi aktif:", activeSessions);

        // Ambil statistik surat (untuk backward compatibility)
        const totalLetters = await Prisma.letterInstance.count();
        console.log("[INFO] [System Stats] Total surat:", totalLetters);

        const lettersByStatus = await Prisma.letterInstance.groupBy({
          by: ["status"],
          _count: true,
        });
        console.log("[INFO] [System Stats] Surat per status:", lettersByStatus);

        // Ambil jumlah registrasi baru (30 hari terakhir)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentUsers = await Prisma.user.count({
          where: {
            createdAt: {
              gte: thirtyDaysAgo,
            },
          },
        });
        console.log("[INFO] [System Stats] User baru (30 hari):", recentUsers);

        // Ambil data tren user harian (30 hari terakhir)
        console.log(
          "[PROCESSING] [System Stats] Hitung tren user (30 hari)...",
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
        console.log("[INFO] [System Stats] Tren user berhasil dihitung");

        // Ambil data tren mingguan (untuk backward compatibility)
        console.log("[PROCESSING] [System Stats] Hitung tren mingguan...");
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
        console.log("[INFO] [System Stats] Tren mingguan berhasil dihitung");

        const result = {
          // Statistik khusus Super Admin
          totalUsers,
          activeUsers,
          totalRoles,
          totalDepartments,
          totalProdi,
          storageUsed,
          usersByRole: rolesWithCounts,
          userTrend: userTrendData,

          // Statistik legacy (untuk role lain)
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
          "[SUCCESS] [System Stats] Berhasil mengambil seluruh statistik",
        );
        return result;
      } catch (error) {
        console.error(
          "[ERROR] [System Stats] Gagal mengambil statistik:",
          error,
        );
        throw error;
      }
    },
    {
      ...requirePermission("system", "stats"),
    },
  )
  // Ambil audit logs (riwayat aktivitas surat)
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

      // Susun where clause dinamis
      const where: any = {};

      if (userId) {
        where.actor = {
          name: {
            contains: userId,
            mode: "insensitive",
          },
        };
      }

      if (action) {
        where.action = action;
      }

      // Filter rentang tanggal
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(startDate);
        }
        if (endDate) {
          where.createdAt.lte = new Date(endDate);
        }
      }

      // Ambil total data untuk pagination
      const total = await Prisma.letterHistory.count({ where });

      // Ambil data audit logs
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
  // Ambil konfigurasi sistem
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
  // Update konfigurasi sistem
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
