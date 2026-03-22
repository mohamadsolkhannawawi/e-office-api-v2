import { Elysia, t } from "elysia";
import { verifyLetter } from "@backend/services/verification.service.ts";

/**
 * [ROUTE] Public Verification Routes
 * Public API for QR-code letter verification (no login required).
 * Returns comprehensive authenticity details for issued letters.
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
          message: "Document not found or verification code is invalid.",
        };
      }

      return {
        valid: true,
        data: {
          // Basic letter information
          letterNumber: result.letterNumber,
          issuedAt: result.issuedAt,
          publishedAt: result.publishedAt,
          verifiedCount: result.verifiedCount,

          // Letter type information
          letterType: {
            id: result.letterType.id,
            name: result.letterType.name,
            description: result.letterType.description,
          },
          jenisBeasiswa: result.jenisBeasiswa,

          // Applicant information (verification context)
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

          // Full verification trail history
          history: result.history,

          // Authenticity statement
          authenticity: {
            issuer: "Faculty of Science and Mathematics",
            institution: "Diponegoro University",
            verificationStatement: `This document is an official letter issued by the Faculty of Science and Mathematics, Diponegoro University, with letter number ${result.letterNumber}.`,
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
