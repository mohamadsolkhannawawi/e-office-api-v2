import { Elysia, t } from "elysia";
import { auth } from "@backend/lib/auth.ts";
import { Prisma } from "@backend/db/index.ts";
import { hashPassword, verifyPassword } from "better-auth/crypto";

/**
 * Rate limiter berbasis memori untuk endpoint ubah password.
 * Maksimal 5 percobaan gagal per user per 15 menit.
 */
const rateLimitMap = new Map<string, { attempts: number; resetAt: number }>();

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(userId: string): {
  allowed: boolean;
  remainingMs?: number;
  remaining?: number;
} {
  const now = Date.now();
  const record = rateLimitMap.get(userId);

  if (!record || now > record.resetAt) {
    // Percobaan pertama atau jendela waktu habis — reset
    rateLimitMap.set(userId, {
      attempts: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (record.attempts >= RATE_LIMIT_MAX) {
    return {
      allowed: false,
      remainingMs: record.resetAt - now,
    };
  }

  record.attempts += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.attempts };
}

function resetRateLimit(userId: string) {
  rateLimitMap.delete(userId);
}

/**
 * Route Self-Service User
 * Memerlukan autentikasi melalui session cookie.
 */
export const userRoutes = new Elysia({ prefix: "/user", tags: ["User"] })
  /**
   * POST /api/user/change-password
   * Mengubah password user yang sedang terautentikasi.
   * Dibatasi: maksimal 5 percobaan per 15 menit.
   */
  .post(
    "/change-password",
    async ({ body, set, request }) => {
      const { currentPassword, newPassword, confirmPassword } = body;

      // ── 1. Validasi sesi ─────────────────────────────────────────────
      const session = await auth.api.getSession({
        headers: request.headers,
      });

      if (!session?.user) {
        set.status = 401;
        return {
          success: false,
          error: "Unauthorized",
          message: "Anda harus login terlebih dahulu.",
        };
      }

      const userId = session.user.id;

      // ── 2. Cek rate limit ────────────────────────────────────────────
      const rateCheck = checkRateLimit(userId);
      if (!rateCheck.allowed) {
        const waitMinutes = Math.ceil((rateCheck.remainingMs ?? 0) / 60000);
        set.status = 429;
        return {
          success: false,
          error: "Too Many Requests",
          message: `Terlalu banyak percobaan. Coba lagi dalam ${waitMinutes} menit.`,
        };
      }

      // ── 3. Validasi password baru == konfirmasi password ────────────
      if (newPassword !== confirmPassword) {
        set.status = 422;
        return {
          success: false,
          error: "Validation Error",
          message: "Password baru dan konfirmasi password tidak cocok.",
        };
      }

      // ── 4. Validasi kekuatan password ───────────────────────────────
      if (newPassword.length < 8) {
        set.status = 422;
        return {
          success: false,
          error: "Validation Error",
          message: "Password baru minimal 8 karakter.",
        };
      }

      if (currentPassword === newPassword) {
        set.status = 422;
        return {
          success: false,
          error: "Validation Error",
          message: "Password baru tidak boleh sama dengan password lama.",
        };
      }

      // ── 5. Cari akun credential ─────────────────────────────────────
      const account = await Prisma.account.findFirst({
        where: {
          userId,
          providerId: "credential",
        },
        select: { id: true, password: true },
      });

      if (!account || !account.password) {
        set.status = 400;
        return {
          success: false,
          error: "Account Error",
          message:
            "Akun Anda tidak mendukung perubahan password. Akun SSO tidak dapat diubah passwordnya.",
        };
      }

      // ── 6. Verifikasi password saat ini ─────────────────────────────
      const isValid = await verifyPassword({
        password: currentPassword,
        hash: account.password,
      });

      if (!isValid) {
        set.status = 401;
        return {
          success: false,
          error: "Wrong Password",
          message: "Password lama yang Anda masukkan salah.",
        };
      }

      // ── 7. Hash dan update password baru ────────────────────────────
      const hashedNewPassword = await hashPassword(newPassword);

      await Prisma.account.update({
        where: { id: account.id },
        data: { password: hashedNewPassword },
      });

      // ── 8. Reset rate limit saat sukses ─────────────────────────────
      resetRateLimit(userId);

      console.log(
        `[User] Password changed successfully for user: ${session.user.email}`,
      );

      set.status = 200;
      return {
        success: true,
        message: "Password berhasil diubah.",
      };
    },
    {
      body: t.Object({
        currentPassword: t.String({ minLength: 1 }),
        newPassword: t.String({ minLength: 8 }),
        confirmPassword: t.String({ minLength: 1 }),
      }),
    },
  );

export default userRoutes;
