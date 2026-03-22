import { Prisma } from "../../../db/index.ts";
import { AttachmentService } from "../services/attachment.service.ts";
import { MinioService } from "../../../shared/services/minio.service.ts";
import { Readable } from "node:stream";

const db = Prisma;

export class AttachmentController {
  /**
   * [ENDPOINT] uploadAttachment - Upload attachment file untuk letter instance
   *
   * Upload file attachment (Utama atau Tambahan) ke letter instance tertentu.
   * File di-simpan di MinIO dan metadata di-record di database.
   *
   * @param params - { letterInstanceId }
   * @param body - { file, category } dimana category = "Utama" | "Tambahan"
   * @param set - HTTP response setter
   * @returns { success: boolean, data: attachment }
   */
  static async uploadAttachment({
    params,
    body,
    set,
  }: {
    params: any;
    body: any;
    set: any;
  }) {
    try {
      const { letterInstanceId } = params;
      const { file, category } = body;

      console.log("[PROCESSING] Upload attachment dimulai dengan:", {
        letterInstanceId,
        category,
        fileName: file?.name,
      });

      // Verifikasi letter instance exists - gunakan findFirst tanpa soft delete filter
      console.log("[INFO] Cek apakah letterInstance ada:", letterInstanceId);
      const letterInstance = await db.letterInstance.findFirst({
        where: { id: letterInstanceId },
      });

      console.log(
        "[INFO] Query hasil letterInstance:",
        letterInstance
          ? {
              FOUND: true,
              id: letterInstance.id,
              scholarshipName: letterInstance.scholarshipName,
              deletedAt: letterInstance.deletedAt,
            }
          : "NOT FOUND",
      );

      if (!letterInstance) {
        console.error(
          "[ERROR] Letter instance tidak ditemukan untuk ID:",
          letterInstanceId,
          "Kemungkinan: belum dibuat, sudah dihapus, atau ID salah",
        );
        set.status = 404;
        return { error: "Letter instance not found" };
      }

      // Abaikan ownership check untuk sekarang

      // Upload attachment
      const attachment = await AttachmentService.uploadAttachment({
        file,
        letterInstanceId,
        userId: letterInstance.createdById,
        category: category as "Utama" | "Tambahan",
      });

      set.status = 201;
      console.log("[SUCCESS] Attachment berhasil diupload:", {
        attachmentId: attachment.id,
        letterInstanceId,
        category,
        filename: attachment.filename,
      });
      return {
        success: true,
        data: attachment,
      };
    } catch (error) {
      console.error("[ERROR] Upload attachment gagal:", error);
      set.status = 500;
      return {
        error: error instanceof Error ? error.message : "Upload failed",
      };
    }
  }

  /**
   * [ENDPOINT] getAttachments - Fetch semua attachments untuk letter instance
   *
   * Retrieve daftar semua attachment (Utama dan Tambahan) yang ter-link pada
   * letter instance tertentu dengan metadata lengkap.
   *
   * @param params - { letterInstanceId }
   * @param set - HTTP response setter
   * @returns { success: boolean, data: attachments[] }
   */
  static async getAttachments({ params, set }: { params: any; set: any }) {
    try {
      const { letterInstanceId } = params;

      console.log(
        "[INFO] Fetch attachments untuk letterInstanceId:",
        letterInstanceId,
      );

      // Verifikasi letter instance exists - gunakan findFirst tanpa soft delete filter
      const letterInstance = await db.letterInstance.findFirst({
        where: { id: letterInstanceId },
      });

      if (!letterInstance) {
        console.error(
          "[ERROR] Letter instance tidak ditemukan:",
          letterInstanceId,
        );
        set.status = 404;
        return { error: "Letter instance not found" };
      }

      // Abaikan ownership check untuk sekarang

      // Ambil attachments
      const attachments =
        await AttachmentService.getLetterAttachments(letterInstanceId);

      console.log("[SUCCESS] Attachments berhasil diambil:", {
        letterInstanceId,
        count: attachments.length,
      });
      return {
        success: true,
        data: attachments,
      };
    } catch (error) {
      console.error("[ERROR] Get attachments gagal:", error);
      set.status = 500;
      return {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch attachments",
      };
    }
  }

