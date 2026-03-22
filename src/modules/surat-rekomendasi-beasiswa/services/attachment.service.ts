import { MinioService } from "../../../shared/services/minio.service.ts";
import { Prisma } from "../../../db/index.ts";

const db = Prisma;

interface UploadAttachmentParams {
  file: File;
  letterInstanceId: string;
  userId: string;
  category: "Utama" | "Tambahan";
}

/**
 * [SERVICE] AttachmentService - Manage file attachment untuk surat rekomendasi beasiswa
 *
 * Tanggung jawab utama service:
 * - Validasi file upload (size, MIME type, extension)
 * - Upload file ke MinIO storage
 * - Simpan metadata attachment ke database
 * - Generate URL download via API proxy
 * - Soft delete attachment
 * - List attachment per letter instance
 *
 * Struktur path MinIO:
 * surat-rekomendasi-beasiswa/<userId>/<letterInstanceId>/<category>/<timestamp>-<filename>
 *
 * Contoh:
 * surat-rekomendasi-beasiswa/user-123/letter-456/utama/1705054800000-cv.pdf
 */
export class AttachmentService {
  /**
   * [HELPER] inferAttachmentType - Menentukan jenis attachment dari MIME type/extension
   *
   * Mapping tipe:
   * - PDF => "File"
   * - Image (jpg/jpeg/png) => "Foto"
   * - Lainnya => "Lainnya"
   *
   * @param file - File yang akan diklasifikasikan
   * @returns Jenis attachment untuk disimpan ke database
   */
  private static inferAttachmentType(file: File): "File" | "Foto" | "Lainnya" {
    const mimeType = (file.type || "").toLowerCase();
    const fileName = file.name.toLowerCase();

    if (mimeType.includes("pdf") || fileName.endsWith(".pdf")) {
      return "File";
    }

    if (
      mimeType.includes("image") ||
      fileName.endsWith(".jpg") ||
      fileName.endsWith(".jpeg") ||
      fileName.endsWith(".png")
    ) {
      return "Foto";
    }

    return "Lainnya";
  }

  /**
   * [HELPER] buildMinioPath - Build path object MinIO yang aman
   *
   * Membuat path dengan filename sanitization:
   * - Karakter khusus diganti underscore
   * - Spasi diganti underscore
   * - Prefix timestamp agar nama unik
   *
   * @param userId - ID user pemilik file
   * @param letterInstanceId - ID surat terkait
   * @param category - Kategori attachment
   * @param filename - Nama file asli
   * @returns Full path object untuk MinIO
   */
  private static buildMinioPath(
    userId: string,
    letterInstanceId: string,
    category: string,
    filename: string,
  ): string {
    const timestamp = Date.now();
    // Sanitasi filename: remove karakter khusus dan ganti spasi dengan underscore
    const safeName = filename
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\s+/g, "_");

