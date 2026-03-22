import { Elysia, t } from "elysia";
import {
  generateLetterNumber,
  previewNextLetterNumber,
  getLetterNumberStats,
} from "@backend/services/letterNumber.service.ts";
import { auth } from "@backend/lib/auth.ts";
import { config } from "@backend/config.ts";

/**
 * [ROUTE] Letter Number Routes
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
    async ({ user, body, set }) => {
      if (!user) {
        set.status = 401;
        return {
          success: false,
          error: "Tidak terautentikasi",
          message: "User harus terautentikasi untuk generate nomor surat",
        };
      }

      // Generate nomor surat baru berdasarkan tipe surat
      const type = body?.type || "SRB";
      const number = await generateLetterNumber(type);

      // Jika ada applicationId, buat data verifikasi (kode + URL + QR)
      let verificationData = null;
      if (body.applicationId) {
        const {
          generateVerificationCode,
          createVerificationRecord,
          getQRCodeImageUrl,
          getQRCodeUrl,
        } = await import("@backend/services/verification.service.ts");

        const code = generateVerificationCode(body.applicationId, number);

        // Simpan relasi kode verifikasi ke aplikasi dan nomor surat
        await createVerificationRecord({
          applicationId: body.applicationId,
          letterNumber: number,
          code: code,
        });

        // Bentuk URL verifikasi dan QR image berdasarkan FRONTEND_URL
        const appUrl = config.FRONTEND_URL;
        verificationData = {
          code,
          verifyUrl: getQRCodeUrl(code, appUrl),
          qrImage: getQRCodeImageUrl(code, appUrl),
        };
      }

      return {
        success: true,
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
