import { cors } from "@elysiajs/cors";
import { serverTiming } from "@elysiajs/server-timing";
import { swagger } from "@elysiajs/swagger";
import { auth } from "@backend/lib/auth.ts";
import { Elysia } from "elysia";
import { autoload } from "elysia-autoload";
import env from "env-var";
import suratRekomendasiRoutes from "./modules/surat-rekomendasi-beasiswa/routes.ts";
import notificationRoutes from "./routes/notifications.ts";
import signatureRoutes from "./routes/signatures.ts";
import stampRoutes from "./routes/stamps.ts";
import letterNumberRoutes from "./routes/master/letterNumber.ts";
import letterNumberingRoutes from "./routes/master/letterNumbering.ts";
import { templatesRoute } from "./routes/templates/index.ts"; // 🔴 TAMBAHAN

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

            // Set a separate cookie for middleware to access roles
            const responseData = {
                ...session,
                user: {
                    ...session.user,
                    roles,
                },
            };

            // Elysia handles return object as JSON response.
            // To set a cookie, we can use the 'set' property from the context if we deconstruct it,
            // or return a Response object with headers.
            // Let's use Response object to be explicit about headers.

            const response = new Response(JSON.stringify(responseData), {
                headers: {
                    "Content-Type": "application/json",
                },
            });

            // Append cookie header
            // Normalize roles to string, joined by comma
            const rolesString = roles.join(",");
            const isProd = process.env.NODE_ENV === "production";
            response.headers.append(
                "Set-Cookie",
                `user_roles=${rolesString}; Path=/; HttpOnly; SameSite=Lax; ${isProd ? "Secure;" : ""}`,
            );

            return response;
        }
        console.log(">>> NO SESSION OR USER FOUND IN MANUAL HANDLER");
        return session;
    })
    // Mount Better Auth handler for authentication endpoints
    .all("/api/auth/*", ({ request }) => auth.handler(request))
    // Mount routes under /api prefix to match Next.js rewrite
    .group("/api", (api) =>
        api
            .use(suratRekomendasiRoutes)
            .use(notificationRoutes)
            .use(signatureRoutes)
            .use(stampRoutes)
            .use(templatesRoute) // 🔴 TAMBAHAN: Template routes
            .group("/master", (master) =>
                master.use(letterNumberRoutes).use(letterNumberingRoutes),
            ),
    )
    .use(
        await autoload({
            prefix: "/api",
            types: {
                output: "./autogen.routes.ts",
                typeName: "App",
                useExport: true,
            },
        }),
    );

export type App = typeof app;
