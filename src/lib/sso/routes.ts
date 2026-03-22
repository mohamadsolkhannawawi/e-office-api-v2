/**
 * SSO (Single Sign-On) Routes - Integrasi dengan SSO Engine UNDIP
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * File ini mendefinisikan 3 endpoint utama untuk SSO authentication flow:
 *
 * 1. GET /auth/sso
 *    - Menerima SSO token dari client
 *    - Validasi token ke SSO Engine
 *    - Sync user ke database lokal (auto-register jika baru)
 *    - Assign role dan buat profil user (mahasiswa/pegawai)
 *    - Buat session untuk Better Auth
 *    - Return callback URL dengan session token
 *
 * 2. GET /auth/sso/redirect
 *    - Redirect endpoint untuk SSO callback
 *    - Menerima token dari SSO engine
 *    - Redirect ke frontend dengan token
 *
 * 3. GET /api/auth/sso/set-session
 *    - Set session cookie untuk Better Auth
 *    - Verifikasi token valid dan belum expired
 *    - HMAC sign token dengan BETTER_AUTH_SECRET
 *    - Set secure HttpOnly cookie
 *
 * SSO Role Mapping:
 * - mahasiswa → MAHASISWA (hanya submit beasiswa)
 * - dosen → SUPERVISOR (verifikasi)
 * - staff → SUPERVISOR (verifikasi)
 * - superadmin → SUPER_ADMIN (full access)
 *
 * Database Sync:
 * - Auto-register user dari SSO jika belum ada
 * - Auto-assign role berdasarkan SSO role mapping
 * - Auto-create profil mahasiswa atau pegawai
 * - Update profil jika sudah ada
 */

import { Prisma } from "@backend/db/index.ts";
// [IMPORTS] Import dependencies
import { config } from "@backend/config.ts";
import { Elysia } from "elysia";
import { randomBytes, createHmac } from "crypto";

