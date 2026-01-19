import { Elysia, t } from "elysia";
import { ApplicationController } from "./controllers/application.controller.ts";
import { AttachmentController } from "./controllers/attachment.controller.ts";

const suratRekomendasiRoutes = new Elysia({
    prefix: "/surat-rekomendasi",
    tags: ["surat-rekomendasi"],
})
    /**
     * Applications Management
     */
    .post("/applications", ApplicationController.createApplication, {
        body: t.Object({
            namaBeasiswa: t.String(),
            values: t.Record(t.String(), t.Any()),
        }),
    })
    .get("/applications", ApplicationController.listApplications, {
        query: t.Optional(
            t.Object({
                status: t.Optional(t.String()),
            }),
        ),
    })
    .get(
        "/applications/:applicationId",
        ApplicationController.getApplicationDetail,
        {
            params: t.Object({
                applicationId: t.String(),
            }),
        },
    )
    .post(
        "/applications/:applicationId/verify",
        ApplicationController.verifyApplication,
        {
            params: t.Object({
                applicationId: t.String(),
            }),
            body: t.Object({
                action: t.String({ enum: ["approve", "reject", "revision"] }),
                notes: t.Optional(t.String()),
            }),
        },
    )
    .get("/stats", ApplicationController.getStats)

    /**
     * Attachment Handling
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
    .get(
        "/:letterInstanceId/attachments",
        AttachmentController.getAttachments,
        {
            params: t.Object({
                letterInstanceId: t.String(),
            }),
        },
    )
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
