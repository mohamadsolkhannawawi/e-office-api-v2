import { Elysia, t } from "elysia";
import { DocumentCleanupService } from "../../services/DocumentCleanupService.js";

/**
 * Admin routes untuk cleanup dan monitoring dokumen
 */
const documentAdminRoute = new Elysia({ prefix: "/admin/documents" })

    // Get file statistics
    .get("/statistics", async () => {
        try {
            const stats = await DocumentCleanupService.getFileStatistics();

            return {
                success: true,
                data: {
                    ...stats,
                    totalSizeMB: (stats.totalSizeBytes / (1024 * 1024)).toFixed(
                        2,
                    ),
                    duplicateInstances: Object.entries(
                        stats.filesByLetterInstance,
                    )
                        .filter(([_, count]) => count > 2) // More than 1 DOCX + 1 PDF
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
            console.error("Error getting file statistics:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    })

    // Clean up old documents for specific letter instance
    .post(
        "/cleanup/:letterInstanceId",
        async ({ params: { letterInstanceId } }) => {
            try {
                console.log(
                    `🧹 [Manual Cleanup] Starting cleanup for: ${letterInstanceId}`,
                );

                await DocumentCleanupService.cleanupKeepLatest(
                    letterInstanceId,
                );

                // Get updated stats for this instance
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
                console.error("Error during manual cleanup:", error);
                return {
                    success: false,
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                };
            }
        },
        {
            params: t.Object({
                letterInstanceId: t.String(),
            }),
        },
    )

    // Clean up all old documents, keep only latest for each letter instance
    .post("/cleanup-all", async () => {
        try {
            console.log(
                "🧹 [Bulk Cleanup] Starting cleanup for all letter instances",
            );

            const statsBefore =
                await DocumentCleanupService.getFileStatistics();
            let cleanupCount = 0;

            // Get all letter instances that have files
            for (const letterInstanceId of Object.keys(
                statsBefore.filesByLetterInstance,
            )) {
                const fileCount =
                    statsBefore.filesByLetterInstance[letterInstanceId];
                if (fileCount && fileCount > 2) {
                    // More than 1 DOCX + 1 PDF
                    await DocumentCleanupService.cleanupKeepLatest(
                        letterInstanceId,
                    );
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
                        totalSizeMB: (
                            statsBefore.totalSizeBytes /
                            (1024 * 1024)
                        ).toFixed(2),
                    },
                    after: {
                        totalFiles: statsAfter.totalFiles,
                        totalSizeMB: (
                            statsAfter.totalSizeBytes /
                            (1024 * 1024)
                        ).toFixed(2),
                    },
                    saved: {
                        files: statsBefore.totalFiles - statsAfter.totalFiles,
                        sizeMB: (
                            (statsBefore.totalSizeBytes -
                                statsAfter.totalSizeBytes) /
                            (1024 * 1024)
                        ).toFixed(2),
                    },
                },
            };
        } catch (error) {
            console.error("Error during bulk cleanup:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    })

    // Clean up orphaned files (files without database records)
    .post("/cleanup-orphaned", async () => {
        try {
            console.log(
                "🧹 [Orphaned Cleanup] Starting cleanup of orphaned files",
            );

            const statsBefore =
                await DocumentCleanupService.getFileStatistics();
            await DocumentCleanupService.cleanupOrphanedFiles();
            const statsAfter = await DocumentCleanupService.getFileStatistics();

            return {
                success: true,
                data: {
                    message: "Orphaned files cleanup completed",
                    before: {
                        totalFiles: statsBefore.totalFiles,
                        totalSizeMB: (
                            statsBefore.totalSizeBytes /
                            (1024 * 1024)
                        ).toFixed(2),
                    },
                    after: {
                        totalFiles: statsAfter.totalFiles,
                        totalSizeMB: (
                            statsAfter.totalSizeBytes /
                            (1024 * 1024)
                        ).toFixed(2),
                    },
                    removed: {
                        files: statsBefore.totalFiles - statsAfter.totalFiles,
                        sizeMB: (
                            (statsBefore.totalSizeBytes -
                                statsAfter.totalSizeBytes) /
                            (1024 * 1024)
                        ).toFixed(2),
                    },
                },
            };
        } catch (error) {
            console.error("Error during orphaned cleanup:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    })

    // Test cleanup dry-run - show what would be cleaned up
    .get(
        "/cleanup-preview/:letterInstanceId",
        async ({ params: { letterInstanceId } }) => {
            try {
                const { Prisma } = await import("../../db/index.js");

                // Get all generation logs for this letter instance
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
                console.error("Error during cleanup preview:", error);
                return {
                    success: false,
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                };
            }
        },
        {
            params: t.Object({
                letterInstanceId: t.String(),
            }),
        },
    )

    // Clean up temporary files in uploads/temp folder
    .post("/cleanup-temp", async () => {
        try {
            console.log("🧹 [Admin] Starting manual temp cleanup");

            const statsBefore =
                await DocumentCleanupService.getFileStatistics();
            await DocumentCleanupService.cleanupTempFiles();

            return {
                success: true,
                data: {
                    message: "Temp files cleanup completed",
                    timestamp: new Date().toISOString(),
                },
            };
        } catch (error) {
            console.error("Error during temp cleanup:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    });

export default documentAdminRoute;
