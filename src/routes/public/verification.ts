import { Elysia, t } from "elysia";
import { verifyLetter } from "@backend/services/verification.service.ts";

/**
 * Public Verification Routes
 * API untuk verifikasi QR code yang bisa diakses publik (tanpa login)
 * Menampilkan informasi lengkap keaslian surat dari Fakultas Sains dan Matematika
 */
const publicVerificationRoutes = new Elysia({
    tags: ["public", "verification"],
})
    /**
     * Verify letter by code
     * Returns comprehensive verification data including history and applicant info
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
                    // Basic letter info
                    letterNumber: result.letterNumber,
                    issuedAt: result.issuedAt,
                    publishedAt: result.publishedAt,
                    verifiedCount: result.verifiedCount,

                    // Letter type info
                    letterType: {
                        id: result.letterType.id,
                        name: result.letterType.name,
                        description: result.letterType.description,
                    },

                    // Applicant info (for verification context)
                    applicant: {
                        name: result.applicant.name,
                        nim: result.applicant.nim,
                        departemen: result.applicant.departemen,
                        programStudi: result.applicant.programStudi,
                    },

                    // Application summary
                    application: {
                        id: result.application.id,
                        scholarshipName: result.application.scholarshipName,
                        status: result.application.status,
                        createdAt: result.application.createdAt,
                    },

                    // Complete history for verification trail
                    history: result.history,

                    // Authenticity statement
                    authenticity: {
                        issuer: "Fakultas Sains dan Matematika",
                        institution: "Universitas Diponegoro",
                        verificationStatement: `Dokumen ini adalah surat resmi yang diterbitkan oleh Fakultas Sains dan Matematika Universitas Diponegoro dengan nomor ${result.letterNumber}.`,
                        digitalSignatureValid: true,
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
