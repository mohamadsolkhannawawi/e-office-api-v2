import { Elysia, t } from "elysia";
import { ApplicationController } from "./controllers/application.controller.ts";
import { AttachmentController } from "./controllers/attachment.controller.ts";

const suratRekomendasiRoutes = new Elysia({
    prefix: "/surat-rekomendasi",
    tags: ["surat-rekomendasi"],
})
    /**
     * POST /surat-rekomendasi/applications
     * Create new scholarship application
     */
    .post("/applications", ApplicationController.createApplication, {
        body: t.Object({
            namaBeasiswa: t.String(),
            values: t.Record(t.String(), t.Any()), // JSON dengan ipk, ips, noHp, dll
        }),
    })

    /**
     * GET /surat-rekomendasi/applications
     * List all scholarship applications
     */
    .get("/applications", ApplicationController.listApplications)

    /**
     * GET /surat-rekomendasi/applications/:applicationId
     * Get application detail
     */
    .get(
        "/applications/:applicationId",
        ApplicationController.getApplicationDetail,
        {
            params: t.Object({
                applicationId: t.String(),
            }),
        },
    )

    /**
     * POST /surat-rekomendasi/:letterInstanceId/upload
     * Upload attachment
     */
    .post("/:letterInstanceId/upload", AttachmentController.uploadAttachment, {
        params: t.Object({
            letterInstanceId: t.String(),
        }),
        body: t.Object({
            file: t.File(),
            category: t.String({ enum: ["Utama", "Tambahan"] }),
        }),
    })

    /**
     * GET /surat-rekomendasi/:letterInstanceId/attachments
     * Get all attachments
     */
    .get(
        "/:letterInstanceId/attachments",
        AttachmentController.getAttachments,
        {
            params: t.Object({
                letterInstanceId: t.String(),
            }),
        },
    )

    /**
     * DELETE /surat-rekomendasi/attachments/:attachmentId
     * Delete attachment
     */
    .delete(
        "/attachments/:attachmentId",
        AttachmentController.deleteAttachment,
        {
            params: t.Object({
                attachmentId: t.String(),
            }),
        },
    );

export default suratRekomendasiRoutes;
