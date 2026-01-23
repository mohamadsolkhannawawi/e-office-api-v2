import { Elysia, t } from "elysia";
import {
    generateLetterNumber,
    previewNextLetterNumber,
    getLetterNumberStats,
} from "@backend/services/letterNumber.service.ts";
import { auth } from "@backend/lib/auth.ts";

/**
 * Letter Number Routes
 * API untuk generate dan preview nomor surat otomatis
 */
const letterNumberRoutes = new Elysia({
    prefix: "/letter-number",
    tags: ["master", "letter-number"],
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
     * Preview nomor surat berikutnya (tanpa increment)
     */
    .get(
        "/preview",
        async ({ query }) => {
            const type = query?.type || "SRB";
            const number = await previewNextLetterNumber(type);
            return { data: { nextNumber: number } };
        },
        {
            query: t.Object({
                type: t.Optional(t.String()),
            }),
        },
    )

    /**
     * Generate nomor surat baru (dengan increment)
     * Hanya dipanggil saat UPA menerbitkan surat
     */
    .post(
        "/generate",
        async ({ user, body }) => {
            if (!user) {
                throw new Error("Unauthorized");
            }

            const type = body?.type || "SRB";
            const number = await generateLetterNumber(type);

            let verificationData = null;
            if (body.applicationId) {
                const {
                    generateVerificationCode,
                    createVerificationRecord,
                    getQRCodeImageUrl,
                    getQRCodeUrl,
                } = await import("@backend/services/verification.service.ts");

                const code = generateVerificationCode(
                    body.applicationId,
                    number,
                );
                await createVerificationRecord({
                    applicationId: body.applicationId,
                    letterNumber: number,
                    code: code,
                });

                const appUrl =
                    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
                verificationData = {
                    code,
                    verifyUrl: getQRCodeUrl(code, appUrl),
                    qrImage: getQRCodeImageUrl(code, appUrl),
                };
            }

            return {
                data: {
                    letterNumber: number,
                    verification: verificationData,
                },
            };
        },
        {
            body: t.Object({
                type: t.Optional(t.String()),
                applicationId: t.Optional(t.String()),
            }),
        },
    )

    /**
     * Get statistik penomoran
     */
    .get(
        "/stats",
        async ({ query }) => {
            const year = query?.year ? parseInt(query.year) : undefined;
            const stats = await getLetterNumberStats(year);
            return { data: stats };
        },
        {
            query: t.Object({
                year: t.Optional(t.String()),
            }),
        },
    );

export default letterNumberRoutes;
