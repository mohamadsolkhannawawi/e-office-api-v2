import { Elysia, t } from "elysia";
import {
  getPublishedLetterNumbers,
  getLastPublishedNumber,
  generateNextLetterNumber,
  validateLetterNumberFormat,
  isLetterNumberInUse,
  getNumberingSummary,
} from "@backend/services/letterNumbering.service.ts";
import {
  generateVerificationCode,
  createVerificationRecord,
  getQRCodeImageUrl,
  getQRCodeUrl,
} from "@backend/services/verification.service.ts";
import { Prisma } from "@backend/db/index.ts";
import { auth } from "@backend/lib/auth.ts";
import { config } from "@backend/config.ts";
import { ApplicationController } from "@backend/modules/surat-rekomendasi-beasiswa/controllers/application.controller.ts";

/**
 * [ROUTE] Letter Numbering Management Routes
 * API for managing letter numbering (history, validation, edit)
 */
const letterNumberingRoutes = new Elysia({
  prefix: "/letter-numbering",
  tags: ["master", "letter-numbering"],
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
   * Get all published letter numbers
   */
  .get(
    "/published",
    async ({ query }) => {
      const year = query?.year
        ? parseInt(query.year as string)
        : new Date().getFullYear();
      const type = (query?.type as string) || "SRB";

      const published = await getPublishedLetterNumbers(year, type);
      const summary = await getNumberingSummary(year);

      return {
        success: true,
        data: {
          year,
          type,
          summary: {
            total: summary.totalPublished,
            lastPublished: summary.lastPublished,
            monthCounts: summary.monthCounts,
          },
          items: published,
        },
      };
    },
    {
      query: t.Object({
        year: t.Optional(t.String()),
        type: t.Optional(t.String()),
      }),
    },
  )

  /**
   * Get next letter number suggestion
   */
  .get(
    "/next-suggestion",
    async ({ query }) => {
      const year = query?.year
        ? parseInt(query.year as string)
        : new Date().getFullYear();
      const month = query?.month
        ? parseInt(query.month as string)
        : new Date().getMonth() + 1;

      const next = await generateNextLetterNumber(year, month);
      const last = await getLastPublishedNumber(year, month);

      return {
        success: true,
        data: {
          lastPublished: last?.number || null,
          lastSequence: last?.sequence || 0,
          suggestedNumber: next.number,
          suggestedSequence: next.sequence,
        },
      };
    },
    {
      query: t.Object({
        year: t.Optional(t.String()),
        month: t.Optional(t.String()),
      }),
    },
  )

  /**
   * Validate and check letter number availability
   */
  .post(
    "/validate",
    async ({ body, set }) => {
      const letterNumber = body.letterNumber?.trim();

      if (!letterNumber) {
        set.status = 400;
        return {
          success: false,
          error: "letterNumber is required",
        };
      }

      // Check format
      const isValidFormat = validateLetterNumberFormat(letterNumber);
      if (!isValidFormat) {
        return {
          success: true,
          data: {
            letterNumber,
            isValidFormat: false,
            isAvailable: false,
            message:
              "Invalid letter number format. Use: xxx/UN7.F8.1/KM/X/YYYY",
          },
        };
      }

      // Check availability
      const inUse = await isLetterNumberInUse(letterNumber);

      return {
        success: true,
        data: {
          letterNumber,
          isValidFormat: true,
          isAvailable: !inUse,
          inUse,
          message: inUse
            ? "Letter number is already in use"
            : "Letter number is available",
        },
      };
    },
    {
      body: t.Object({
        letterNumber: t.String(),
      }),
    },
  )

  /**
   * Get numbering summary by year
   */
  .get(
    "/summary/:year",
    async ({ params }) => {
      const year = parseInt(params.year);

      if (isNaN(year)) {
        return {
          success: false,
          error: "Invalid year",
        };
      }

      const summary = await getNumberingSummary(year);

      return {
        success: true,
        data: summary,
      };
    },
    {
      params: t.Object({
        year: t.String(),
      }),
    },
  )

  /**
   * Manual letter number update for an application
   * (Only UPA role can do this)
   */
  .put(
    "/:applicationId",
    async ({ params, body, user, set }) => {
      // Check authorization
      if (!user) {
        set.status = 401;
        return {
          success: false,
          error: "Unauthorized",
        };
      }

      // Check whether user has UPA or SUPER_ADMIN role
      const userRoles = await Prisma.userRole.findMany({
        where: { userId: user.id },
        include: { role: true },
      });
      const userRoleNames = userRoles.map((ur: { role: { name: string } }) =>
        ur.role.name.toUpperCase(),
      );
      const isAuthorized =
        userRoleNames.includes("UPA") || userRoleNames.includes("SUPER_ADMIN");

      if (!isAuthorized) {
        set.status = 403;
        return {
          success: false,
          error: "Forbidden: Only UPA or Super Admin can edit letter numbers",
        };
      }

      const newLetterNumber = body.letterNumber?.trim();

      if (!newLetterNumber) {
        set.status = 400;
        return {
          success: false,
          error: "letterNumber is required",
        };
      }

      // Validate format
      if (!validateLetterNumberFormat(newLetterNumber)) {
        set.status = 400;
        return {
          success: false,
          error: "Invalid letter number format",
          format: "xxx/UN7.F8.1/KM/X/YYYY (example: 001/UN7.F8.1/KM/I/2026)",
        };
      }

      // Check if new number is already in use (excluding current app)
      const inUse = await Prisma.letterInstance.findFirst({
        where: {
          letterNumber: newLetterNumber,
          id: {
            not: params.applicationId,
          },
        },
      });

      if (inUse) {
        set.status = 409;
        return {
          success: false,
          error: "Letter number is already used by another application",
        };
      }

      // Update application data
      const updated = await Prisma.letterInstance.update({
        where: {
          id: params.applicationId,
        },
        data: {
          letterNumber: newLetterNumber,
        },
        select: {
          id: true,
          letterNumber: true,
          scholarshipName: true,
          status: true,
          verification: true,
        },
      });

      // Create or update verification record
      const appUrl = config.FRONTEND_URL;
      let verificationData = null;

      if (!updated.verification) {
        // Create new verification record
        const code = generateVerificationCode(
          params.applicationId,
          newLetterNumber,
        );
        await createVerificationRecord({
          applicationId: params.applicationId,
          letterNumber: newLetterNumber,
          code: code,
        });
        verificationData = {
          code,
          verifyUrl: getQRCodeUrl(code, appUrl),
          qrImage: getQRCodeImageUrl(code, appUrl),
        };
      } else {
        // Update letterNumber on existing verification record
        await Prisma.letterVerification.update({
          where: { applicationId: params.applicationId },
          data: { letterNumber: newLetterNumber },
        });
        verificationData = {
          code: updated.verification.code,
          verifyUrl: getQRCodeUrl(updated.verification.code, appUrl),
          qrImage: getQRCodeImageUrl(updated.verification.code, appUrl),
        };
      }

      // Trigger document regeneration with the new letter number
      ApplicationController.autoGenerateTemplate(
        params.applicationId,
        params.applicationId,
      ).catch((err) => {
        console.warn(
          "[WARNING] [letterNumbering] Failed to regenerate document after numbering update:",
          err,
        );
      });

      return {
        success: true,
        data: {
          applicationId: updated.id,
          letterNumber: updated.letterNumber,
          namaAplikasi:
            updated.scholarshipName || "Scholarship Recommendation Letter",
          status: updated.status,
          verification: verificationData,
          message: "Letter number updated successfully",
        },
      };
    },
    {
      params: t.Object({
        applicationId: t.String(),
      }),
      body: t.Object({
        letterNumber: t.String(),
      }),
    },
  );

export default letterNumberingRoutes;
