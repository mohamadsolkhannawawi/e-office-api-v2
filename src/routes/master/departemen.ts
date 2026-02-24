import {
    authGuardPlugin,
    requirePermission,
} from "@backend/middlewares/auth.ts";
import { Prisma } from "@backend/db/index.ts";
import { Elysia, t } from "elysia";

export default new Elysia()
    .use(authGuardPlugin)
    // Get all departments with program studi count
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
            // Allow all authenticated users to list departments (for form selections)
        },
    )
    // Get single department
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
                throw new Error("Department not found");
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
    // Create department
    .post(
        "/",
        async ({ body: { name, code } }) => {
            // Check if code already exists
            const existing = await Prisma.departemen.findUnique({
                where: { code },
            });

            if (existing) {
                throw new Error("Department code already exists");
            }

            const department = await Prisma.departemen.create({
                data: {
                    name,
                    code,
                },
            });

            return {
                message: "Department created successfully",
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
    // Update department
    .patch(
        "/:id",
        async ({ params: { id }, body: { name, code } }) => {
            // Check if code exists for other department
            if (code) {
                const existing = await Prisma.departemen.findFirst({
                    where: {
                        code,
                        NOT: { id },
                    },
                });

                if (existing) {
                    throw new Error("Department code already exists");
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
                message: "Department updated successfully",
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
    // Delete department
    .delete(
        "/:id",
        async ({ params: { id } }) => {
            // Check if department has program studi
            const prodiCount = await Prisma.programStudi.count({
                where: { departemenId: id },
            });

            if (prodiCount > 0) {
                throw new Error(
                    `Cannot delete department with ${prodiCount} program studi. Delete or reassign them first.`,
                );
            }

            // Check if department has users
            const mahasiswaCount = await Prisma.mahasiswa.count({
                where: { departemenId: id },
            });
            const pegawaiCount = await Prisma.pegawai.count({
                where: { departemenId: id },
            });

            if (mahasiswaCount > 0 || pegawaiCount > 0) {
                throw new Error(
                    `Cannot delete department with ${mahasiswaCount + pegawaiCount} users. Reassign them first.`,
                );
            }

            await Prisma.departemen.delete({
                where: { id },
            });

            return {
                message: "Department deleted successfully",
            };
        },
        {
            ...requirePermission("department", "manage"),
            params: t.Object({
                id: t.String(),
            }),
        },
    );
