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
);
