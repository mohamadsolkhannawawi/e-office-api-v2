import { cors } from "@elysiajs/cors";
import { serverTiming } from "@elysiajs/server-timing";
import { swagger } from "@elysiajs/swagger";
import { auth } from "@backend/lib/auth.ts";
import { Elysia } from "elysia";
import { autoload } from "elysia-autoload";
import env from "env-var";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import suratRekomendasiRoutes from "./modules/surat-rekomendasi-beasiswa/routes.ts";
import notificationRoutes from "./routes/notifications.ts";
import signatureRoutes from "./routes/signatures.ts";
import stampRoutes from "./routes/stamps.ts";
import letterNumberRoutes from "./routes/master/letterNumber.ts";
import letterNumberingRoutes from "./routes/master/letterNumbering.ts";
import { templatesRoute } from "./routes/templates/index.ts"; // Rute template
import documentAdminRoute from "./routes/admin/documents.ts"; // Rute admin dokumen
import userRoutes from "./routes/user/index.ts"; // Rute self-service pengguna
import { ssoRoutes } from "./lib/sso/routes.ts"; // Integrasi SSO FSM UNDIP

import { PrismaClient } from "@backend/db/index.ts";

const prisma = new PrismaClient();

export const app = new Elysia()
  .use(swagger())
  .use(
    cors({
      origin: env
        .get("ALLOWED_ORIGINS")
        .default("http://localhost:3000")
        .asString()
        .split(","),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .use(serverTiming())
  .use(ssoRoutes)
  // Menangani session secara eksplisit untuk menambahkan role pengguna.
  .get("/api/auth/get-session", async ({ request }) => {
    console.log(">>> MANUAL HANDLER HANDLER HIT: /api/auth/get-session");
    console.log("Request Headers:", request.headers.toJSON()); // Log header request

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

          // Set cookie terpisah agar middleware dapat membaca role.
          const responseData = {
            ...session,
            user: {
              ...session.user,
              roles,
            },
          };

          const response = new Response(JSON.stringify(responseData), {
            headers: {
              "Content-Type": "application/json",
            },
          });

          // Tambahkan header cookie.
          const rolesString = roles.join(",");
          const isProd = process.env.NODE_ENV === "production";
          response.headers.append(
            "Set-Cookie",
            `user_roles=${rolesString}; Path=/; HttpOnly; SameSite=Lax; ${isProd ? "Secure;" : ""}`,
          );

          return response;
        } catch (dbError) {
          console.error(">>> DATABASE ERROR WHILE FETCHING ROLES:", dbError);
          // Jika terjadi error database (misalnya user tidak ditemukan setelah migrasi), bersihkan session.
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
                  "user_roles=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0", // Hapus cookie
              },
            },
          );
        }
      }

      console.log(">>> NO SESSION OR USER FOUND IN MANUAL HANDLER");
      // Saat session tidak ditemukan, kembalikan 401 agar frontend redirect ke halaman login.
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

      // Tangani P2025: record tidak ditemukan (umum setelah migrate reset).
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

      // Error autentikasi lainnya.
      console.log(">>> OTHER AUTH ERROR - RETURNING NULL SESSION");
      return {
        session: null,
        user: null,
        error: authError.message || "Authentication failed",
      };
    }
  })
  // Interceptor sign-in kustom untuk validasi status akun sebelum diproses Better Auth.
  .post("/api/auth/sign-in/email", async ({ body, request }) => {
    try {
      const { email, password, callbackURL } = body as {
        email: string;
        password: string;
        callbackURL?: string;
      };

      // Pra-validasi: periksa apakah akun pengguna aktif (isActive=true).
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          isActive: true,
          email: true,
          name: true,
        },
      });

      // Jika user ditemukan tetapi akun nonaktif (isActive=false), tolak segera.
      if (user && !user.isActive) {
        console.log(`>>> SIGN-IN BLOCKED: Account deactivated for ${email}`);
        return new Response(
          JSON.stringify({
            error:
              "Account has been deactivated. Please contact administrator.",
            code: "ACCOUNT_DEACTIVATED",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Jika validasi lolos, buat request baru dengan body yang sama untuk Better Auth.
      console.log(
        `>>> SIGN-IN: Forwarding to Better Auth handler for ${email}`,
      );
      const newRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify({ email, password, callbackURL }),
      });

      return await auth.handler(newRequest);
    } catch (error: any) {
      console.error(">>> CUSTOM SIGN-IN ERROR:", error);

      // Teruskan error autentikasi dari Better Auth.
      return new Response(
        JSON.stringify({
          error: error.message || "Authentication failed",
          code: "AUTH_ERROR",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  })
  // Pasang handler Better Auth untuk endpoint autentikasi dengan penanganan error.
  .all("/api/auth/*", async ({ request }) => {
    try {
      return await auth.handler(request);
    } catch (error: any) {
      console.error(">>> BETTER-AUTH HANDLER ERROR:", error);

      // Tangani P2025: record tidak ditemukan (pembersihan session setelah migrate reset).
      if (
        error.code === "P2025" ||
        error.message?.includes("No record was found")
      ) {
        console.log(">>> CLEARING STALE SESSION COOKIES AFTER MIGRATE RESET");
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

      // Lempar ulang error lainnya.
      throw error;
    }
  })
  // Pasang seluruh rute di bawah prefix /api agar selaras dengan rewrite Next.js.
  .group("/api", (api) =>
    api
      .use(suratRekomendasiRoutes)
      .use(notificationRoutes)
      .use(signatureRoutes)
      .use(stampRoutes)
      .use(templatesRoute) // Rute template
      .use(documentAdminRoute) // Rute admin untuk cleanup dokumen
      .use(userRoutes) // Rute self-service pengguna
      .group("/master", (master) =>
        master.use(letterNumberRoutes).use(letterNumberingRoutes),
      ),
  )
  .use(
    await autoload({
      dir: path.resolve(__dirname, "routes"),
      prefix: "/api",
      types: {
        output: path.resolve(__dirname, "autogen.routes.ts"),
        typeName: "App",
        useExport: true,
      },
    }),
  );

export type App = typeof app;
