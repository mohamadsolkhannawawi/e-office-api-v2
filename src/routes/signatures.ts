import { Elysia, t } from "elysia";
import { Prisma } from "@backend/db/index.ts";
import { auth } from "@backend/lib/auth.ts";
import crypto from "crypto";
import { MinioService } from "@backend/shared/services/minio.service.ts";

/**
 * Route Signature User
 * Operasi CRUD untuk template signature yang tersimpan per user (WD1)
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
  .onBeforeHandle(async () => {
    // Pastikan bucket MinIO tersedia
    await MinioService.ensureBucket();
  })

  /**
   * Ambil semua signature untuk user saat ini
   */
  .get("/", async ({ user }) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    const signatures = await Prisma.userSignature.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    // Buat presigned URL baru untuk setiap signature
    const signaturesWithFreshUrls = await Promise.all(
      signatures.map(async (sig) => ({
        ...sig,
        url: await MinioService.refreshPresignedUrl(sig.url),
      })),
    );

    return { data: signaturesWithFreshUrls };
  })

  /**
   * Buat template signature baru
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
          const fileName = `signature_${user.id}_${Date.now()}.${extension}`;
          const file = new File([buffer], fileName, {
            type: `image/${extension}`,
          });

          // Upload ke MinIO menggunakan method statis
          const uploadResult = await MinioService.uploadFile(
            file,
            "signature/",
            `image/${extension}`,
          );
          // Simpan path objek (bukan presigned URL) agar bisa di-refresh nanti
          finalUrl = "signature/" + uploadResult.nameReplace;
        } catch (uploadError) {
          console.error("Failed to upload signature to MinIO:", uploadError);
          throw new Error(
            "Failed to upload signature: " +
              (uploadError instanceof Error
                ? uploadError.message
                : "Unknown error"),
          );
        }
      }

      // Generate checksum untuk data signature
      const checksum = crypto
        .createHash("sha256")
        .update(`${finalUrl}|${new Date().toISOString()}`)
        .digest("hex");

      const signature = await Prisma.userSignature.create({
        data: {
          userId: user.id,
          url: finalUrl,
          signatureType: body.signatureType || "UPLOADED",
          isDefault: body.isDefault || false,
          checksum,
        },
      });

      // Jika ini diset sebagai default, nonaktifkan default lainnya
      if (body.isDefault) {
        await Prisma.userSignature.updateMany({
          where: {
            userId: user.id,
            id: { not: signature.id },
          },
          data: { isDefault: false },
        });
      }

      // Kembalikan dengan presigned URL baru agar klien bisa langsung menampilkan
      // gambar tanpa perlu fetch ulang
      const freshUrl = await MinioService.refreshPresignedUrl(finalUrl);
      return { data: { ...signature, url: freshUrl } };
    },
    {
      body: t.Object({
        url: t.String(), // Data URL base64 atau path file
        signatureType: t.Optional(
          t.String({ enum: ["UPLOADED", "DRAWN", "TEMPLATE"] }),
        ),
        isDefault: t.Optional(t.Boolean()),
      }),
    },
  )

  /**
   * Perbarui nama signature
   */
  .patch(
    "/:id",
    async ({ user, params, body }) => {
      if (!user) {
        throw new Error("Unauthorized");
      }

      const signature = await Prisma.userSignature.findFirst({
        where: { id: params.id, userId: user.id },
      });

      if (!signature) {
        throw new Error("Signature not found");
      }

      const updated = await Prisma.userSignature.update({
        where: { id: params.id },
        data: { name: body.name },
      });

      return { data: updated };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )

  /**
   * Set signature sebagai default
   */
  .patch(
    "/:id/default",
    async ({ user, params }) => {
      if (!user) {
        throw new Error("Unauthorized");
      }

      // Verifikasi kepemilikan
      const signature = await Prisma.userSignature.findFirst({
        where: { id: params.id, userId: user.id },
      });

      if (!signature) {
        throw new Error("Signature not found");
      }

      // Nonaktifkan semua default lainnya
      await Prisma.userSignature.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      });

      // Set signature ini sebagai default
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
   * Hapus template signature
   */
  .delete(
    "/:id",
    async ({ user, params }) => {
      if (!user) {
        throw new Error("Unauthorized");
      }

      // Verifikasi kepemilikan
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
   * Ambil signature default untuk user saat ini
   */
  .get("/default", async ({ user }) => {
    if (!user) {
      throw new Error("Unauthorized");
    }

    const defaultSignature = await Prisma.userSignature.findFirst({
      where: { userId: user.id, isDefault: true },
    });

    if (defaultSignature) {
      return {
        data: {
          ...defaultSignature,
          url: await MinioService.refreshPresignedUrl(defaultSignature.url),
        },
      };
    }

    return { data: defaultSignature };
  });

export default signatureRoutes;
