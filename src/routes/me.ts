import { authGuardPlugin } from "@backend/middlewares/auth.ts";
import { Elysia, t } from "elysia";
import { Prisma } from "../db/index.ts";

const db = Prisma;

export default new Elysia()
    .use(authGuardPlugin)
    .get(
        "/",
        async ({ user, set }) => {
            if (!user) {
                set.status = 401;
                return { error: "Unauthorized" };
            }

            console.log(`>>> FETCHING ME FOR USER: ${user.id} (${user.email})`);
            const fullUser = await db.user.findUnique({
                where: { id: user.id },
                include: {
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
                    userRole: {
                        include: {
                            role: true,
                        },
                    },
                },
            });

            if (!fullUser) {
                console.log(`>>> USER NOT FOUND IN DB: ${user.id}`);
                set.status = 404;
                return { error: "User not found" };
            }

            console.log(">>> FULL USER DATA:", {
                id: fullUser.id,
                email: fullUser.email,
                hasMahasiswa: !!fullUser.mahasiswa,
                mahasiswaNim: fullUser.mahasiswa?.nim,
            });

            return fullUser;
        },
        {},
    )
    .put(
        "/",
        async ({ user, set, body }) => {
            if (!user) {
                set.status = 401;
                return { error: "Unauthorized" };
            }

            try {
                // Update user name
                const updatedUser = await db.user.update({
                    where: { id: user.id },
                    data: {
                        name: body.name,
                    },
                });

                // Update phone number based on role (mahasiswa or pegawai)
                if (body.noHp) {
                    const mahasiswa = await db.mahasiswa.findUnique({
                        where: { userId: user.id },
                    });

                    if (mahasiswa) {
                        await db.mahasiswa.update({
                            where: { userId: user.id },
                            data: { noHp: body.noHp },
                        });
                    } else {
                        const pegawai = await db.pegawai.findUnique({
                            where: { userId: user.id },
                        });
                        if (pegawai) {
                            await db.pegawai.update({
                                where: { userId: user.id },
                                data: { noHp: body.noHp },
                            });
                        }
                    }
                }

                return { success: true, data: updatedUser };
            } catch (error) {
                console.error("Update profile error:", error);
                set.status = 500;
                return {
                    error: "Internal Server Error",
                    message: (error as Error).message,
                };
            }
        },
        {
            body: t.Object({
                name: t.String({ minLength: 1 }),
                noHp: t.Optional(t.String()),
            }),
        },
    );