// [ENDPOINT 1] POST /auth/sso - Main SSO Authentication Handler
// Flow: Extract Token → Validate with SSO Engine → Sync User → Create Session → Return Callback URL
export const ssoRoutes = new Elysia()
  .get("/auth/sso", async ({ headers, set, request }) => {
    // [EXTRACT TOKEN] Ambil token dari Authorization header
    // Support format: "Bearer <token>" atau token langsung
    const authHeader = headers.authorization;
    let ssoToken: string | undefined;

    if (authHeader?.startsWith("Bearer ")) {
      ssoToken = authHeader.slice(7);
    } else if (authHeader) {
      ssoToken = authHeader;
    }

    if (!ssoToken) {
      set.status = 400;
      console.warn("[WARNING] /auth/sso: Token missing in request");
      return { message: "Token missing" };
    }

    // [VALIDATE TOKEN] Validasi token ke SSO Engine
    // Call SSO API endpoint /users/me dengan Authorization header
    // PENTING: Tambahkan prefix "Bearer " saat memanggil SSO API
    let ssoUser: {
      id: string;
      name: string;
      username: string;
      role: string;
    };

    try {
      const ssoRes = await fetch(`${config.SSO_API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${ssoToken}` },
      });

      if (!ssoRes.ok) {
        console.error(
          `[ERROR] SSO /users/me returned ${ssoRes.status} for token`,
        );
        set.status = 401;
        return { message: "Invalid SSO token" };
      }

      const ssoData = (await ssoRes.json()) as { data: typeof ssoUser };
      ssoUser = ssoData.data;
    } catch (err) {
      console.error("[ERROR] SSO Failed to call SSO /users/me:", err);
      set.status = 401;
      return { message: "Invalid SSO token" };
    }

    // [EXTRACT EMAIL] Extract email dari username di response SSO
    // Username di response SSO berupa email user
    const email = ssoUser?.username;
    if (!email || typeof email !== "string") {
      set.status = 401;
      console.warn("[WARNING] Invalid SSO token payload - no email");
      return { message: "Invalid SSO token payload" };
    }

    // [ROLE MAPPING] Map SSO role ke role di database lokal
    // SSO role dari JWT payload: "mahasiswa" | "dosen" | "staff" | "superadmin"
    // Semua non-mahasiswa di-map ke SUPERVISOR role
    const ssoRoleToDbRole: Record<string, string> = {
      mahasiswa: "MAHASISWA",
      dosen: "SUPERVISOR",
      staff: "SUPERVISOR",
      superadmin: "SUPER_ADMIN",
    };
    const targetRoleName = ssoRoleToDbRole[ssoUser.role] ?? null;

    // [FUNCTION] assignRoleAndProfile - Assign role dan buat profil untuk user
    // Tasks:
    // 1. Cek apakah user sudah memiliki role
    // 2. Jika belum, create/find role dan assign ke user
    // 3. Cek apakah user sudah memiliki profil (mahasiswa atau pegawai)
    // 4. Jika belum, buat profil baru berdasarkan SSO role
    const assignRoleAndProfile = async (userId: string) => {
      // [CHECK ROLE] Cek apakah user sudah memiliki role yang ditarget
      if (!targetRoleName) return;

      const existingRole = await Prisma.userRole.findFirst({
        where: {
          userId,
          role: { name: targetRoleName },
        },
      });

      // [ASSIGN ROLE] Jika belum ada, buat/find role dan assign ke user
      if (!existingRole) {
        let dbRole = await Prisma.role.findUnique({
          where: { name: targetRoleName },
        });
        if (!dbRole) {
          dbRole = await Prisma.role.create({
            data: { name: targetRoleName },
          });
          console.log(`[INFO] SSO Created new role: ${targetRoleName}`);
        }
        await Prisma.userRole.create({
          data: { userId, roleId: dbRole.id },
        });
        console.log(
          `[SUCCESS] SSO Assigned role ${targetRoleName} to user ${email}`,
        );
      }

      // [FETCH DEFAULTS] Ambil department dan program studi default dari DB
      // Untuk user baru, gunakan departemen dan prodi pertama yang ada
      const [defaultDept, defaultProdi] = await Promise.all([
        Prisma.departemen.findFirst(),
        Prisma.programStudi.findFirst(),
      ]);

      if (!defaultDept || !defaultProdi) return;

      // [CREATE PROFILE] Buat profil berdasarkan tipe user (mahasiswa atau pegawai)
      if (ssoUser.role === "mahasiswa") {
        // [MAHASISWA PROFILE] Untuk mahasiswa
        const existing = await Prisma.mahasiswa.findUnique({
          where: { userId },
        });
        if (!existing) {
          const nim = email.split("@")[0] ?? email;
          await Prisma.mahasiswa.create({
            data: {
              userId,
              nim,
              tahunMasuk: new Date().getFullYear().toString(),
              noHp: "-",
              departemenId: defaultDept.id,
              programStudiId: defaultProdi.id,
            },
          });
          console.log(`[SUCCESS] SSO Created mahasiswa profile for ${email}`);
        }
      } else if (
        ssoUser.role === "dosen" ||
        ssoUser.role === "staff" ||
        ssoUser.role === "superadmin"
      ) {
        // [PEGAWAI PROFILE] Untuk pegawai (dosen, staff, admin)
        const existing = await Prisma.pegawai.findUnique({ where: { userId } });
        if (!existing) {
          const nip = email.split("@")[0] ?? email;
          const jabatanMap: Record<string, string> = {
            dosen: "Dosen",
            staff: "Staff",
            superadmin: "Administrator Sistem",
          };
          await Prisma.pegawai.create({
            data: {
              userId,
              nip,
              jabatan: jabatanMap[ssoUser.role] ?? "Staff",
              noHp: "-",
              departemenId: defaultDept.id,
              programStudiId: defaultProdi.id,
            },
          });
          console.log(
            `[SUCCESS] SSO Created pegawai profile for ${email} (${ssoUser.role})`,
          );
        }
      }
    };

    // [SYNC USER] Upsert user di database lokal
    // Auto-register user baru dari SSO jika belum ada
    try {
      // [FIND USER] Cari user berdasarkan email dengan relasi role
      let user = await Prisma.user.findUnique({
        where: { email },
        include: { userRole: { include: { role: true } } },
      });

      if (!user) {
        // [NEW USER] Auto-register user baru dari SSO
        console.log(`[INFO] SSO Registering new user: ${email}`);

        user = await Prisma.user.create({
          data: {
            name: ssoUser.name,
            email,
            emailVerified: true,
            isActive: true,
          },
          include: { userRole: { include: { role: true } } },
        });

        await assignRoleAndProfile(user.id);

        // [RELOAD] Reload user dengan relasi yang baru dibuat
        user = await Prisma.user.findUnique({
          where: { id: user.id },
          include: { userRole: { include: { role: true } } },
        });
      } else {
        // [EXISTING USER] Process untuk user yang sudah terdaftar
        if (!user.isActive) {
          set.status = 403;
          console.warn(`[WARNING] SSO Account deactivated: ${email}`);
          return {
            message:
              "Account has been deactivated. Please contact administrator.",
          };
        }

        // [UPDATE NAME] Update nama jika ada perubahan di SSO
        if (user.name !== ssoUser.name) {
          await Prisma.user.update({
            where: { id: user.id },
            data: { name: ssoUser.name },
          });
        }

        // [ASSIGN ROLE] Assign role & buat profil jika belum ada
        await assignRoleAndProfile(user.id);

        // [RELOAD] Reload agar userRole ter-update
        user = await Prisma.user.findUnique({
          where: { id: user.id },
          include: { userRole: { include: { role: true } } },
        });

        console.log(`[INFO] SSO Existing user logged in: ${email}`);
      }

      if (!user) {
        set.status = 500;
        console.error("[ERROR] SSO Failed to create user account");
        return { message: "Failed to create user account" };
      }

      // [SESSION] Buat session yang kompatibel dengan Better Auth
      // Generate random token dan set expiry untuk 7 hari
      const sessionToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 hari

      // [CREATE SESSION] Create session di database
      await Prisma.session.create({
        data: {
          id: randomBytes(16).toString("hex"),
          token: sessionToken,
          userId: user.id,
          expiresAt,
          ipAddress:
            request.headers.get("x-forwarded-for") ??
            request.headers.get("x-real-ip") ??
            null,
          userAgent: request.headers.get("user-agent") ?? null,
        },
      });

      console.log(
        `[SUCCESS] SSO Session created for user ${email}, token ready`,
      );

      // [RETURN] Return callback URL dengan session token untuk frontend
      return {
        callback_url: `/sso/callback?token=${sessionToken}`,
      };
    } catch (error) {
      console.error("[ERROR] SSO Error during user sync:", error);
      set.status = 500;
      return { message: "Internal server error" };
    }
  })

  // [ENDPOINT 2] GET /auth/sso/redirect - SSO Redirect Handler
  // Menerima token dari SSO engine dan redirect ke frontend dengan token
  .get("/auth/sso/redirect", ({ query, set }) => {
    // [EXTRACT TOKEN] Ambil token dari query parameter
    const token = query.token as string | undefined;

    if (!token) {
      set.status = 400;
      console.warn("[WARNING] /auth/sso/redirect: Token missing in query");
      return { message: "Token missing" };
    }

    // [REDIRECT] Redirect ke frontend dengan token
    const feUrl =
      config.FRONTEND_URL ||
      "https://apps-fsm.undip.ac.id/persuratan-rekomendasi";
    set.status = 302;
    set.headers["Location"] =
      `${feUrl}/sso/callback?token=${encodeURIComponent(token)}`;
    console.log("[INFO] SSO Redirecting to frontend with token");
    return null;
  })

  // [ENDPOINT 3] GET /api/auth/sso/set-session - Set Session Cookie Handler
  // Verifikasi token dan set secure session cookie untuk Better Auth
  .get("/api/auth/sso/set-session", async ({ query, set }) => {
    // [EXTRACT TOKEN] Ambil token dari query parameter
    const token = query.token as string | undefined;

    if (!token) {
      set.status = 400;
      console.warn(
        "[WARNING] /api/auth/sso/set-session: Token missing in query",
      );
      return { message: "Token missing" };
    }

    // [VERIFY TOKEN] Verifikasi token ada di DB dan belum expired
    // Cek session dengan token dan pastikan belum melewati expiresAt
    const session = await Prisma.session.findFirst({
      where: {
        token,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!session || !session.user.isActive) {
      set.status = 401;
      console.warn("[WARNING] Invalid or expired session token");
      return { message: "Invalid or expired session token" };
    }

    // [SIGN TOKEN] Sign token dengan BETTER_AUTH_SECRET menggunakan HMAC-SHA256
    const secret = process.env.BETTER_AUTH_SECRET!;
    const sigBytes = createHmac("sha256", secret).update(token).digest();
    const b64sig = Buffer.from(sigBytes).toString("base64");
    const signedToken = encodeURIComponent(`${token}.${b64sig}`);

    // [SET COOKIE] Set secure HttpOnly cookie untuk session
    const isProd = process.env.NODE_ENV === "production";
    const maxAge = Math.floor(
      (session.expiresAt.getTime() - Date.now()) / 1000,
    );
    const secure = isProd ? "; Secure" : "";

    set.headers["Set-Cookie"] =
      `better-auth.session_token=${signedToken}; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=${maxAge}`;

    console.log(
      `[SUCCESS] SSO Session cookie set for user ${session.user.email}`,
    );
    return { success: true };
  });
