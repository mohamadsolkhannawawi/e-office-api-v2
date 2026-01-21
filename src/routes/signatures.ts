import { Elysia, t } from "elysia";
import { Prisma } from "@backend/db/index.ts";
import { auth } from "@backend/lib/auth.ts";
import crypto from "crypto";

/**
 * User Signature Routes
 * CRUD operations untuk signature templates yang tersimpan per user (WD1)
 */
const signatureRoutes = new Elysia({
    prefix: "/signatures",
    tags: ["signatures"],
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

    /**
     * Get all signatures for current user
     */
    .get("/", async ({ user }) => {
        if (!user) {
            throw new Error("Unauthorized");
        }

        const signatures = await Prisma.userSignature.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
        });

        return { data: signatures };
    })

    /**
     * Create new signature template
     */
    .post(
        "/",
        async ({ user, body }) => {
            if (!user) {
                throw new Error("Unauthorized");
            }

            // Generate checksum for signature data
            const checksum = crypto
                .createHash("sha256")
                .update(`${body.url}|${new Date().toISOString()}`)
                .digest("hex");

            const signature = await Prisma.userSignature.create({
                data: {
                    userId: user.id,
                    url: body.url,
                    signatureType: body.signatureType || "UPLOADED",
                    isDefault: body.isDefault || false,
                    checksum,
                },
            });

            // If this is set as default, unset other defaults
            if (body.isDefault) {
                await Prisma.userSignature.updateMany({
                    where: {
                        userId: user.id,
                        id: { not: signature.id },
                    },
                    data: { isDefault: false },
                });
            }

            return { data: signature };
        },
        {
            body: t.Object({
                url: t.String(), // Base64 data URL atau path ke file
                signatureType: t.Optional(
                    t.String({ enum: ["UPLOADED", "DRAWN", "TEMPLATE"] }),
                ),
                isDefault: t.Optional(t.Boolean()),
            }),
        },
    )

    /**
     * Set signature as default
     */
    .patch(
        "/:id/default",
        async ({ user, params }) => {
            if (!user) {
                throw new Error("Unauthorized");
            }

            // Verify ownership
            const signature = await Prisma.userSignature.findFirst({
                where: { id: params.id, userId: user.id },
            });

            if (!signature) {
                throw new Error("Signature not found");
            }

            // Unset all other defaults
            await Prisma.userSignature.updateMany({
                where: { userId: user.id },
                data: { isDefault: false },
            });

            // Set this one as default
            const updated = await Prisma.userSignature.update({
                where: { id: params.id },
                data: { isDefault: true },
            });

            return { data: updated };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
        },
    )

    /**
     * Delete signature template
     */
    .delete(
        "/:id",
        async ({ user, params }) => {
            if (!user) {
                throw new Error("Unauthorized");
            }

            // Verify ownership
            const signature = await Prisma.userSignature.findFirst({
                where: { id: params.id, userId: user.id },
            });

            if (!signature) {
                throw new Error("Signature not found");
            }

            await Prisma.userSignature.delete({
                where: { id: params.id },
            });

            return { success: true };
        },
        {
            params: t.Object({
                id: t.String(),
            }),
        },
    )

    /**
     * Get default signature for current user
     */
    .get("/default", async ({ user }) => {
        if (!user) {
            throw new Error("Unauthorized");
        }

        const defaultSignature = await Prisma.userSignature.findFirst({
            where: { userId: user.id, isDefault: true },
        });

        return { data: defaultSignature };
    });

export default signatureRoutes;
