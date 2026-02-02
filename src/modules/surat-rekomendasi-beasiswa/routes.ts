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
        },
    )
    .put(
        "/applications/:applicationId/signature",
        ApplicationController.saveSignature,
        {
            params: t.Object({
                applicationId: t.String(),
            }),
            body: t.Object({
                signatureUrl: t.String(),
            }),
        },
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
                startDate: t.Optional(t.String()),
                endDate: t.Optional(t.String()),
                sortOrder: t.Optional(t.String()),
            }),
        ),
    })
    .get(
        "/applications/:applicationId/check",
        async ({ params, user, set }) => {
            try {
                if (!user) {
                    set.status = 401;
                    return { valid: false, error: "Unauthorized" };
                }

                const applicationId = params.applicationId;
                console.log(
                    `🔍 [check] Validating application: ${applicationId}`,
                );

                const application =
                    await ApplicationController.getApplicationDetailService(
                        applicationId,
                    );

                if (!application) {
                    console.warn(
                        `⚠️ [check] Application not found, should redirect to create: ${applicationId}`,
                    );
                    set.status = 404;
                    return {
                        valid: false,
                        error: "Application not found or has been deleted",
                        shouldRedirect: true,
                        redirectTo:
                            "/mahasiswa/surat/surat-rekomendasi-beasiswa/baru",
                    };
                }

                if (application.createdById !== user.id) {
                    console.warn(
                        `⚠️ [check] User unauthorized for application: ${applicationId}`,
                    );
                    set.status = 403;
                    return {
                        valid: false,
                        error: "You do not have access to this application",
                        shouldRedirect: true,
                        redirectTo: "/mahasiswa/surat",
                    };
                }

                return {
                    valid: true,
                    applicationId: application.id,
                    scholarshipName: application.scholarshipName,
                    status: application.status,
                };
            } catch (error) {
                console.error("[check] Error:", error);
                set.status = 500;
                return {
                    valid: false,
                    error: error instanceof Error ? error.message : "Error",
                };
            }
        },
        {
            params: t.Object({
                applicationId: t.String(),
            }),
        },
    )
    .get(
        "/applications/:applicationId/or-create",
        async ({ params, user, set }) => {
            return ApplicationController.getApplicationOrCreate({
                params,
                user,
                set,
            });
        },
        {
            params: t.Object({
                applicationId: t.String(),
            }),
        },
    )
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
                targetStep: t.Optional(t.Number()), // For dynamic revisions
                signatureUrl: t.Optional(t.String()), // For WD1 approval
                letterNumber: t.Optional(t.String()), // For UPA publishing
            }),
        },
    )
    .get("/stats", ApplicationController.getStats)
    .delete(
        "/applications/:applicationId",
        ApplicationController.deleteApplication,
        {
            params: t.Object({
                applicationId: t.String(),
            }),
        },
    )

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
    )
    .get("/debug/all-instances", async ({ user }) => {
        try {
            if (!user) {
                return { error: "Unauthorized" };
            }

            const instances = await Prisma.letterInstance.findMany({
                where: {
                    createdById: user.id,
                },
                select: {
                    id: true,
                    scholarshipName: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                    deletedAt: true,
                    letterTypeId: true,
                },
                orderBy: { createdAt: "desc" },
                take: 50,
            });

            return {
                count: instances.length,
                userId: user.id,
                instances,
            };
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : "Error",
            };
        }
    })
    .get(
        "/debug/instance-by-id/:instanceId",
        async ({ params }) => {
            try {
                const instance = await Prisma.letterInstance.findFirst({
                    where: {
                        id: params.instanceId,
                    },
                    include: {
                        letterType: true,
                        attachments: true,
                        createdBy: {
                            select: {
                                id: true,
                                email: true,
                                name: true,
                            },
                        },
                    },
                });

                if (!instance) {
                    return {
                        error: "Instance not found",
                        instanceId: params.instanceId,
                        message: "This instance does not exist in the database",
                    };
                }

                return {
                    success: true,
                    instance,
                    isDeleted: instance.deletedAt !== null,
                };
            } catch (error) {
                return {
                    error: error instanceof Error ? error.message : "Error",
                };
            }
        },
        {
            params: t.Object({
                instanceId: t.String(),
            }),
        },
    )
    .get(
        "/debug/instance-with-deleted/:instanceId",
        async ({ params }) => {
            try {
                const instance = await Prisma.letterInstance.findFirst({
                    where: {
                        id: params.instanceId,
                    },
                    include: {
                        letterType: true,
                        attachments: {
                            include: {},
                        },
                        createdBy: {
                            select: {
                                id: true,
                                email: true,
                                name: true,
                            },
                        },
                        history: {
                            orderBy: { createdAt: "desc" },
                            take: 10,
                        },
                    },
                });

                if (!instance) {
                    return {
                        error: "Instance not found in database (including soft-deleted)",
                        instanceId: params.instanceId,
                    };
                }

                return {
                    success: true,
                    instance,
                    isDeleted: instance.deletedAt !== null,
                    deletedAt: instance.deletedAt,
                };
            } catch (error) {
                return {
                    error: error instanceof Error ? error.message : "Error",
                };
            }
        },
        {
            params: t.Object({
                instanceId: t.String(),
            }),
        },
    )
    .get(
        "/validate/:instanceId",
        async ({ params, user, set }) => {
            try {
                if (!user) {
                    set.status = 401;
                    return { error: "Unauthorized" };
                }

                const instance = await Prisma.letterInstance.findFirst({
                    where: {
                        id: params.instanceId,
                        deletedAt: null, // Only check non-deleted instances
                    },
                    select: {
                        id: true,
                        createdById: true,
                        scholarshipName: true,
                        status: true,
                    },
                });

                if (!instance) {
                    set.status = 404;
                    return {
                        valid: false,
                        error: "Surat tidak ditemukan atau telah dihapus",
                        instanceId: params.instanceId,
                    };
                }

                if (instance.createdById !== user.id) {
                    set.status = 403;
                    return {
                        valid: false,
                        error: "Anda tidak memiliki akses ke surat ini",
                        instanceId: params.instanceId,
                    };
                }

                return {
                    valid: true,
                    instance: {
                        id: instance.id,
                        scholarshipName: instance.scholarshipName,
                        status: instance.status,
                    },
                };
            } catch (error) {
                set.status = 500;
                return {
                    error: error instanceof Error ? error.message : "Error",
                };
            }
        },
        {
            params: t.Object({
                instanceId: t.String(),
            }),
        },
    );

export default suratRekomendasiRoutes;