    return `surat-rekomendasi-beasiswa/${userId}/${letterInstanceId}/${category}/${timestamp}-${safeName}`;
  }

  /**
   * [SERVICE] uploadAttachment - Upload file attachment dan simpan metadata
   *
   * Alur proses:
   * 1. Validasi ukuran file (maks 5MB)
   * 2. Validasi tipe file (PDF/JPG/JPEG/PNG)
   * 3. Validasi jumlah file per kategori (maks 5)
   * 4. Upload file ke MinIO
   * 5. Simpan metadata ke database
   * 6. Return response DTO attachment
   *
   * @param params - Parameter upload (file, letterInstanceId, userId, category)
   * @returns Data attachment yang siap dipakai frontend
   * @throws Error jika validasi gagal atau proses upload/database gagal
   */
  static async uploadAttachment(params: UploadAttachmentParams): Promise<any> {
    const { file, letterInstanceId, userId, category } = params;

    console.log("[PROCESSING] Upload attachment:", {
      filename: file.name,
      size: file.size,
      letterInstanceId,
      userId,
      category,
    });

    // 1. Validasi ukuran file (5MB)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(
        `File ${file.name} terlalu besar. Maksimal 5MB, diterima ${(
          file.size /
          1024 /
          1024
        ).toFixed(2)}MB`,
      );
    }

    // 2. Validasi tipe file (PDF, JPG, PNG)
    const allowedMimeTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
    ];
    const lowerName = file.name.toLowerCase();
    const hasAllowedExt =
      lowerName.endsWith(".pdf") ||
      lowerName.endsWith(".jpg") ||
      lowerName.endsWith(".jpeg") ||
      lowerName.endsWith(".png");

    if (!allowedMimeTypes.includes(file.type || "") && !hasAllowedExt) {
      throw new Error(
        "Format file tidak didukung. Harap upload PDF, JPG, atau PNG.",
      );
    }

    try {
      // 3. Validasi jumlah file maksimum per kategori (maks 5)
      const existingCount = await db.attachment.count({
        where: {
          letterInstanceId,
          category,
          deletedAt: null,
        },
      });

      if (existingCount >= 5) {
        throw new Error(`Maksimal 5 file untuk kategori ${category}`);
      }

      // Build prefix path kategori untuk MinIO
      const categoryPath = `surat-rekomendasi-beasiswa/${userId}/${letterInstanceId}/${category}/`;

      // Infer jenis attachment berdasarkan file
      const attachmentType = AttachmentService.inferAttachmentType(file);

      // Upload ke MinIO menggunakan uploadFile
      const uploadResult = await MinioService.uploadFile(
        file,
        categoryPath,
        file.type || "application/octet-stream",
      );

      // Path aktual di MinIO = categoryPath + nameReplace dari upload
      const actualMinioPath = categoryPath + uploadResult.nameReplace;

      // Simpan metadata ke database dengan path MinIO aktual
      const attachment = await db.attachment.create({
        data: {
          domain: actualMinioPath, // Path aktual di MinIO
          filename: file.name, // Nama file asli
          fileSize: file.size, // Ukuran file dalam bytes
          mimeType: file.type || "application/octet-stream", // Tipe MIME
          category: category, // "Utama" atau "Tambahan"
          attachmentType: attachmentType, // "File", "Foto", atau "Lainnya"
          letterInstanceId: letterInstanceId, // Relasi ke letter instance
          createdAt: new Date(),
        },
      });

      console.log("[SUCCESS] Upload attachment berhasil:", {
        attachmentId: attachment.id,
        filename: attachment.filename,
        category: attachment.category,
      });

      return {
        id: attachment.id,
        filename: attachment.filename,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
        category: attachment.category,
        attachmentType: attachment.attachmentType,
        downloadUrl: `/api/surat-rekomendasi/attachments/${attachment.id}/download`,
        createdAt: attachment.createdAt,
      };
    } catch (error) {
      console.error("[ERROR] Upload attachment gagal:", error);
      throw error;
    }
  }

  /**
   * [SERVICE] getDownloadUrl - Generate API proxy URL untuk download attachment
   *
   * Get download URL untuk file yang sudah terupload.
   * Mengembalikan API proxy URL (bukan presigned MinIO URL).
   *
   * @param attachmentId - ID attachment
   * @param _expirySeconds - Parameter kompatibilitas (tidak dipakai karena proxy URL)
   * @returns URL endpoint download attachment
   * @throws Error jika attachment tidak ditemukan
   */
  static async getDownloadUrl(
    attachmentId: string,
    _expirySeconds: number = 3600,
  ): Promise<string> {
    const attachment = await db.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new Error(`Attachment ${attachmentId} not found`);
    }

    console.log("[INFO] Generate download URL:", { attachmentId });
    return `/api/surat-rekomendasi/attachments/${attachmentId}/download`;
  }

  /**
   * [SERVICE] deleteAttachment - Soft delete attachment + hapus file dari MinIO
   *
   * Alur delete:
   * 1. Validasi attachment exists
   * 2. Hapus object dari MinIO
   * 3. Soft delete record di database (set deletedAt)
   *
   * @param attachmentId - ID attachment yang akan dihapus
   * @throws Error jika attachment tidak ditemukan atau proses delete gagal
   */
  static async deleteAttachment(attachmentId: string): Promise<void> {
    try {
      console.log("[PROCESSING] Delete attachment:", { attachmentId });
      const attachment = await db.attachment.findUnique({
        where: { id: attachmentId },
      });

      if (!attachment) {
        throw new Error(`Attachment ${attachmentId} not found`);
      }

      // Hapus file dari MinIO
      await MinioService.deleteFile(
        "surat-rekomendasi-beasiswa",
        attachment.filename,
      );

      // Soft delete di database
      await db.attachment.update({
        where: { id: attachmentId },
        data: { deletedAt: new Date() },
      });

      console.log("[SUCCESS] Delete attachment berhasil:", {
        attachmentId,
      });
    } catch (error) {
      console.error("[ERROR] Delete attachment gagal:", error);
      throw error;
    }
  }

  /**
   * [SERVICE] getLetterAttachments - Ambil semua attachment untuk satu letter instance
   *
   * Mengambil list attachment aktif (bukan soft deleted),
   * diurutkan dari terbaru berdasarkan createdAt desc.
   *
   * @param letterInstanceId - ID surat yang ingin diambil attachment-nya
   * @returns Array attachment metadata untuk kebutuhan frontend
   * @throws Error jika query database gagal
   */
  static async getLetterAttachments(letterInstanceId: string): Promise<any[]> {
    try {
      console.log("[PROCESSING] Get letter attachments:", {
        letterInstanceId,
      });
      const attachments = await db.attachment.findMany({
        where: {
          letterInstanceId: letterInstanceId,
          deletedAt: null, // Exclude soft deleted
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      console.log("[SUCCESS] Get letter attachments selesai:", {
        letterInstanceId,
        total: attachments.length,
      });

      return attachments.map((att) => ({
        id: att.id,
        filename: att.filename,
        fileSize: att.fileSize,
        mimeType: att.mimeType,
        category: att.category,
        attachmentType: att.attachmentType,
        createdAt: att.createdAt,
      }));
    } catch (error) {
      console.error("[ERROR] Get letter attachments gagal:", error);
      throw error;
    }
  }
}
