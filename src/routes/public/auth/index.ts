import { Elysia } from "elysia";
import { auth } from "@backend/lib/auth.ts";

/**
 * Public Authentication Routes
 * Handles login, logout, registration, and password reset via Better Auth
 */
export const authRoutes = new Elysia({
    prefix: "/auth",
    tags: ["Authentication"],
})
    /**
     * Get current session
     * Returns user info if authenticated
     */
    .get("/session", async ({ request }) => {
        const session = await auth.api.getSession({
            headers: request.headers,
        });

        if (!session) {
            return {
                user: null,
                session: null,
            };
        }

        return {
            user: session.user,
            session: session.session,
        };
    });

/**
 * Better Auth provides these endpoints automatically:
 * - POST /api/auth/sign-in/email - Login with email and password
 * - POST /api/auth/sign-out - Logout
 * - POST /api/auth/sign-up/email - Register new user
 * - POST /api/auth/forget-password - Request password reset
 * - POST /api/auth/reset-password - Reset password with token
 * - POST /api/auth/verify-email - Verify email
 */

export default authRoutes;
