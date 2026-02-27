import { Prisma } from "../../../db/index.ts";
import { AttachmentService } from "../services/attachment.service.ts";
import { MinioService } from "../../../shared/services/minio.service.ts";
import { Readable } from "node:stream";

const db = Prisma;

export class AttachmentController {
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

            console.log("📤 [uploadAttachment] Started with:", {
                letterInstanceId,
                category,
                fileName: file?.name,
            });

            // Verify letter instance exists - use findFirst without soft delete filter
            console.log(
                `🔍 [uploadAttachment] Checking if letterInstance exists: ${letterInstanceId}`,
            );
            const letterInstance = await db.letterInstance.findFirst({
                where: { id: letterInstanceId },
            });

            console.log(
                "📦 [uploadAttachment] letterInstance query result:",
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
                    `❌ [uploadAttachment] Letter instance not found for ID: ${letterInstanceId}`,
                    "Possible reasons: not created yet, deleted, or wrong ID",
                );
                set.status = 404;
                return { error: "Letter instance not found" };
            }

            // Skip ownership check for now

            // Upload attachment
            const attachment = await AttachmentService.uploadAttachment({
                file,
                letterInstanceId,
                userId: letterInstance.createdById,
                category: category as "Utama" | "Tambahan",
            });

            set.status = 201;
            return {
                success: true,
                data: attachment,
            };
        } catch (error) {
            console.error("Upload attachment error:", error);
            set.status = 500;
            return {
                error: error instanceof Error ? error.message : "Upload failed",
            };
        }
    }

    static async getAttachments({ params, set }: { params: any; set: any }) {
        try {
            const { letterInstanceId } = params;

            console.log(
                "📋 [getAttachments] Fetching for letterInstanceId:",
                letterInstanceId,
            );

            // Verify letter instance exists - use findFirst without soft delete filter
            const letterInstance = await db.letterInstance.findFirst({
                where: { id: letterInstanceId },
            });

            if (!letterInstance) {
                console.error(
                    `❌ [getAttachments] Letter instance not found: ${letterInstanceId}`,
                );
                set.status = 404;
                return { error: "Letter instance not found" };
            }

            // Skip ownership check for now

            // Get attachments
            const attachments =
                await AttachmentService.getLetterAttachments(letterInstanceId);

            return {
                success: true,
                data: attachments,
            };
        } catch (error) {
            console.error("Get attachments error:", error);
            set.status = 500;
            return {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch attachments",
            };
        }
    }

    static async deleteAttachment({ params, set }: { params: any; set: any }) {
        try {
            const { attachmentId } = params;

            // Verify attachment exists
            const attachment = await db.attachment.findUnique({
                where: { id: attachmentId },
                include: { letterInstance: true },
            });

            if (!attachment) {
                set.status = 404;
                return { error: "Attachment not found" };
            }

            // Skip ownership check for now

            // Delete
            await AttachmentService.deleteAttachment(attachmentId);

            return {
                success: true,
                message: "Attachment deleted successfully",
            };
        } catch (error) {
            console.error("Delete attachment error:", error);
            set.status = 500;
            return {
                error: error instanceof Error ? error.message : "Delete failed",
            };
        }
    }

    /**
     * Proxy file dari MinIO ke browser.
     * Browser tidak bisa akses MinIO langsung (localhost / internal),
     * jadi file di-stream lewat API server ini.
     */
    static async downloadAttachment({
        params,
        set,
    }: {
        params: any;
        set: any;
    }) {
        try {
            const { attachmentId } = params;

            const attachment = await db.attachment.findUnique({
                where: { id: attachmentId },
            });

            if (!attachment || attachment.deletedAt) {
                set.status = 404;
                return { error: "Attachment not found" };
            }

            // Stream file dari MinIO via internal connection (localhost)
            const { stat, stream } = await MinioService.getFileStream(
                attachment.domain,
            );

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

            // Convert MinIO stream (Node Readable) to a Web ReadableStream for Elysia
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
            console.error("Download attachment error:", error);
            set.status = 500;
            return {
                error:
                    error instanceof Error ? error.message : "Download failed",
            };
        }
    }
}
