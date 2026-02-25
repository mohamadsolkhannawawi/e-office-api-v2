import { Elysia, t } from "elysia";
import { auth } from "@backend/lib/auth.ts";
import { Prisma } from "@backend/db/index.ts";
import { hashPassword, verifyPassword } from "better-auth/crypto";

/**
 * In-memory rate limiter for change-password endpoint.
 * Max 5 failed attempts per user per 15 minutes.
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
        // First attempt or window expired — reset
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
 * User Self-Service Routes
 * Requires authentication via session cookie.
 */
export const userRoutes = new Elysia({ prefix: "/user", tags: ["User"] })
    /**
     * POST /api/user/change-password
     * Change the authenticated user's password.
     * Rate-limited: max 5 attempts per 15 minutes.
     */
    .post(
        "/change-password",
        async ({ body, set, request }) => {
            const { currentPassword, newPassword, confirmPassword } = body;

            // ── 1. Validate session ──────────────────────────────────────────
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

            // ── 2. Rate limit check ──────────────────────────────────────────
            const rateCheck = checkRateLimit(userId);
            if (!rateCheck.allowed) {
                const waitMinutes = Math.ceil(
                    (rateCheck.remainingMs ?? 0) / 60000,
                );
                set.status = 429;
                return {
                    success: false,
                    error: "Too Many Requests",
                    message: `Terlalu banyak percobaan. Coba lagi dalam ${waitMinutes} menit.`,
                };
            }

            // ── 3. Validate new password == confirm password ─────────────────
            if (newPassword !== confirmPassword) {
                set.status = 422;
                return {
                    success: false,
                    error: "Validation Error",
                    message:
                        "Password baru dan konfirmasi password tidak cocok.",
                };
            }

            // ── 4. Password strength validation ─────────────────────────────
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
                    message:
                        "Password baru tidak boleh sama dengan password lama.",
                };
            }

            // ── 5. Find credential account ───────────────────────────────────
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

            // ── 6. Verify current password ───────────────────────────────────
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

            // ── 7. Hash & update new password ────────────────────────────────
            const hashedNewPassword = await hashPassword(newPassword);

            await Prisma.account.update({
                where: { id: account.id },
                data: { password: hashedNewPassword },
            });

            // ── 8. Reset rate limit on success ───────────────────────────────
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
