import { authGuardPlugin } from "@backend/middlewares/auth.ts";
import { Elysia } from "elysia";
import { Prisma } from "../db/index.ts";

const db = Prisma;

export default new Elysia().use(authGuardPlugin).get(
    "/",
    async ({ user, set }) => {
        if (!user) {
            set.status = 401;
            return { error: "Unauthorized" };
        }

        const fullUser = await db.user.findUnique({
            where: { id: user.id },
            include: {
                mahasiswa: {
                    include: {
                        departemen: true,
                        programStudi: true,
                    },
                },
            },
        });

        if (!fullUser) {
            set.status = 404;
            return { error: "User not found" };
        }

        return fullUser;
    },
    {},
);
