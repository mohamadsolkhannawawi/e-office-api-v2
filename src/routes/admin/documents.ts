import { Elysia, t } from "elysia";
import {
  authGuardPlugin,
  requirePermission,
} from "@backend/middlewares/auth.ts";
import { DocumentCleanupService } from "../../services/DocumentCleanupService.js";

/**
 * [ROUTE] documentAdminRoute - Endpoint admin untuk cleanup dan monitoring dokumen
 *
 * Fitur utama:
 * - Statistik file hasil generate dokumen
 * - Cleanup manual per letter instance
 * - Cleanup massal semua letter instance
 * - Cleanup file orphaned (tanpa relasi DB)
 * - Preview dry-run file yang akan dihapus
 * - Cleanup file temporary
 */
const documentAdminRoute = new Elysia({ prefix: "/admin/documents" })
  .use(authGuardPlugin)

  // Ambil statistik file dokumen
  .get(
    "/statistics",
    async () => {
      try {
        console.log("[PROCESSING] Ambil statistik dokumen...");
        const stats = await DocumentCleanupService.getFileStatistics();

        return {
          success: true,
          data: {
            ...stats,
            totalSizeMB: (stats.totalSizeBytes / (1024 * 1024)).toFixed(2),
            duplicateInstances: Object.entries(stats.filesByLetterInstance)
              .filter(([_, count]) => count > 2) // Lebih dari 1 DOCX + 1 PDF
              .reduce(
                (acc, [id, count]) => ({
                  ...acc,
                  [id]: count,
                }),
                {} as Record<string, number>,
              ),
          },
        };
      } catch (error) {
        console.error("[ERROR] Gagal ambil statistik dokumen:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      ...requirePermission("document", "cleanup"),
    },
  )

  // Cleanup dokumen lama untuk letter instance tertentu
  .post(
    "/cleanup/:letterInstanceId",
    async ({ params: { letterInstanceId } }) => {
      try {
        console.log(
          `[PROCESSING] [Manual Cleanup] Mulai cleanup untuk: ${letterInstanceId}`,
        );

        await DocumentCleanupService.cleanupKeepLatest(letterInstanceId);

        // Ambil statistik terbaru untuk instance ini
        const stats = await DocumentCleanupService.getFileStatistics();
        const remainingFiles =
          stats.filesByLetterInstance[letterInstanceId] || 0;

        return {
          success: true,
          data: {
            message: `Cleanup completed for ${letterInstanceId}`,
            remainingFiles,
            letterInstanceId,
          },
        };
      } catch (error) {
        console.error("[ERROR] Gagal manual cleanup:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      ...requirePermission("document", "cleanup"),
      params: t.Object({
        letterInstanceId: t.String(),
      }),
    },
  )

  // Cleanup semua dokumen lama, simpan hanya versi terbaru per letter instance
  .post(
    "/cleanup-all",
    async () => {
      try {
        console.log(
          "[PROCESSING] [Bulk Cleanup] Mulai cleanup untuk semua letter instance",
        );

        const statsBefore = await DocumentCleanupService.getFileStatistics();
        let cleanupCount = 0;

        // Ambil semua letter instance yang memiliki file
        for (const letterInstanceId of Object.keys(
          statsBefore.filesByLetterInstance,
        )) {
          const fileCount = statsBefore.filesByLetterInstance[letterInstanceId];
          if (fileCount && fileCount > 2) {
            // Lebih dari 1 DOCX + 1 PDF
            await DocumentCleanupService.cleanupKeepLatest(letterInstanceId);
            cleanupCount++;
          }
        }

        const statsAfter = await DocumentCleanupService.getFileStatistics();

        return {
          success: true,
          data: {
            message: "Bulk cleanup completed",
            cleanupCount,
            before: {
              totalFiles: statsBefore.totalFiles,
              totalSizeMB: (statsBefore.totalSizeBytes / (1024 * 1024)).toFixed(
                2,
              ),
            },
            after: {
              totalFiles: statsAfter.totalFiles,
              totalSizeMB: (statsAfter.totalSizeBytes / (1024 * 1024)).toFixed(
                2,
              ),
            },
            saved: {
              files: statsBefore.totalFiles - statsAfter.totalFiles,
              sizeMB: (
                (statsBefore.totalSizeBytes - statsAfter.totalSizeBytes) /
                (1024 * 1024)
              ).toFixed(2),
            },
          },
        };
      } catch (error) {
        console.error("[ERROR] Gagal bulk cleanup:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      ...requirePermission("document", "cleanup"),
    },
  )

  // Cleanup file orphaned (file tanpa record database)
  .post(
    "/cleanup-orphaned",
    async () => {
      try {
        console.log(
          "[PROCESSING] [Orphaned Cleanup] Mulai cleanup file orphaned",
        );

        const statsBefore = await DocumentCleanupService.getFileStatistics();
        await DocumentCleanupService.cleanupOrphanedFiles();
        const statsAfter = await DocumentCleanupService.getFileStatistics();

        return {
          success: true,
          data: {
            message: "Orphaned files cleanup completed",
            before: {
              totalFiles: statsBefore.totalFiles,
              totalSizeMB: (statsBefore.totalSizeBytes / (1024 * 1024)).toFixed(
                2,
              ),
            },
            after: {
              totalFiles: statsAfter.totalFiles,
              totalSizeMB: (statsAfter.totalSizeBytes / (1024 * 1024)).toFixed(
                2,
              ),
            },
            removed: {
              files: statsBefore.totalFiles - statsAfter.totalFiles,
              sizeMB: (
                (statsBefore.totalSizeBytes - statsAfter.totalSizeBytes) /
                (1024 * 1024)
              ).toFixed(2),
            },
          },
        };
      } catch (error) {
        console.error("[ERROR] Gagal cleanup orphaned files:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      ...requirePermission("document", "cleanup"),
    },
  )

  // Preview dry-run cleanup - tampilkan file yang akan dihapus
  .get(
    "/cleanup-preview/:letterInstanceId",
    async ({ params: { letterInstanceId } }) => {
      try {
        const { Prisma } = await import("../../db/index.js");

        // Ambil semua generation logs untuk letter instance ini
        const logs = await Prisma.documentGenerationLog.findMany({
          where: { letterInstanceId },
          orderBy: { generatedAt: "desc" },
        });

        const latest = logs[0];
        const toBeDeleted = logs.slice(1);

        return {
          success: true,
          data: {
            letterInstanceId,
            totalLogs: logs.length,
            latestFile: latest
              ? {
                  filePath: latest.filePath,
                  generatedAt: latest.generatedAt,
                  status: latest.status,
                }
              : null,
            toBeDeleted: toBeDeleted.map((log: any) => ({
              id: log.id,
              filePath: log.filePath,
              generatedAt: log.generatedAt,
              status: log.status,
            })),
            wouldDelete: toBeDeleted.length,
          },
        };
      } catch (error) {
        console.error("[ERROR] Gagal preview cleanup:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      ...requirePermission("document", "cleanup"),
      params: t.Object({
        letterInstanceId: t.String(),
      }),
    },
  )

  // Cleanup file temporary di folder uploads/temp
  .post(
    "/cleanup-temp",
    async () => {
      try {
        console.log("[PROCESSING] [Admin] Mulai manual temp cleanup");

        const statsBefore = await DocumentCleanupService.getFileStatistics();
        await DocumentCleanupService.cleanupTempFiles();

        return {
          success: true,
          data: {
            message: "Temp files cleanup completed",
            timestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        console.error("[ERROR] Gagal temp cleanup:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      ...requirePermission("document", "cleanup"),
    },
  );

export default documentAdminRoute;
