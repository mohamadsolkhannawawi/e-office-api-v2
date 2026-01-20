import { cors } from "@elysiajs/cors";
import { serverTiming } from "@elysiajs/server-timing";
import { swagger } from "@elysiajs/swagger";
import { auth } from "@backend/lib/auth.ts";
import { Elysia } from "elysia";
import { autoload } from "elysia-autoload";
import env from "env-var";
import suratRekomendasiRoutes from "./modules/surat-rekomendasi-beasiswa/routes.ts";

import { PrismaClient } from "@backend/db/index.ts";

const prisma = new PrismaClient();

export const app = new Elysia()
    .use(swagger())
    .use(
        cors({
            origin: "http://localhost:3000", // Must be specific origin when using credentials
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            credentials: true,
            allowedHeaders: ["Content-Type", "Authorization"],
        }),
    )
    .use(serverTiming())
    // EXPLICTLY HANDLE SESSION TO ADD ROLES
    .get("/api/auth/get-session", async ({ request }) => {
        console.log(">>> MANUAL HANDLER HANDLER HIT: /api/auth/get-session");
        console.log("Request Headers:", request.headers.toJSON()); // Log headers
        const session = await auth.api.getSession({
            headers: request.headers,
        });

        if (session && session.user) {
            console.log(
                ">>> SESSION FOUND, FETCHING ROLES FOR:",
                session.user.email,
            );
            const userRoles = await prisma.userRole.findMany({
                where: { userId: session.user.id },
                include: { role: true },
            });
            const roles = userRoles.map((ur) => ur.role.name);
            console.log(">>> ROLES INJECTED:", roles);
            return {
                ...session,
                user: {
                    ...session.user,
                    roles,
                },
            };
        }
        console.log(">>> NO SESSION OR USER FOUND IN MANUAL HANDLER");
        return session;
    })
    // Mount Better Auth handler for authentication endpoints
    .all("/api/auth/*", ({ request }) => auth.handler(request))
    // Mount routes under /api prefix to match Next.js rewrite
    .group("/api", (api) => api.use(suratRekomendasiRoutes))
    .use(
        await autoload({
            types: {
                output: "./autogen.routes.ts",
                typeName: "App",
                useExport: true,
            },
        }),
    );

export type App = typeof app;
