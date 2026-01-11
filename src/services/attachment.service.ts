import { MinioService } from "./minio.service.ts";
import { Prisma } from "../db/index.ts";

const db = Prisma;

interface UploadAttachmentParams {
    file: File;
    letterInstanceId: string;
    userId: string;
    category: "Utama" | "Tambahan";
}

/**
 * Service untuk handle upload attachment ke MinIO dan simpan metadata ke database
 *
 * Path structure: surat-rekomendasi-beasiswa/<userId>/<letterInstanceId>/<category>/<timestamp>-<filename>
 *
 * Example:
 * surat-rekomendasi-beasiswa/user-123/letter-456/utama/1705054800000-cv.pdf
 */
export class AttachmentService {
    /**
     * Infer attachment type berdasarkan file MIME type atau extension
     */
    private static inferAttachmentType(
        file: File
    ): "File" | "Foto" | "Lainnya" {
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
     * Build MinIO path untuk attachment
     */
    private static buildMinioPath(
        userId: string,
        letterInstanceId: string,
        category: string,
        filename: string
    ): string {
        const timestamp = Date.now();
        // Sanitize filename: remove special chars, replace spaces with underscores
        const safeName = filename
            .replace(/[^a-zA-Z0-9._-]/g, "_")
            .replace(/\s+/g, "_");

        return `surat-rekomendasi-beasiswa/${userId}/${letterInstanceId}/${category}/${timestamp}-${safeName}`;
    }

    /**
     * Upload attachment file ke MinIO dan simpan metadata ke database
     */
    static async uploadAttachment(
        params: UploadAttachmentParams
    ): Promise<any> {
        const { file, letterInstanceId, userId, category } = params;

        // Validate file size (5MB)
        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > MAX_FILE_SIZE) {
            throw new Error(
                `File ${file.name} terlalu besar. Maksimal 5MB, diterima ${(
                    file.size /
                    1024 /
                    1024
                ).toFixed(2)}MB`
            );
        }

        try {
            // Build category path prefix for MinIO
            const categoryPath = `surat-rekomendasi-beasiswa/${userId}/${letterInstanceId}/${category}/`;

            // Infer attachment type
            const attachmentType = AttachmentService.inferAttachmentType(file);

            // Upload ke MinIO menggunakan uploadFile method
            const uploadResult = await MinioService.uploadFile(
                file,
                categoryPath,
                file.type || "application/octet-stream"
            );

            // Actual path di MinIO = categoryPath + nameReplace dari upload
            const actualMinioPath = categoryPath + uploadResult.nameReplace;

            // Save metadata ke database with actual MinIO path
            const attachment = await db.attachment.create({
                data: {
                    domain: actualMinioPath, // Actual path di MinIO
                    filename: file.name, // Original filename
                    fileSize: file.size, // File size in bytes
                    mimeType: file.type || "application/octet-stream", // MIME type
                    category: category, // "Utama" atau "Tambahan"
                    attachmentType: attachmentType, // "File", "Foto", atau "Lainnya"
                    letterInstanceId: letterInstanceId, // Link ke letter instance
                    createdAt: new Date(),
                },
            });

            return {
                id: attachment.id,
                filename: attachment.filename,
                fileSize: attachment.fileSize,
                mimeType: attachment.mimeType,
                category: attachment.category,
                attachmentType: attachment.attachmentType,
                downloadUrl: uploadResult.url, // Pre-signed URL (7 hari)
                createdAt: attachment.createdAt,
            };
        } catch (error) {
            console.error("Attachment upload error:", error);
            throw error;
        }
    }

    /**
     * Get pre-signed download URL untuk file yang sudah terupload
     */
    static async getDownloadUrl(
        attachmentId: string,
        expirySeconds: number = 3600 // Default 1 hour
    ): Promise<string> {
        try {
            const attachment = await db.attachment.findUnique({
                where: { id: attachmentId },
            });

            if (!attachment) {
                throw new Error(`Attachment ${attachmentId} not found`);
            }

            // Generate pre-signed URL
            const url = await MinioService.getPresignedUrl(
                "surat-rekomendasi-beasiswa",
                attachment.filename,
                expirySeconds
            );

            return url;
        } catch (error) {
            console.error("Get download URL error:", error);
            throw error;
        }
    }

    /**
     * Delete attachment dari MinIO dan database
     */
    static async deleteAttachment(attachmentId: string): Promise<void> {
        try {
            const attachment = await db.attachment.findUnique({
                where: { id: attachmentId },
            });

            if (!attachment) {
                throw new Error(`Attachment ${attachmentId} not found`);
            }

            // Delete dari MinIO
            await MinioService.deleteFile(
                "surat-rekomendasi-beasiswa",
                attachment.filename
            );

            // Soft delete di database
            await db.attachment.update({
                where: { id: attachmentId },
                data: { deletedAt: new Date() },
            });
        } catch (error) {
            console.error("Delete attachment error:", error);
            throw error;
        }
    }

    /**
     * Get semua attachments untuk sebuah letter instance
     */
    static async getLetterAttachments(
        letterInstanceId: string
    ): Promise<any[]> {
        try {
            const attachments = await db.attachment.findMany({
                where: {
                    letterInstanceId: letterInstanceId,
                    deletedAt: null, // Exclude soft deleted
                },
                orderBy: {
                    createdAt: "desc",
                },
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
            console.error("Get letter attachments error:", error);
            throw error;
        }
    }
}
