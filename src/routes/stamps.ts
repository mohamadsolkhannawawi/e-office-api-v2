import { Elysia, t } from "elysia";
import { Prisma } from "@backend/db/index.ts";
import { auth } from "@backend/lib/auth.ts";
import { MinioService } from "@backend/shared/services/minio.service.ts";
import { ApplicationController } from "@backend/modules/surat-rekomendasi-beasiswa/controllers/application.controller.ts";

/**
 * Route Stamp User (UPA)
 * Operasi CRUD untuk template stamp yang tersimpan per user (UPA)
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
    // Pastikan bucket MinIO tersedia
    await MinioService.ensureBucket();
  })

  /**
   * Ambil semua stamp untuk user saat ini
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

    // Buat presigned URL baru untuk setiap stamp
    const stampsWithFreshUrls = await Promise.all(
      stamps.map(async (stamp) => ({
        ...stamp,
        url: await MinioService.refreshPresignedUrl(stamp.url),
      })),
    );

    return {
      success: true,
      data: stampsWithFreshUrls,
    };
  })

  /**
   * Buat template stamp baru
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

      // Jika URL berupa data URL base64, konversi dan upload ke MinIO
      if (body.url.startsWith("data:image")) {
        try {
          // Parse data base64
          const matches = body.url.match(/^data:image\/(\w+);base64,(.+)$/);
          if (!matches || !matches[2]) {
            throw new Error("Invalid base64 image format");
          }

          const [, extension, base64Data] = matches;
          const buffer = Buffer.from(base64Data, "base64");

          // Buat objek mirip File untuk MinIO
          const fileName = `stamp_${user.id}_${Date.now()}.${extension}`;
          const file = new File([buffer], fileName, {
            type: `image/${extension}`,
          });

          // Upload ke MinIO menggunakan method statis
          const uploadResult = await MinioService.uploadFile(
            file,
            "stamp/",
            `image/${extension}`,
          );
          // Simpan path objek (bukan presigned URL) agar bisa di-refresh nanti
          finalUrl = "stamp/" + uploadResult.nameReplace;
        } catch (error) {
          console.error("MinIO upload error:", error);
          throw new Error(
            "Failed to upload stamp to storage: " +
              (error instanceof Error ? error.message : String(error)),
          );
        }
      }

      try {
        const stamp = await Prisma.userStamp.create({
          data: {
            userId: user.id,
            url: finalUrl,
            stampType: body.stampType || "UPLOADED",
            isDefault: false, // User harus menetapkan default secara eksplisit
          },
        });

        // Kembalikan dengan presigned URL baru agar klien bisa langsung menampilkan
        // gambar tanpa perlu fetch ulang
        const freshUrl = await MinioService.refreshPresignedUrl(finalUrl);
        return {
          success: true,
          data: { ...stamp, url: freshUrl },
        };
      } catch (error) {
        console.error("Create stamp error:", error);
        throw new Error(
          "Failed to create stamp: " +
            (error instanceof Error ? error.message : String(error)),
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
   * Perbarui nama stamp
   * PATCH /stamps/:id
   */
  .patch(
    "/:id",
    async ({ user, params, body }) => {
      if (!user) {
        throw new Error("Unauthorized");
      }

      const stamp = await Prisma.userStamp.findUnique({
        where: { id: params.id },
      });

      if (!stamp || stamp.userId !== user.id) {
        throw new Error("Stamp not found or unauthorized");
      }

      const updated = await Prisma.userStamp.update({
        where: { id: params.id },
        data: { name: body.name },
      });

      return { success: true, data: updated };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )

  /**
   * Set stamp sebagai default
   * PATCH /stamps/:id/default
   */
  .patch(
    "/:id/default",
    async ({ user, params }) => {
      if (!user) {
        throw new Error("Unauthorized");
      }

      try {
        // Verifikasi bahwa stamp milik user
        const stamp = await Prisma.userStamp.findUnique({
          where: { id: params.id },
        });

        if (!stamp || stamp.userId !== user.id) {
          throw new Error("Stamp not found or unauthorized");
        }

        // Hapus status default dari semua stamp lainnya
        await Prisma.userStamp.updateMany({
          where: { userId: user.id },
          data: { isDefault: false },
        });

        // Set stamp ini sebagai default
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
            (error instanceof Error ? error.message : String(error)),
        );
      }
    },
    {
      params: t.Object({ id: t.String() }),
    },
  )

  /**
   * Hapus template stamp
   * DELETE /stamps/:id
   */
  .delete(
    "/:id",
    async ({ user, params }) => {
      if (!user) {
        throw new Error("Unauthorized");
      }

      try {
        // Verifikasi bahwa stamp milik user
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
            (error instanceof Error ? error.message : String(error)),
        );
      }
    },
    {
      params: t.Object({ id: t.String() }),
    },
  )

  /**
   * Terapkan stamp ke surat
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
        // Verifikasi bahwa stamp milik user
        const stamp = await Prisma.userStamp.findUnique({
          where: { id: body.stampId },
        });

        if (!stamp || stamp.userId !== user.id) {
          throw new Error("Stamp not found or unauthorized");
        }

        // Verifikasi letter instance ada dan termasuk alur kerja UPA
        const letter = await Prisma.letterInstance.findUnique({
          where: { id: params.applicationId },
        });

        if (!letter) {
          throw new Error("Letter not found");
        }

        // Perbarui surat dengan stamp
        const updated = await Prisma.letterInstance.update({
          where: { id: params.applicationId },
          data: {
            stampId: body.stampId,
            stampAppliedAt: new Date(),
          },
        });

        // Trigger auto-generation untuk memastikan PDF memakai stamp terbaru
        try {
          console.log(
            `📄 [Stamp] Triggering auto-generate for ${params.applicationId}`,
          );
          // Gunakan import yang aman terhadap potensi circular dependency.
          await ApplicationController.autoGenerateTemplate(
            params.applicationId,
            params.applicationId,
          );
        } catch (genError) {
          console.error("❌ [Stamp] Failed to regenerate document:", genError);
          // Jangan gagalkan request, cukup catat error
        }

        return {
          success: true,
          data: updated,
        };
      } catch (error) {
        console.error("Apply stamp error:", error);
        throw new Error(
          "Failed to apply stamp: " +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    },
    {
      params: t.Object({ applicationId: t.String() }),
      body: t.Object({ stampId: t.String() }),
    },
  );

export default stampRoutes;
