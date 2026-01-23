import { Elysia, t } from "elysia";
import { ApplicationController } from "./controllers/application.controller.ts";
import { AttachmentController } from "./controllers/attachment.controller.ts";
import { auth } from "@backend/lib/auth.ts";
import { Prisma } from "@backend/db/index.ts";

const suratRekomendasiRoutes = new Elysia({
    prefix: "/surat-rekomendasi",
    tags: ["surat-rekomendasi"],
})
    .derive(async ({ headers }) => {
        try {
            const session = await auth.api.getSession({
                headers,
            });

            if (!session || !session.user) {
                return {
                    user: null,
                    session: null,
                };
            }

            // Fetch user roles and roleId
            const userRoles = await Prisma.userRole.findMany({
                where: { userId: session.user.id },
                include: { role: true },
            });

            const roles = userRoles.map((ur) => ur.role.name);
            const roleId = userRoles[0]?.roleId; // Get first roleId if exists

            // Enrich user object with roles and roleId
            const enrichedUser = {
                ...session.user,
                roles,
                roleId,
            };

            return {
                user: enrichedUser,
                session,
            };
        } catch (error) {
            console.error("Derive error:", error);
            return {
                user: null,
                session: null,
            };
        }
    })
    /**
     * Applications Management
     */
    .post("/applications", ApplicationController.createApplication, {
        body: t.Object({
            namaBeasiswa: t.String(),
            values: t.Object({
                // Required input fields
                tempat_lahir: t.String(),
                tanggal_lahir: t.String(),
                no_hp: t.String(),
                semester: t.Number(),
                ipk: t.Number(),
                ips: t.Number(),
                nama_beasiswa: t.String(),
                lampiran: t.Object({
                    ktm: t.String(), // URI
                    khs: t.String(), // URI
                }),
                // Optional/Auto fields that might be passed or added by frontend
                nama_lengkap: t.Optional(t.String()),
                nim: t.Optional(t.String()),
                email: t.Optional(t.String()),
                departemen: t.Optional(t.String()),
                prodi: t.Optional(t.String()),
                role: t.Optional(t.String()),
            }),
        }),
    })
    .post("/applications/draft", ApplicationController.createDraft, {
        body: t.Object({
            namaBeasiswa: t.Optional(t.String()),
            values: t.Optional(t.Any()),
        }),
    })
    .put(
        "/applications/:applicationId",
        ApplicationController.updateApplication,
        {
            params: t.Object({
                applicationId: t.String(),
            }),
            body: t.Object({
                namaBeasiswa: t.Optional(t.String()),
                values: t.Optional(t.Any()),
                status: t.Optional(t.String()),
            }),
        }
    )
    .get("/applications", ApplicationController.listApplications, {
        query: t.Optional(
            t.Object({
                status: t.Optional(t.String()),
                page: t.Optional(t.String()),
                limit: t.Optional(t.String()),
                currentStep: t.Optional(t.String()),
                mode: t.Optional(t.String()),
                search: t.Optional(t.String()),
                jenisBeasiswa: t.Optional(t.String()),
            })
        ),
    })
    .get(
        "/applications/:applicationId",
        ApplicationController.getApplicationDetail,
        {
            params: t.Object({
                applicationId: t.String(),
            }),
        }
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
                targetStep: t.Optional(t.Number()), // For dynamic revisions
                signatureUrl: t.Optional(t.String()), // For WD1 approval
                letterNumber: t.Optional(t.String()), // For UPA publishing
            }),
        }
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
        }
    )
    .delete(
        "/attachments/:attachmentId",
        AttachmentController.deleteAttachment,
        {
            params: t.Object({
                attachmentId: t.String(),
            }),
        }
    );

export default suratRekomendasiRoutes;
