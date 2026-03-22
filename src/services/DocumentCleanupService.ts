import fs from "fs";
import path from "path";
import { Prisma } from "../db/index.js";

/**
 * Service untuk mengelola cleanup dokumen lama
 * Mencegah penumpukan file di folder uploads/generated
 */
export class DocumentCleanupService {
  /**
   * Membersihkan dokumen lama untuk letter instance tertentu.
   * Menghapus semua file dokumen dan PDF lama untuk letter instance tersebut.
   *
   * @param letterInstanceId ID dari letter instance
   * @param keepCurrentFile Path file opsional yang tetap dipertahankan
   */
  static async cleanupOldDocuments(
    letterInstanceId: string,
    keepCurrentFile?: string,
  ): Promise<void> {
    try {
      console.log(
        `[INFO] [DocumentCleanup] Starting cleanup for letterInstanceId: ${letterInstanceId}`,
      );

      // Ambil semua log generate untuk letter instance ini.
      const existingLogs = await Prisma.documentGenerationLog.findMany({
        where: { letterInstanceId },
        orderBy: { generatedAt: "desc" },
      });

      if (existingLogs.length === 0) {
        console.log(
          `[INFO] [DocumentCleanup] No existing logs found for: ${letterInstanceId}`,
        );
        return;
      }

      console.log(
        `[INFO] [DocumentCleanup] Found ${existingLogs.length} existing logs for: ${letterInstanceId}`,
      );

      let filesDeleted = 0;
      let logsDeleted = 0;

      // Proses setiap log.
      for (const log of existingLogs) {
        if (!log.filePath) {
          continue;
        }

        // Lewati file saat ini jika ditentukan.
        if (keepCurrentFile && log.filePath === keepCurrentFile) {
          console.log(
            `[INFO] [DocumentCleanup] Keeping current file: ${log.filePath}`,
          );
          continue;
        }

        // Hapus file fisik.
        const fullPath = path.join(process.cwd(), log.filePath);

        try {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            filesDeleted++;
            console.log(
              `[INFO] [DocumentCleanup] Deleted file: ${log.filePath}`,
            );

            // Coba juga hapus PDF pasangannya jika file DOCX.
            if (log.filePath.endsWith(".docx")) {
              const pdfPath = log.filePath.replace(".docx", ".pdf");
              const fullPdfPath = path.join(process.cwd(), pdfPath);

              if (fs.existsSync(fullPdfPath)) {
                fs.unlinkSync(fullPdfPath);
                filesDeleted++;
                console.log(`[INFO] [DocumentCleanup] Deleted PDF: ${pdfPath}`);
              }
            }
          } else {
            console.log(
              `[WARN] [DocumentCleanup] File not found (already deleted?): ${log.filePath}`,
            );
          }
        } catch (fileError) {
          console.error(
            `[ERROR] [DocumentCleanup] Failed to delete file ${log.filePath}:`,
            fileError,
          );
        }

        // Hapus log database (kecuali file yang dipertahankan).
        try {
          if (!keepCurrentFile || log.filePath !== keepCurrentFile) {
            await Prisma.documentGenerationLog.delete({
              where: { id: log.id },
            });
            logsDeleted++;
            console.log(`[INFO] [DocumentCleanup] Deleted log: ${log.id}`);
          }
        } catch (logError) {
          console.error(
            `[ERROR] [DocumentCleanup] Failed to delete log ${log.id}:`,
            logError,
          );
        }
      }

      console.log(
        `[SUCCESS] [DocumentCleanup] Cleanup completed for ${letterInstanceId}: ${filesDeleted} files deleted, ${logsDeleted} logs removed`,
      );
    } catch (error) {
      console.error(
        `[ERROR] [DocumentCleanup] Error during cleanup for ${letterInstanceId}:`,
        error,
      );
      // Jangan lempar error: kegagalan cleanup tidak boleh memutus proses utama.
    }
  }

  /**
   * Membersihkan semua file lama pada letter instance ini dan menyisakan yang terbaru.
   * Berguna untuk memastikan hanya ada 1 dokumen terakhir.
   */
  static async cleanupKeepLatest(letterInstanceId: string): Promise<void> {
    try {
      console.log(
        `[INFO] [DocumentCleanup] Cleanup keeping latest for: ${letterInstanceId}`,
      );

      // Ambil log generate terbaru.
      const latestLog = await Prisma.documentGenerationLog.findFirst({
        where: { letterInstanceId },
        orderBy: { generatedAt: "desc" },
      });

      if (!latestLog) {
        console.log(
          `[INFO] [DocumentCleanup] No logs found for: ${letterInstanceId}`,
        );
        return;
      }

      // Bersihkan semua kecuali yang terbaru.
      await this.cleanupOldDocuments(
        letterInstanceId,
        latestLog.filePath || undefined,
      );
    } catch (error) {
      console.error(
        `[ERROR] [DocumentCleanup] Error during latest cleanup for ${letterInstanceId}:`,
        error,
      );
    }
  }

  /**
   * Membersihkan file yatim, yaitu file yang ada di disk tetapi tidak ada di database.
   * Berguna untuk maintenance berkala.
   */
  static async cleanupOrphanedFiles(): Promise<void> {
    try {
      console.log(`[INFO] [DocumentCleanup] Starting orphaned files cleanup`);

      const uploadsDir = path.join(process.cwd(), "uploads", "generated");

      if (!fs.existsSync(uploadsDir)) {
        console.log(
          `[INFO] [DocumentCleanup] Uploads directory does not exist: ${uploadsDir}`,
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
              `[INFO] [DocumentCleanup] Deleted orphaned file: ${file}`,
            );
          } catch (error) {
            console.error(
              `[ERROR] [DocumentCleanup] Failed to delete orphaned file ${file}:`,
              error,
            );
          }
        }
      }

      console.log(
        `[SUCCESS] [DocumentCleanup] Orphaned cleanup completed: ${orphanedCount} files removed`,
      );
    } catch (error) {
      console.error(
        `[ERROR] [DocumentCleanup] Error during orphaned cleanup:`,
        error,
      );
    }
  }

  /**
   * Mengambil statistik file untuk kebutuhan monitoring.
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

        // Ekstrak letterInstanceId dari pola nama file: surat-rekomendasi-{letterInstanceId}-{timestamp}.{ext}
        const match = file.match(/^surat-rekomendasi-([^-]+)-\d+\.(docx|pdf)$/);
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
        `[ERROR] [DocumentCleanup] Error getting file statistics:`,
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
   * Membersihkan file sementara pada folder uploads/temp.
   * Menghapus file lama (lebih dari 1 jam) untuk mencegah penumpukan storage.
   * Aman dipanggil kapan saja, hanya menghapus file lama yang tidak sedang digunakan.
   */
  static async cleanupTempFiles(): Promise<void> {
    try {
      const tempDir = path.join(process.cwd(), "uploads", "temp");

      if (!fs.existsSync(tempDir)) {
        console.log(
          `[INFO] [DocumentCleanup] Temp directory does not exist: ${tempDir}`,
        );
        return;
      }

      const files = fs.readdirSync(tempDir);
      let deletedCount = 0;
      const oneHourMs = 60 * 60 * 1000; // 1 jam dalam milidetik

      console.log(
        `[INFO] [DocumentCleanup] Starting temp cleanup, found ${files.length} files`,
      );

      for (const file of files) {
        const filePath = path.join(tempDir, file);

        try {
          const stats = fs.statSync(filePath);
          const ageMs = Date.now() - stats.mtimeMs;

          // Hanya hapus file yang lebih tua dari 1 jam agar file aktif tidak ikut terhapus.
          if (ageMs > oneHourMs) {
            fs.unlinkSync(filePath);
            deletedCount++;
            const ageMinutes = Math.round(ageMs / (60 * 1000));
            console.log(
              `[INFO] [DocumentCleanup] Deleted old temp file (${ageMinutes} min old): ${file}`,
            );
          } else {
            const ageMinutes = Math.round(ageMs / (60 * 1000));
            console.log(
              `[INFO] [DocumentCleanup] Keeping fresh temp file (${ageMinutes} min old): ${file}`,
            );
          }
        } catch (error) {
          console.error(
            `[ERROR] [DocumentCleanup] Error processing temp file ${file}:`,
            error,
          );
        }
      }

      console.log(
        `[SUCCESS] [DocumentCleanup] Temp folder cleanup completed: ${deletedCount} old files removed`,
      );
    } catch (error) {
      console.error(
        `[ERROR] [DocumentCleanup] Error during temp cleanup:`,
        error,
      );
      // Jangan lempar error: kegagalan cleanup temp tidak boleh memutus proses utama.
    }
  }
}
