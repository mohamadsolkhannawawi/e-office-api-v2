import { cors } from "@elysiajs/cors";
import { serverTiming } from "@elysiajs/server-timing";
import { swagger } from "@elysiajs/swagger";
import { auth } from "@backend/lib/auth.ts";
import { Elysia } from "elysia";
import { autoload } from "elysia-autoload";
import env from "env-var";
import suratRekomendasiRoutes from "./modules/surat-rekomendasi-beasiswa/routes.ts";

export const app = new Elysia()
    .use(swagger())
    .use(
        cors({
            origin: "*", // env.get("FE_URL").asString(),
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            credentials: true,
            allowedHeaders: ["Content-Type", "Authorization"],
        }),
    )
    .use(serverTiming())
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