  /**
   * [ENDPOINT] deleteAttachment - Hapus attachment berdasarkan ID
   *
   * Soft delete atau hard delete attachment dari database dan MinIO storage.
   * Attachment tidak bisa dikembalikan setelah dihapus.
   *
   * @param params - { attachmentId }
   * @param set - HTTP response setter
   * @returns { success: boolean, message: string }
   */
  static async deleteAttachment({ params, set }: { params: any; set: any }) {
    try {
      const { attachmentId } = params;

      console.log("[PROCESSING] Delete attachment untuk ID:", attachmentId);

      // Verifikasi attachment exists
      const attachment = await db.attachment.findUnique({
        where: { id: attachmentId },
        include: { letterInstance: true },
      });

      if (!attachment) {
        console.error("[ERROR] Attachment tidak ditemukan:", attachmentId);
        set.status = 404;
        return { error: "Attachment not found" };
      }

      // Abaikan ownership check untuk sekarang

      // Hapus attachment
      await AttachmentService.deleteAttachment(attachmentId);

      console.log("[SUCCESS] Attachment berhasil dihapus:", {
        attachmentId,
        filename: attachment.filename,
      });
      return {
        success: true,
        message: "Attachment deleted successfully",
      };
    } catch (error) {
      console.error("[ERROR] Delete attachment gagal:", error);
      set.status = 500;
      return {
        error: error instanceof Error ? error.message : "Delete failed",
      };
    }
  }

  /**
   * [ENDPOINT] downloadAttachment - Download/stream attachment file ke browser
   *
   * Proxy file dari MinIO ke browser karena browser tidak bisa akses MinIO langsung
   * (localhost/internal network). File di-stream dengan response headers yang tepat
   * untuk inline preview atau download.
   *
   * Fitur:
   * - Stream file dari MinIO storage
   * - Set proper content-type, content-length, dan cache headers
   * - Support inline preview (image, pdf) atau direct download
   *
   * @param params - { attachmentId }
   * @param set - HTTP response setter
   * @returns Response dengan file stream sebagai body
   */
  static async downloadAttachment({ params, set }: { params: any; set: any }) {
    try {
      const { attachmentId } = params;

      console.log("[PROCESSING] Download attachment untuk ID:", attachmentId);

      const attachment = await db.attachment.findUnique({
        where: { id: attachmentId },
      });

      if (!attachment || attachment.deletedAt) {
        console.error(
          "[ERROR] Attachment tidak ditemukan atau sudah dihapus:",
          attachmentId,
        );
        set.status = 404;
        return { error: "Attachment not found" };
      }

      // Stream file dari MinIO via internal connection (localhost)
      const { stat, stream } = await MinioService.getFileStream(
        attachment.domain,
      );

      console.log("[INFO] File stream diterima dari MinIO:", {
        attachmentId,
        filename: attachment.filename,
        fileSize: stat.size,
        contentType: attachment.mimeType,
      });

      // Set response headers
      const contentType =
        attachment.mimeType ||
        stat.metaData["content-type"] ||
        "application/octet-stream";
      const safeFilename = encodeURIComponent(attachment.filename);

      set.headers["content-type"] = contentType;
      set.headers["content-length"] = String(stat.size);
      set.headers["content-disposition"] =
        `inline; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`;
      set.headers["cache-control"] = "private, max-age=3600";

      console.log("[SUCCESS] Attachment siap untuk download:", {
        attachmentId,
        filename: attachment.filename,
        fileSize: stat.size,
      });

      // Convert MinIO stream (Node Readable) ke Web ReadableStream untuk Elysia
      return new Response(
        Readable.toWeb(stream as unknown as Readable) as ReadableStream,
        {
          headers: {
            "content-type": contentType,
            "content-length": String(stat.size),
            "content-disposition": `inline; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
            "cache-control": "private, max-age=3600",
          },
        },
      );
    } catch (error) {
      console.error("[ERROR] Download attachment gagal:", error);
      set.status = 500;
      return {
        error: error instanceof Error ? error.message : "Download failed",
      };
    }
  }
}
