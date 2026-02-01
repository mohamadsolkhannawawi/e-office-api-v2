import { Elysia, t } from "elysia";
import { Prisma } from "@backend/db/index.ts";
import { auth } from "@backend/lib/auth.ts";
import { MinioService } from "@backend/shared/services/minio.service.ts";
import { ApplicationController } from "@backend/modules/surat-rekomendasi-beasiswa/controllers/application.controller.ts";

/**
 * User Stamp Routes (UPA)
 * CRUD operations untuk stamp templates yang tersimpan per user (UPA)
 */
const stampRoutes = new Elysia({
    prefix: "/stamps",
    tags: ["stamps"],
})
    .derive(async ({ headers }) => {
        const session = await auth.api.getSession({
            headers,
        });
        return {
            user: session?.user,
            session,
        };
    })
    .onBeforeHandle(async () => {
        // Ensure MinIO bucket exists
        await MinioService.ensureBucket();
    })

    /**
     * Get all stamps for current user
     * GET /stamps
     */
    .get("/", async ({ user }) => {
        if (!user) {
            throw new Error("Unauthorized");
        }

        const stamps = await Prisma.userStamp.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
        });

        return {
            success: true,
            data: stamps,
        };
    })

    /**
     * Create new stamp template
     * POST /stamps
     * Body: { url: string (base64 or image URL), stampType: "TEMPLATE" | "DRAWN" | "UPLOADED" }
     */
    .post(
        "/",
        async ({ user, body }) => {
            if (!user) {
                throw new Error("Unauthorized");
            }

            let finalUrl = body.url;

            // If URL is a base64 data URL, convert and upload to MinIO
            if (body.url.startsWith("data:image")) {
                try {
                    // Parse base64 data
                    const matches = body.url.match(
                        /^data:image\/(\w+);base64,(.+)$/,
                    );
                    if (!matches || !matches[2]) {
                        throw new Error("Invalid base64 image format");
                    }

                    const [, extension, base64Data] = matches;
                    const buffer = Buffer.from(base64Data, "base64");

                    // Create a File-like object for MinIO
                    const fileName = `stamp_${user.id}_${Date.now()}.${extension}`;
                    const file = new File([buffer], fileName, {
                        type: `image/${extension}`,
                    });

                    // Upload to MinIO using static method
                    const uploadResult = await MinioService.uploadFile(
                        file,
                        "stamp/",
                        `image/${extension}`,
                    );
                    finalUrl = uploadResult.url;
                } catch (error) {
                    console.error("MinIO upload error:", error);
                    throw new Error(
                        "Failed to upload stamp to storage: " +
                            (error instanceof Error
                                ? error.message
                                : String(error)),
                    );
                }
            }

            try {
                const stamp = await Prisma.userStamp.create({
                    data: {
                        userId: user.id,
                        url: finalUrl,
                        stampType: body.stampType || "UPLOADED",
                        isDefault: false, // User must explicitly set as default
                    },
                });

                return {
                    success: true,
                    data: stamp,
                };
            } catch (error) {
                console.error("Create stamp error:", error);
                throw new Error(
                    "Failed to create stamp: " +
                        (error instanceof Error
                            ? error.message
                            : String(error)),
                );
            }
        },
        {
            body: t.Object({
                url: t.String(),
                stampType: t.Optional(
                    t.Union([
                        t.Literal("TEMPLATE"),
                        t.Literal("DRAWN"),
                        t.Literal("UPLOADED"),
                    ]),
                ),
            }),
        },
    )

    /**
     * Set stamp as default
     * PATCH /stamps/:id/default
     */
    .patch(
        "/:id/default",
        async ({ user, params }) => {
            if (!user) {
                throw new Error("Unauthorized");
            }

            try {
                // Verify stamp belongs to user
                const stamp = await Prisma.userStamp.findUnique({
                    where: { id: params.id },
                });

                if (!stamp || stamp.userId !== user.id) {
                    throw new Error("Stamp not found or unauthorized");
                }

                // Remove default from all other stamps
                await Prisma.userStamp.updateMany({
                    where: { userId: user.id },
                    data: { isDefault: false },
                });

                // Set this stamp as default
                const updated = await Prisma.userStamp.update({
                    where: { id: params.id },
                    data: { isDefault: true },
                });

                return {
                    success: true,
                    data: updated,
                };
            } catch (error) {
                console.error("Set default stamp error:", error);
                throw new Error(
                    "Failed to set default stamp: " +
                        (error instanceof Error
                            ? error.message
                            : String(error)),
                );
            }
        },
        {
            params: t.Object({ id: t.String() }),
        },
    )

    /**
     * Delete stamp template
     * DELETE /stamps/:id
     */
    .delete(
        "/:id",
        async ({ user, params }) => {
            if (!user) {
                throw new Error("Unauthorized");
            }

            try {
                // Verify stamp belongs to user
                const stamp = await Prisma.userStamp.findUnique({
                    where: { id: params.id },
                });

                if (!stamp || stamp.userId !== user.id) {
                    throw new Error("Stamp not found or unauthorized");
                }

                await Prisma.userStamp.delete({
                    where: { id: params.id },
                });

                return {
                    success: true,
                    data: { message: "Stamp deleted successfully" },
                };
            } catch (error) {
                console.error("Delete stamp error:", error);
                throw new Error(
                    "Failed to delete stamp: " +
                        (error instanceof Error
                            ? error.message
                            : String(error)),
                );
            }
        },
        {
            params: t.Object({ id: t.String() }),
        },
    )

    /**
     * Apply stamp to letter
     * PUT /stamps/apply/:applicationId
     * Body: { stampId: string }
     */
    .put(
        "/apply/:applicationId",
        async ({ user, params, body }) => {
            if (!user) {
                throw new Error("Unauthorized");
            }

            try {
                // Verify stamp belongs to user
                const stamp = await Prisma.userStamp.findUnique({
                    where: { id: body.stampId },
                });

                if (!stamp || stamp.userId !== user.id) {
                    throw new Error("Stamp not found or unauthorized");
                }

                // Verify letter instance exists and belongs to UPA workflow
                const letter = await Prisma.letterInstance.findUnique({
                    where: { id: params.applicationId },
                });

                if (!letter) {
                    throw new Error("Letter not found");
                }

                // Update letter with stamp
                const updated = await Prisma.letterInstance.update({
                    where: { id: params.applicationId },
                    data: {
                        stampId: body.stampId,
                        stampAppliedAt: new Date(),
                    },
                });

                // 🔴 Trigger Auto-Generation to ensure PDF has the new stamp
                try {
                    console.log(
                        `📄 [Stamp] Triggering auto-generate for ${params.applicationId}`,
                    );
                    // Dynamic import to avoid potential circular dependency issues if any,
                    // or just import at top level if clean.
                    // Using top-level import is better if structure allows, but let's see.
                    // For now, I'll assume we can import it.
                    await ApplicationController.autoGenerateTemplate(
                        params.applicationId,
                        params.applicationId,
                    );
                } catch (genError) {
                    console.error(
                        "❌ [Stamp] Failed to regenerate document:",
                        genError,
                    );
                    // Don't fail the request, just log error
                }

                return {
                    success: true,
                    data: updated,
                };
            } catch (error) {
                console.error("Apply stamp error:", error);
                throw new Error(
                    "Failed to apply stamp: " +
                        (error instanceof Error
                            ? error.message
                            : String(error)),
                );
            }
        },
        {
            params: t.Object({ applicationId: t.String() }),
            body: t.Object({ stampId: t.String() }),
        },
    );

export default stampRoutes;
