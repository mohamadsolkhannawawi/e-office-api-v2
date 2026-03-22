import { Elysia, t } from "elysia";
import { Prisma } from "@backend/db/index.ts";

/**
 * [ROUTE] Letter Config Routes
 * Mengelola konfigurasi dinamis untuk template surat (pejabat, kop surat, dll)
 */
const letterConfigRoutes = new Elysia({
  prefix: "/letter-config",
  tags: ["master", "letter-config"],
})
  /**
   * Ambil semua konfigurasi surat yang aktif
   */
  .get("/", async () => {
    const configs = await Prisma.letterConfig.findMany({
      where: { isActive: true },
      orderBy: { key: "asc" },
    });
    return configs;
  })

  /**
   * Ambil konfigurasi surat berdasarkan key
   */
  .get(
    "/:key",
    async ({ params }) => {
      const config = await Prisma.letterConfig.findUnique({
        where: { key: params.key },
      });

      if (!config) {
        throw new Error(
          `Konfigurasi dengan key '${params.key}' tidak ditemukan`,
        );
      }

      return config;
    },
    {
      params: t.Object({
        key: t.String(),
      }),
    },
  )

  /**
   * Update konfigurasi surat (membuat versi baru)
   */
  .put(
    "/:key",
    async ({ params, body }) => {
      const existing = await Prisma.letterConfig.findUnique({
        where: { key: params.key },
      });

      if (!existing) {
        // Buat konfigurasi baru
        const newConfig = await Prisma.letterConfig.create({
          data: {
            key: params.key,
            value: body.value,
            version: 1,
            isActive: true,
          },
        });
        return newConfig;
      }

      // Update konfigurasi existing dan naikkan versi
      const updated = await Prisma.letterConfig.update({
        where: { key: params.key },
        data: {
          value: body.value,
          version: existing.version + 1,
        },
      });

      return updated;
    },
    {
      params: t.Object({
        key: t.String(),
      }),
      body: t.Object({
        value: t.Any(), // Objek JSON
      }),
    },
  )

  /**
   * Ambil riwayat konfigurasi (semua versi)
   * Catatan: Implementasi saat ini hanya menyimpan versi terbaru.
   * Untuk riwayat penuh, diperlukan tabel LetterConfigHistory terpisah.
   */
  .get(
    "/:key/history",
    async ({ params }) => {
      const config = await Prisma.letterConfig.findUnique({
        where: { key: params.key },
      });

      if (!config) {
        throw new Error(
          `Konfigurasi dengan key '${params.key}' tidak ditemukan`,
        );
      }

      // Return konfigurasi saat ini beserta informasi versi
      return {
        currentVersion: config.version,
        config: config,
        note: "Untuk riwayat lengkap, diperlukan tabel LetterConfigHistory terpisah.",
      };
    },
    {
      params: t.Object({
        key: t.String(),
      }),
    },
  );

export default letterConfigRoutes;
