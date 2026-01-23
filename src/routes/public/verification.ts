import { Elysia, t } from "elysia";
import { verifyLetter } from "@backend/services/verification.service.ts";

/**
 * Public Verification Routes
 * API untuk verifikasi QR code yang bisa diakses publik (tanpa login)
 */
const publicVerificationRoutes = new Elysia({
    prefix: "/public/verification",
    tags: ["public", "verification"],
})
    /**
     * Verify letter by code
     */
    .get(
        "/:code",
        async ({ params, set }) => {
            const result = await verifyLetter(params.code);

            if (!result) {
                set.status = 404;
                return {
                    valid: false,
                    message:
                        "Dokumen tidak ditemukan atau kode verifikasi tidak valid.",
                };
            }

            return {
                valid: true,
                data: {
                    letterNumber: result.letterNumber,
                    issuedAt: result.issuedAt,
                    verifiedCount: result.verifiedCount,
                    application: {
                        id: result.application.id,
                        scholarshipName: result.application.scholarshipName,
                        status: result.application.status,
                        applicantId: result.application.createdById, // Simplified
                    },
                },
            };
        },
        {
            params: t.Object({
                code: t.String(),
            }),
        },
    );

export default publicVerificationRoutes;
