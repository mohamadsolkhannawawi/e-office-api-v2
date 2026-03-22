import {
  authGuardPlugin,
  requirePermission,
} from "@backend/middlewares/auth.ts";
import { Prisma } from "@backend/db/index.ts";
import { Elysia, t } from "elysia";

/**
 * [ROUTE] Master Departemen
 *
 * Menyediakan endpoint untuk manajemen data departemen:
 * - List departemen
 * - Detail departemen
 * - Create, update, delete departemen
 */
export default new Elysia()
  .use(authGuardPlugin)
  // Ambil semua departemen beserta jumlah program studi
  .get(
    "/all",
    async () => {
      const departments = await Prisma.departemen.findMany({
        include: {
          programStudi: true,
          _count: {
            select: {
              programStudi: true,
              mahasiswa: true,
              pegawai: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      return {
        departments: departments.map((dept) => ({
          id: dept.id,
          name: dept.name,
          code: dept.code,
          prodiCount: dept._count.programStudi,
          mahasiswaCount: dept._count.mahasiswa,
          pegawaiCount: dept._count.pegawai,
          programStudi: dept.programStudi,
        })),
      };
    },
    {
      // Izinkan semua user terautentikasi melihat daftar departemen (untuk kebutuhan form)
    },
  )
  // Ambil detail satu departemen
  .get(
    "/:id",
    async ({ params: { id } }) => {
      const department = await Prisma.departemen.findUnique({
        where: { id },
        include: {
          programStudi: true,
          _count: {
            select: {
              programStudi: true,
              mahasiswa: true,
              pegawai: true,
            },
          },
        },
      });

      if (!department) {
        throw new Error("Departemen tidak ditemukan");
      }

      return { department };
    },
    {
      ...requirePermission("department", "manage"),
      params: t.Object({
        id: t.String(),
      }),
    },
  )
  // Buat departemen baru
  .post(
    "/",
    async ({ body: { name, code } }) => {
      // Cek apakah kode sudah dipakai
      const existing = await Prisma.departemen.findUnique({
        where: { code },
      });

      if (existing) {
        throw new Error("Kode departemen sudah digunakan");
      }

      const department = await Prisma.departemen.create({
        data: {
          name,
          code,
        },
      });

      return {
        message: "Departemen berhasil dibuat",
        department,
      };
    },
    {
      ...requirePermission("department", "manage"),
      body: t.Object({
        name: t.String(),
        code: t.String(),
      }),
    },
  )
  // Update data departemen
  .patch(
    "/:id",
    async ({ params: { id }, body: { name, code } }) => {
      // Cek apakah kode sudah dipakai departemen lain
      if (code) {
        const existing = await Prisma.departemen.findFirst({
          where: {
            code,
            NOT: { id },
          },
        });

        if (existing) {
          throw new Error("Kode departemen sudah digunakan");
        }
      }

      const department = await Prisma.departemen.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(code && { code }),
        },
      });

      return {
        message: "Departemen berhasil diperbarui",
        department,
      };
    },
    {
      ...requirePermission("department", "manage"),
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        name: t.Optional(t.String()),
        code: t.Optional(t.String()),
      }),
    },
  )
  // Hapus departemen
  .delete(
    "/:id",
    async ({ params: { id } }) => {
      // Cek apakah departemen masih memiliki program studi
      const prodiCount = await Prisma.programStudi.count({
        where: { departemenId: id },
      });

      if (prodiCount > 0) {
        throw new Error(
          `Tidak dapat menghapus departemen dengan ${prodiCount} program studi. Hapus atau pindahkan terlebih dahulu.`,
        );
      }

      // Cek apakah departemen masih memiliki user
      const mahasiswaCount = await Prisma.mahasiswa.count({
        where: { departemenId: id },
      });
      const pegawaiCount = await Prisma.pegawai.count({
        where: { departemenId: id },
      });

      if (mahasiswaCount > 0 || pegawaiCount > 0) {
        throw new Error(
          `Tidak dapat menghapus departemen dengan ${mahasiswaCount + pegawaiCount} user. Pindahkan terlebih dahulu.`,
        );
      }

      await Prisma.departemen.delete({
        where: { id },
      });

      return {
        message: "Departemen berhasil dihapus",
      };
    },
    {
      ...requirePermission("department", "manage"),
      params: t.Object({
        id: t.String(),
      }),
    },
  );
