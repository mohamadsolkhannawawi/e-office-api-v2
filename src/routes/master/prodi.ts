import {
  authGuardPlugin,
  requirePermission,
} from "@backend/middlewares/auth.ts";
import { Prisma } from "@backend/db/index.ts";
import { Elysia, t } from "elysia";

/**
 * [ROUTE] Program Studi Master Routes
 *
 * Provides CRUD endpoints for program studi, including department filtering
 * and dependency checks before deletion.
 */
export default new Elysia()
  .use(authGuardPlugin)
  // Get all program studi
  .get(
    "/all",
    async ({ query }) => {
      const { departemenId } = query;

      const where: any = {};
      if (departemenId) {
        where.departemenId = departemenId;
      }

      const prodi = await Prisma.programStudi.findMany({
        where,
        include: {
          departemen: true,
          _count: {
            select: {
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
        prodi: prodi.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          departemen: p.departemen,
          departemenId: p.departemenId,
          mahasiswaCount: p._count.mahasiswa,
          pegawaiCount: p._count.pegawai,
        })),
      };
    },
    {
      // Allow all authenticated users to list program studi (for form selections)
      query: t.Object({
        departemenId: t.Optional(t.String()),
      }),
    },
  )
  // Get single program studi
  .get(
    "/:id",
    async ({ params: { id } }) => {
      const prodi = await Prisma.programStudi.findUnique({
        where: { id },
        include: {
          departemen: true,
          _count: {
            select: {
              mahasiswa: true,
              pegawai: true,
            },
          },
        },
      });

      if (!prodi) {
        throw new Error("Program Studi not found");
      }

      return { prodi };
    },
    {
      ...requirePermission("prodi", "manage"),
      params: t.Object({
        id: t.String(),
      }),
    },
  )
  // Create program studi
  .post(
    "/",
    async ({ body: { name, code, departemenId } }) => {
      // Check if code already exists
      const existing = await Prisma.programStudi.findUnique({
        where: { code },
      });

      if (existing) {
        throw new Error("Program Studi code already exists");
      }

      // Check if department exists
      const department = await Prisma.departemen.findUnique({
        where: { id: departemenId },
      });

      if (!department) {
        throw new Error("Department not found");
      }

      const prodi = await Prisma.programStudi.create({
        data: {
          name,
          code,
          departemenId,
        },
        include: {
          departemen: true,
        },
      });

      return {
        message: "Program Studi created successfully",
        prodi,
      };
    },
    {
      ...requirePermission("prodi", "manage"),
      body: t.Object({
        name: t.String(),
        code: t.String(),
        departemenId: t.String(),
      }),
    },
  )
  // Update program studi
  .patch(
    "/:id",
    async ({ params: { id }, body: { name, code, departemenId } }) => {
      // Check if code exists for other prodi
      if (code) {
        const existing = await Prisma.programStudi.findFirst({
          where: {
            code,
            NOT: { id },
          },
        });

        if (existing) {
          throw new Error("Program Studi code already exists");
        }
      }

      // Check if department exists
      if (departemenId) {
        const department = await Prisma.departemen.findUnique({
          where: { id: departemenId },
        });

        if (!department) {
          throw new Error("Department not found");
        }
      }

      const prodi = await Prisma.programStudi.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(code && { code }),
          ...(departemenId && { departemenId }),
        },
        include: {
          departemen: true,
        },
      });

      return {
        message: "Program Studi updated successfully",
        prodi,
      };
    },
    {
      ...requirePermission("prodi", "manage"),
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        name: t.Optional(t.String()),
        code: t.Optional(t.String()),
        departemenId: t.Optional(t.String()),
      }),
    },
  )
  // Delete program studi
  .delete(
    "/:id",
    async ({ params: { id } }) => {
      // Check if prodi has users
      const mahasiswaCount = await Prisma.mahasiswa.count({
        where: { programStudiId: id },
      });
      const pegawaiCount = await Prisma.pegawai.count({
        where: { programStudiId: id },
      });

      if (mahasiswaCount > 0 || pegawaiCount > 0) {
        throw new Error(
          `Cannot delete program studi with ${mahasiswaCount + pegawaiCount} users. Reassign them first.`,
        );
      }

      await Prisma.programStudi.delete({
        where: { id },
      });

      return {
        message: "Program Studi deleted successfully",
      };
    },
    {
      ...requirePermission("prodi", "manage"),
      params: t.Object({
        id: t.String(),
      }),
    },
  );
