import { Prisma as prisma } from "@backend/db/index.ts";
import { Elysia, t } from "elysia";

interface SSOResponse {
    data: {
        user: {
            role: string;
            name: string;
            username: string;
        };
    };
}

export default new Elysia().get(
    "/",
    async ({ headers, set }) => {
        const authHeader = headers.authorization;

        if (!authHeader) {
            set.status = 401;
            return { error: "Authorization header missing" };
        }

        // Validate with SSO service
        const ssoResponse = await fetch(
            `${process.env.SSO_URL}/users/validate`,
            {
                headers: {
                    Authorization: authHeader,
                    "Content-Type": "application/json",
                },
            },
        );

        if (ssoResponse.status !== 200) {
            set.status = 401;
            return { error: "SSO validation failed" };
        }

        const response = (await ssoResponse.json()) as SSOResponse;
        console.log("SSO response =>>", response);

        const username = response.data.user.username;

        // Find user in database
        let user = await prisma.user.findUnique({
            include: {
                userRole: {
                    include: {
                        role: true,
                    },
                },
            },
            where: {
                email: username, // Assuming username from SSO is email
            },
        });

        console.log("user local =>", user);

        // Register user to application if not found
        try {
            if (!user) {
                const dataUser = {
                    name: response.data.user.name,
                    email: response.data.user.username,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                user = await prisma.user.create({
                    data: dataUser,
                    include: {
                        userRole: {
                            include: {
                                role: true,
                            },
                        },
                    },
                });

                console.log("user created =>", user);

                // Assign profile and role based on SSO role
                if (response.data.user.role === "mahasiswa") {
                    // We need a default departemen and prodi if they are required in schema
                    // For now searching for any existing ones or using placeholder IDs if known
                    // Ideally these should be synced from SSO too
                    const defaultDept = await prisma.departemen.findFirst();
                    const defaultProdi = await prisma.programStudi.findFirst();

                    if (!defaultDept || !defaultProdi) {
                        throw new Error(
                            "Default departemen or prodi not found in database",
                        );
                    }

                    await prisma.mahasiswa.create({
                        data: {
                            userId: user.id,
                            nim: username.split("@")[0] || "24060123456789",
                            tahunMasuk: new Date().getFullYear().toString(),
                            noHp: "-",
                            departemenId: defaultDept.id,
                            programStudiId: defaultProdi.id,
                        },
                    });

                    const role = await prisma.role.findUnique({
                        where: { name: "mahasiswa" },
                    });
                    if (role) {
                        await prisma.userRole.create({
                            data: {
                                userId: user.id,
                                roleId: role.id,
                            },
                        });
                    }
                } else if (response.data.user.role === "dosen") {
                    const defaultDept = await prisma.departemen.findFirst();
                    const defaultProdi = await prisma.programStudi.findFirst();

                    if (!defaultDept || !defaultProdi) {
                        throw new Error(
                            "Default departemen or prodi not found in database",
                        );
                    }

                    await prisma.pegawai.create({
                        data: {
                            userId: user.id,
                            nip: username.split("@")[0] || "24060123456789",
                            jabatan: "Dosen",
                            noHp: "-",
                            departemenId: defaultDept.id,
                            programStudiId: defaultProdi.id,
                        },
                    });

                    const role = await prisma.role.findUnique({
                        where: { name: "dosen_pembimbing" },
                    });
                    if (role) {
                        await prisma.userRole.create({
                            data: {
                                userId: user.id,
                                roleId: role.id,
                            },
                        });
                    }
                }
            }

            return { success: true, user: user };
        } catch (error) {
            console.error("Error creating user from SSO =>", error);
            set.status = 500;
            return {
                error: "Internal server error during user synchronization",
            };
        }
    },
    {
        headers: t.Object({
            authorization: t.String(),
        }),
    },
);
