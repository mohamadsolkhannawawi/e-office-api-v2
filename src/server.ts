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
import documentAdminRoute from "./routes/admin/documents.ts"; // 🔴 TAMBAHAN: Admin routes

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

        try {
            const session = await auth.api.getSession({
                headers: request.headers,
            });

            if (session && session.user) {
                console.log(
                    ">>> SESSION FOUND, FETCHING ROLES FOR:",
                    session.user.email,
                );

                try {
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

                    const response = new Response(
                        JSON.stringify(responseData),
                        {
                            headers: {
                                "Content-Type": "application/json",
                            },
                        },
                    );

                    // Append cookie header
                    const rolesString = roles.join(",");
                    const isProd = process.env.NODE_ENV === "production";
                    response.headers.append(
                        "Set-Cookie",
                        `user_roles=${rolesString}; Path=/; HttpOnly; SameSite=Lax; ${isProd ? "Secure;" : ""}`,
                    );

                    return response;
                } catch (dbError) {
                    console.error(
                        ">>> DATABASE ERROR WHILE FETCHING ROLES:",
                        dbError,
                    );
                    // If database error (e.g., user not found after migration), clear session
                    console.log(">>> CLEARING INVALID SESSION DUE TO DB ERROR");
                    return new Response(
                        JSON.stringify({
                            session: null,
                            user: null,
                            error: "Session invalid, please login again",
                        }),
                        {
                            status: 401,
                            headers: {
                                "Content-Type": "application/json",
                                "Set-Cookie":
                                    "user_roles=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0", // Clear cookies
                            },
                        },
                    );
                }
            }

            console.log(">>> NO SESSION OR USER FOUND IN MANUAL HANDLER");
            // When no session found, return 401 to trigger frontend redirect to login
            return new Response(
                JSON.stringify({
                    session: null,
                    user: null,
                    error: "No active session, please login",
                    requiresLogin: true,
                }),
                {
                    status: 401,
                    headers: {
                        "Content-Type": "application/json",
                        "Set-Cookie": [
                            "better-auth.session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
                            "better-auth.session_data=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
                            "user_roles=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
                        ].join(", "),
                    },
                },
            );
        } catch (authError: any) {
            console.error(">>> AUTH ERROR:", authError);

            // Handle P2025: Record not found (common after migrate reset)
            if (
                authError.code === "P2025" ||
                authError.message?.includes("No record was found")
            ) {
                console.log(
                    ">>> SESSION RECORD NOT FOUND (likely after migrate reset) - CLEARING COOKIES",
                );
                return new Response(
                    JSON.stringify({
                        session: null,
                        user: null,
                        error: "Session expired, please login again",
                    }),
                    {
                        status: 401,
                        headers: {
                            "Content-Type": "application/json",
                            "Set-Cookie": [
                                "better-auth.session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
                                "better-auth.session_data=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
                                "user_roles=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
                            ].join(", "),
                        },
                    },
                );
            }

            // Other auth errors
            console.log(">>> OTHER AUTH ERROR - RETURNING NULL SESSION");
            return {
                session: null,
                user: null,
                error: authError.message || "Authentication failed",
            };
        }
    })
    // Mount Better Auth handler for authentication endpoints with error handling
    .all("/api/auth/*", async ({ request }) => {
        try {
            return await auth.handler(request);
        } catch (error: any) {
            console.error(">>> BETTER-AUTH HANDLER ERROR:", error);

            // Handle P2025: Record not found (session cleanup after migrate reset)
            if (
                error.code === "P2025" ||
                error.message?.includes("No record was found")
            ) {
                console.log(
                    ">>> CLEARING STALE SESSION COOKIES AFTER MIGRATE RESET",
                );
                return new Response(
                    JSON.stringify({
                        error: "Session expired, please login again",
                        requiresLogin: true,
                    }),
                    {
                        status: 401,
                        headers: {
                            "Content-Type": "application/json",
                            "Set-Cookie": [
                                "better-auth.session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
                                "better-auth.session_data=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
                                "user_roles=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
                            ].join(", "),
                        },
                    },
                );
            }

            // Re-throw other errors
            throw error;
        }
    })
    // Mount routes under /api prefix to match Next.js rewrite
    .group("/api", (api) =>
        api
            .use(suratRekomendasiRoutes)
            .use(notificationRoutes)
            .use(signatureRoutes)
            .use(stampRoutes)
            .use(templatesRoute) // 🔴 TAMBAHAN: Template routes
            .use(documentAdminRoute) // 🔴 TAMBAHAN: Admin document cleanup routes
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
