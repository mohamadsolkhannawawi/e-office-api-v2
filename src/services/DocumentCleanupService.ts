import fs from "fs";
import path from "path";
import { Prisma } from "../db/index.js";

/**
 * Service untuk mengelola cleanup dokumen lama
 * Mencegah penumpukan file di folder uploads/generated
 */
export class DocumentCleanupService {
    /**
     * Clean up old documents for a specific letter instance
     * Menghapus semua file dokumen dan PDF lama untuk letter instance tertentu
     *
     * @param letterInstanceId ID dari letter instance
     * @param keepCurrentFile Optional path file yang tetap dipertahankan
     */
    static async cleanupOldDocuments(
        letterInstanceId: string,
        keepCurrentFile?: string,
    ): Promise<void> {
        try {
            console.log(
                `🧹 [DocumentCleanup] Starting cleanup for letterInstanceId: ${letterInstanceId}`,
            );

            // Get all generation logs for this letter instance
            const existingLogs = await Prisma.documentGenerationLog.findMany({
                where: { letterInstanceId },
                orderBy: { generatedAt: "desc" },
            });

            if (existingLogs.length === 0) {
                console.log(
                    `🧹 [DocumentCleanup] No existing logs found for: ${letterInstanceId}`,
                );
                return;
            }

            console.log(
                `🧹 [DocumentCleanup] Found ${existingLogs.length} existing logs for: ${letterInstanceId}`,
            );

            let filesDeleted = 0;
            let logsDeleted = 0;

            // Process each log
            for (const log of existingLogs) {
                if (!log.filePath) {
                    continue;
                }

                // Skip current file if specified
                if (keepCurrentFile && log.filePath === keepCurrentFile) {
                    console.log(
                        `🧹 [DocumentCleanup] Keeping current file: ${log.filePath}`,
                    );
                    continue;
                }

                // Delete physical file
                const fullPath = path.join(process.cwd(), log.filePath);

                try {
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                        filesDeleted++;
                        console.log(
                            `🗑️ [DocumentCleanup] Deleted file: ${log.filePath}`,
                        );

                        // Also try to delete corresponding PDF if DOCX file
                        if (log.filePath.endsWith(".docx")) {
                            const pdfPath = log.filePath.replace(
                                ".docx",
                                ".pdf",
                            );
                            const fullPdfPath = path.join(
                                process.cwd(),
                                pdfPath,
                            );

                            if (fs.existsSync(fullPdfPath)) {
                                fs.unlinkSync(fullPdfPath);
                                filesDeleted++;
                                console.log(
                                    `🗑️ [DocumentCleanup] Deleted PDF: ${pdfPath}`,
                                );
                            }
                        }
                    } else {
                        console.log(
                            `⚠️ [DocumentCleanup] File not found (already deleted?): ${log.filePath}`,
                        );
                    }
                } catch (fileError) {
                    console.error(
                        `❌ [DocumentCleanup] Failed to delete file ${log.filePath}:`,
                        fileError,
                    );
                }

                // Delete database log (unless it's the current file)
                try {
                    if (!keepCurrentFile || log.filePath !== keepCurrentFile) {
                        await Prisma.documentGenerationLog.delete({
                            where: { id: log.id },
                        });
                        logsDeleted++;
                        console.log(
                            `🗑️ [DocumentCleanup] Deleted log: ${log.id}`,
                        );
                    }
                } catch (logError) {
                    console.error(
                        `❌ [DocumentCleanup] Failed to delete log ${log.id}:`,
                        logError,
                    );
                }
            }

            console.log(
                `✅ [DocumentCleanup] Cleanup completed for ${letterInstanceId}: ${filesDeleted} files deleted, ${logsDeleted} logs removed`,
            );
        } catch (error) {
            console.error(
                `❌ [DocumentCleanup] Error during cleanup for ${letterInstanceId}:`,
                error,
            );
            // Don't throw error - cleanup failure shouldn't break main operation
        }
    }

    /**
     * Clean up all old files for this letter instance, keeping only the newest
     * Berguna untuk memastikan hanya ada 1 dokumen terakhir
     */
    static async cleanupKeepLatest(letterInstanceId: string): Promise<void> {
        try {
            console.log(
                `🧹 [DocumentCleanup] Cleanup keeping latest for: ${letterInstanceId}`,
            );

            // Get latest generation log
            const latestLog = await Prisma.documentGenerationLog.findFirst({
                where: { letterInstanceId },
                orderBy: { generatedAt: "desc" },
            });

            if (!latestLog) {
                console.log(
                    `🧹 [DocumentCleanup] No logs found for: ${letterInstanceId}`,
                );
                return;
            }

            // Clean up all except the latest
            await this.cleanupOldDocuments(
                letterInstanceId,
                latestLog.filePath || undefined,
            );
        } catch (error) {
            console.error(
                `❌ [DocumentCleanup] Error during latest cleanup for ${letterInstanceId}:`,
                error,
            );
        }
    }

    /**
     * Cleanup orphaned files - files that exist on disk but not in database
     * Berguna untuk maintenance periodic
     */
    static async cleanupOrphanedFiles(): Promise<void> {
        try {
            console.log(`🧹 [DocumentCleanup] Starting orphaned files cleanup`);

            const uploadsDir = path.join(process.cwd(), "uploads", "generated");

            if (!fs.existsSync(uploadsDir)) {
                console.log(
                    `🧹 [DocumentCleanup] Uploads directory does not exist: ${uploadsDir}`,
                );
                return;
            }

            const files = fs.readdirSync(uploadsDir);
            const validFiles = await Prisma.documentGenerationLog.findMany({
                select: { filePath: true },
            });

            const validFilePaths = new Set(
                validFiles
                    .map((log: any) => log.filePath)
                    .filter((filePath: string | null) => filePath !== null)
                    .map((filePath: string | null) => path.basename(filePath!)),
            );

            let orphanedCount = 0;

            for (const file of files) {
                if (!validFilePaths.has(file)) {
                    const filePath = path.join(uploadsDir, file);
                    try {
                        fs.unlinkSync(filePath);
                        orphanedCount++;
                        console.log(
                            `🗑️ [DocumentCleanup] Deleted orphaned file: ${file}`,
                        );
                    } catch (error) {
                        console.error(
                            `❌ [DocumentCleanup] Failed to delete orphaned file ${file}:`,
                            error,
                        );
                    }
                }
            }

            console.log(
                `✅ [DocumentCleanup] Orphaned cleanup completed: ${orphanedCount} files removed`,
            );
        } catch (error) {
            console.error(
                `❌ [DocumentCleanup] Error during orphaned cleanup:`,
                error,
            );
        }
    }

    /**
     * Get file statistics for monitoring
     */
    static async getFileStatistics(): Promise<{
        totalFiles: number;
        totalSizeBytes: number;
        filesByLetterInstance: Record<string, number>;
    }> {
        try {
            const uploadsDir = path.join(process.cwd(), "uploads", "generated");

            if (!fs.existsSync(uploadsDir)) {
                return {
                    totalFiles: 0,
                    totalSizeBytes: 0,
                    filesByLetterInstance: {},
                };
            }

            const files = fs.readdirSync(uploadsDir);
            let totalSizeBytes = 0;
            const filesByLetterInstance: Record<string, number> = {};

            for (const file of files) {
                const filePath = path.join(uploadsDir, file);
                const stats = fs.statSync(filePath);
                totalSizeBytes += stats.size;

                // Extract letterInstanceId from filename pattern: surat-rekomendasi-{letterInstanceId}-{timestamp}.{ext}
                const match = file.match(
                    /^surat-rekomendasi-([^-]+)-\d+\.(docx|pdf)$/,
                );
                if (match && match[1]) {
                    const letterInstanceId = match[1];
                    filesByLetterInstance[letterInstanceId] =
                        (filesByLetterInstance[letterInstanceId] || 0) + 1;
                }
            }

            return {
                totalFiles: files.length,
                totalSizeBytes,
                filesByLetterInstance,
            };
        } catch (error) {
            console.error(
                `❌ [DocumentCleanup] Error getting file statistics:`,
                error,
            );
            return {
                totalFiles: 0,
                totalSizeBytes: 0,
                filesByLetterInstance: {},
            };
        }
    }

    /**
     * Clean up temporary files in uploads/temp folder
     * Delete old files (older than 1 hour) to prevent storage buildup
     * Safe to call anytime - only deletes old files that aren't being actively used
     */
    static async cleanupTempFiles(): Promise<void> {
        try {
            const tempDir = path.join(process.cwd(), "uploads", "temp");

            if (!fs.existsSync(tempDir)) {
                console.log(
                    `🧹 [DocumentCleanup] Temp directory does not exist: ${tempDir}`,
                );
                return;
            }

            const files = fs.readdirSync(tempDir);
            let deletedCount = 0;
            const oneHourMs = 60 * 60 * 1000; // 1 hour in milliseconds

            console.log(
                `🧹 [DocumentCleanup] Starting temp cleanup, found ${files.length} files`,
            );

            for (const file of files) {
                const filePath = path.join(tempDir, file);

                try {
                    const stats = fs.statSync(filePath);
                    const ageMs = Date.now() - stats.mtimeMs;

                    // Only delete files older than 1 hour to avoid deleting files still being used
                    if (ageMs > oneHourMs) {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                        const ageMinutes = Math.round(ageMs / (60 * 1000));
                        console.log(
                            `🗑️ [DocumentCleanup] Deleted old temp file (${ageMinutes} min old): ${file}`,
                        );
                    } else {
                        const ageMinutes = Math.round(ageMs / (60 * 1000));
                        console.log(
                            `⏳ [DocumentCleanup] Keeping fresh temp file (${ageMinutes} min old): ${file}`,
                        );
                    }
                } catch (error) {
                    console.error(
                        `❌ [DocumentCleanup] Error processing temp file ${file}:`,
                        error,
                    );
                }
            }

            console.log(
                `✅ [DocumentCleanup] Temp folder cleanup completed: ${deletedCount} old files removed`,
            );
        } catch (error) {
            console.error(
                `❌ [DocumentCleanup] Error during temp cleanup:`,
                error,
            );
            // Don't throw - temp cleanup failure shouldn't break main operation
        }
    }
}
