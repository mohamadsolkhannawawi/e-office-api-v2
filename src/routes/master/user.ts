import {
    authGuardPlugin,
    requirePermission,
} from "@backend/middlewares/auth.ts";
import { UserService } from "@backend/services/database_models/user.service.ts";
import { Prisma } from "@backend/db/index.ts";
import { hashPassword } from "better-auth/crypto";
import { Elysia, t } from "elysia";

export default new Elysia()
    .use(authGuardPlugin)
    // Get all users with filters and pagination
    .get(
        "/all",
        async ({ query }) => {
            const {
                page = 1,
                limit = 20,
                search = "",
                role = "",
                status = "",
            } = query;

            const skip = (page - 1) * limit;

            // Build where clause
            const where: any = {};

            // Search by name or email
            if (search) {
                where.OR = [
                    { name: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                ];
            }

            // Filter by role
            if (role) {
                where.userRole = {
                    some: {
                        role: {
                            name: role,
                        },
                    },
                };
            }

            // Filter by status (emailVerified)
            if (status === "active") {
                where.emailVerified = true;
            } else if (status === "inactive") {
                where.emailVerified = false;
            }

            // Get total count
            const total = await Prisma.user.count({ where });

            // Get users with relations
            const users = await Prisma.user.findMany({
                where,
                skip,
                take: limit,
                include: {
                    userRole: {
                        include: {
                            role: true,
                        },
                    },
                    mahasiswa: {
                        include: {
                            departemen: true,
                            programStudi: true,
                        },
                    },
                    pegawai: {
                        include: {
                            departemen: true,
                            programStudi: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: "desc",
                },
            });

            return {
                users,
                meta: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            };
        },
        {
            ...requirePermission("user", "read:all"),
            query: t.Object({
                page: t.Optional(t.Number()),
                limit: t.Optional(t.Number()),
                search: t.Optional(t.String()),
                role: t.Optional(t.String()),
                status: t.Optional(t.String()),
            }),
        },
    )
    // Get single user by ID
    .get(
        "/:id",
        async ({ params: { id } }) => {
            const user = await Prisma.user.findUnique({
                where: { id },
                include: {
                    userRole: {
                        include: {
                            role: true,
                        },
                    },
                    mahasiswa: {
                        include: {
                            departemen: true,
                            programStudi: true,
                        },
                    },
                    pegawai: {
                        include: {
                            departemen: true,
                            programStudi: true,
                        },
                    },
                },
            });

            if (!user) {
                throw new Error("User not found");
            }

            return user;
        },
        {
            ...requirePermission("user", "read:all"),
            params: t.Object({
                id: t.String(),
            }),
        },
    )
    // Get user activity/history
    .get(
        "/:id/activity",
        async ({ params: { id } }) => {
            const activities = await Prisma.letterHistory.findMany({
                where: {
                    OR: [
                        { actionBy: id },
                        { letterInstance: { createdBy: id } },
                    ],
                },
                include: {
                    user: true,
                    letterInstance: {
                        include: {
                            letterType: true,
                        },
                    },
                    role: true,
                },
                orderBy: {
                    createdAt: "desc",
                },
                take: 50,
            });

            return { activities };
        },
        {
            ...requirePermission("user", "read:all"),
            params: t.Object({
                id: t.String(),
            }),
        },
    )
    // Create new user
    .post(
        "/",
        async ({ body }) => {
            const {
                name,
                email,
                roles,
                password: initialPassword,
                mahasiswaData,
                pegawaiData,
            } = body;

            // Check if email already exists
            const existingUser = await Prisma.user.findUnique({
                where: { email },
            });

            if (existingUser) {
                throw new Error("Email already registered");
            }

            // Generate password (use provided or generate random)
            const password =
                initialPassword ||
                `temp${Math.random().toString(36).slice(2, 10)}`;
            const hashedPassword = await hashPassword(password);

            // Create user
            const user = await Prisma.user.create({
                data: {
                    name,
                    email,
                    emailVerified: true,
                },
            });

            // Create Better Auth account
            await Prisma.account.create({
                data: {
                    id: `${user.id}_credential`,
                    userId: user.id,
                    providerId: "credential",
                    accountId: email,
                    password: hashedPassword,
                },
            });

            // Assign roles
            const assignedRoles = [];
            for (const roleName of roles) {
                const role = await Prisma.role.findUnique({
                    where: { name: roleName },
                });

                if (role) {
                    await Prisma.userRole.create({
                        data: {
                            userId: user.id,
                            roleId: role.id,
                        },
                    });
                    assignedRoles.push(role.name);
                }
            }

            console.log(
                `>>> CREATE USER: Assigned roles for ${email}:`,
                assignedRoles,
            );

            // Create role-specific data
            if (assignedRoles.includes("MAHASISWA") && mahasiswaData) {
                console.log(
                    `>>> Creating MAHASISWA data for ${email}:`,
                    mahasiswaData,
                );

                // Check for duplicate NIM
                if (mahasiswaData.nim) {
                    const existingMahasiswa = await Prisma.mahasiswa.findUnique(
                        {
                            where: { nim: mahasiswaData.nim },
                        },
                    );
                    if (existingMahasiswa) {
                        throw new Error(
                            `NIM ${mahasiswaData.nim} sudah terdaftar`,
                        );
                    }
                }

                // Convert tanggalLahir from date string to DateTime if provided
                const mahasiswaCreateData: any = { ...mahasiswaData };
                if (mahasiswaCreateData.tanggalLahir) {
                    mahasiswaCreateData.tanggalLahir = new Date(
                        mahasiswaCreateData.tanggalLahir,
                    );
                }

                await Prisma.mahasiswa.create({
                    data: {
                        userId: user.id,
                        ...mahasiswaCreateData,
                    },
                });
                console.log(
                    `>>> MAHASISWA data created successfully for ${email}`,
                );
            }

            if (pegawaiData && !assignedRoles.includes("MAHASISWA")) {
                console.log(
                    `>>> Creating PEGAWAI data for ${email}:`,
                    pegawaiData,
                );

                // Check for duplicate NIP
                if (pegawaiData.nip) {
                    const existingPegawai = await Prisma.pegawai.findUnique({
                        where: { nip: pegawaiData.nip },
                    });
                    if (existingPegawai) {
                        throw new Error(
                            `NIP ${pegawaiData.nip} sudah terdaftar`,
                        );
                    }
                }

                await Prisma.pegawai.create({
                    data: {
                        userId: user.id,
                        ...pegawaiData,
                    },
                });
                console.log(
                    `>>> PEGAWAI data created successfully for ${email}`,
                );
            }

            return {
                message: "User created successfully",
                user,
                temporaryPassword: password,
            };
        },
        {
            ...requirePermission("user", "create"),
            body: t.Object({
                name: t.String(),
                email: t.String({ format: "email" }),
                roles: t.Array(t.String()),
                password: t.Optional(t.String()),
                mahasiswaData: t.Optional(
                    t.Object({
                        nim: t.String(),
                        semester: t.Number(),
                        ipk: t.Number(),
                        ips: t.Number(),
                        tahunMasuk: t.String(),
                        noHp: t.String(),
                        departemenId: t.Optional(t.String()),
                        programStudiId: t.Optional(t.String()),
                        tempatLahir: t.Optional(t.String()),
                        tanggalLahir: t.Optional(t.String()),
                    }),
                ),
                pegawaiData: t.Optional(
                    t.Object({
                        nip: t.String(),
                        jabatan: t.String(),
                        noHp: t.String(),
                        departemenId: t.Optional(t.String()),
                        programStudiId: t.Optional(t.String()),
                    }),
                ),
            }),
        },
    )
    // Update user
    .patch(
        "/:id",
        async ({ params: { id }, body }) => {
            const { name, mahasiswaData, pegawaiData } = body;

            // Update user
            const user = await Prisma.user.update({
                where: { id },
                data: {
                    ...(name && { name }),
                },
            });

            // Update mahasiswa data if exists
            if (mahasiswaData) {
                const existingMahasiswa = await Prisma.mahasiswa.findUnique({
                    where: { userId: id },
                });

                if (existingMahasiswa) {
                    // Check for duplicate NIM if NIM is being changed
                    if (
                        mahasiswaData.nim &&
                        mahasiswaData.nim !== existingMahasiswa.nim
                    ) {
                        const duplicateNim = await Prisma.mahasiswa.findUnique({
                            where: { nim: mahasiswaData.nim },
                        });
                        if (duplicateNim) {
                            throw new Error(
                                `NIM ${mahasiswaData.nim} sudah terdaftar`,
                            );
                        }
                    }

                    // Convert tanggalLahir from date string to DateTime if provided
                    const mahasiswaUpdateData: any = { ...mahasiswaData };
                    if (mahasiswaUpdateData.tanggalLahir) {
                        mahasiswaUpdateData.tanggalLahir = new Date(
                            mahasiswaUpdateData.tanggalLahir,
                        );
                    }

                    await Prisma.mahasiswa.update({
                        where: { userId: id },
                        data: mahasiswaUpdateData,
                    });
                }
            }

            // Update pegawai data if exists
            if (pegawaiData) {
                const existingPegawai = await Prisma.pegawai.findUnique({
                    where: { userId: id },
                });

                if (existingPegawai) {
                    // Check for duplicate NIP if NIP is being changed
                    if (
                        pegawaiData.nip &&
                        pegawaiData.nip !== existingPegawai.nip
                    ) {
                        const duplicateNip = await Prisma.pegawai.findUnique({
                            where: { nip: pegawaiData.nip },
                        });
                        if (duplicateNip) {
                            throw new Error(
                                `NIP ${pegawaiData.nip} sudah terdaftar`,
                            );
                        }
                    }

                    await Prisma.pegawai.update({
                        where: { userId: id },
                        data: pegawaiData,
                    });
                }
            }

            return {
                message: "User updated successfully",
                user,
            };
        },
        {
            ...requirePermission("user", "update:all"),
            params: t.Object({
                id: t.String(),
            }),
            body: t.Object({
                name: t.Optional(t.String()),
                mahasiswaData: t.Optional(
                    t.Object({
                        nim: t.Optional(t.String()),
                        semester: t.Optional(t.Number()),
                        ipk: t.Optional(t.Number()),
                        ips: t.Optional(t.Number()),
                        tahunMasuk: t.Optional(t.String()),
                        noHp: t.Optional(t.String()),
                        departemenId: t.Optional(t.String()),
                        programStudiId: t.Optional(t.String()),
                        tempatLahir: t.Optional(t.String()),
                        tanggalLahir: t.Optional(t.String()),
                    }),
                ),
                pegawaiData: t.Optional(
                    t.Object({
                        nip: t.Optional(t.String()),
                        jabatan: t.Optional(t.String()),
                        noHp: t.Optional(t.String()),
                        departemenId: t.Optional(t.String()),
                        programStudiId: t.Optional(t.String()),
                    }),
                ),
            }),
        },
    )
    // Delete user
    .delete(
        "/:id",
        async ({ params: { id }, user: currentUser }) => {
            // Prevent self-deletion
            if (currentUser.userId === id) {
                throw new Error("Cannot delete your own account");
            }

            // Check if user has any letters
            const letterCount = await Prisma.letterInstance.count({
                where: { createdById: id },
            });

            // Delete related records first
            await Prisma.userRole.deleteMany({
                where: { userId: id },
            });

            await Prisma.mahasiswa.deleteMany({
                where: { userId: id },
            });

            await Prisma.pegawai.deleteMany({
                where: { userId: id },
            });

            await Prisma.account.deleteMany({
                where: { userId: id },
            });

            // Delete user
            await Prisma.user.delete({
                where: { id },
            });

            return {
                message: "User deleted successfully",
                hadLetters: letterCount > 0,
                letterCount,
            };
        },
        {
            ...requirePermission("user", "delete"),
            params: t.Object({
                id: t.String(),
            }),
        },
    )
    // Reset user password
    .post(
        "/:id/reset-password",
        async ({ params: { id } }) => {
            // Generate temporary password
            const tempPassword = `temp${Math.random().toString(36).slice(2, 10)}`;
            const hashedPassword = await hashPassword(tempPassword);

            // Get user's credential account
            const user = await Prisma.user.findUnique({
                where: { id },
            });

            if (!user) {
                throw new Error("User not found");
            }

            // Update account password
            const accountId = `${id}_credential`;
            await Prisma.account.update({
                where: { id: accountId },
                data: {
                    password: hashedPassword,
                },
            });

            return {
                message: "Password reset successfully",
                temporaryPassword: tempPassword,
                email: user.email,
            };
        },
        {
            ...requirePermission("password", "reset"),
            params: t.Object({
                id: t.String(),
            }),
        },
    )
    // Toggle user status (activate/deactivate)
    .post(
        "/:id/toggle-status",
        async ({ params: { id } }) => {
            const user = await Prisma.user.findUnique({
                where: { id },
            });

            if (!user) {
                throw new Error("User not found");
            }

            const updatedUser = await Prisma.user.update({
                where: { id },
                data: {
                    emailVerified: !user.emailVerified,
                },
            });

            return {
                message: `User ${updatedUser.emailVerified ? "activated" : "deactivated"} successfully`,
                user: updatedUser,
            };
        },
        {
            ...requirePermission("user", "toggle:status"),
            params: t.Object({
                id: t.String(),
            }),
        },
    );
