import { Prisma } from "../../../db/index.ts";
import { AttachmentService } from "../services/attachment.service.ts";

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

            // Verify letter instance exists
            const letterInstance = await db.letterInstance.findUnique({
                where: { id: letterInstanceId },
            });

            if (!letterInstance) {
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

            // Verify letter instance exists
            const letterInstance = await db.letterInstance.findUnique({
                where: { id: letterInstanceId },
            });

            if (!letterInstance) {
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
}
