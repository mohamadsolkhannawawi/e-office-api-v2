import { Elysia, t } from "elysia";
import { auth } from "@backend/lib/auth.ts";
import { Prisma } from "@backend/db/index.ts";

/**
 * Public Authentication Routes
 * Handles login, logout, registration, and password reset via Better Auth
 */
export const authRoutes = new Elysia({
    prefix: "/auth",
    tags: ["Authentication"],
})
    /**
     * Custom Sign-In with Account Status Validation
     * Validates emailVerified before allowing login
     */
    .post(
        "/sign-in/email",
        async ({ body, set, request }) => {
            try {
                // First, find user to check if account is active
                const user = await Prisma.user.findUnique({
                    where: { email: body.email },
                    select: {
                        id: true,
                        email: true,
                        emailVerified: true,
                    },
                });

                // Check if user exists and is deactivated
                if (user && !user.emailVerified) {
                    console.log(
                        `[Auth] Blocked login attempt for deactivated user: ${user.email}`,
                    );
                    set.status = 403;
                    return {
                        error: "Account Deactivated",
                        message:
                            "Your account has been deactivated. Please contact administrator for assistance.",
                    };
                }

                // If account is active or user doesn't exist yet, proceed with Better Auth
                // Better Auth will handle password verification
                const response = await auth.api.signInEmail({
                    body,
                    headers: request.headers,
                });

                // If sign-in successful but user became deactivated during process, delete session
                if (
                    response &&
                    typeof response === "object" &&
                    "user" in response
                ) {
                    const currentUser = await Prisma.user.findUnique({
                        where: { id: (response.user as any).id },
                        select: { emailVerified: true },
                    });

                    if (currentUser && !currentUser.emailVerified) {
                        // Delete the session that was just created
                        if ("session" in response && response.session) {
                            await Prisma.session
                                .delete({
                                    where: {
                                        token: (response.session as any).token,
                                    },
                                })
                                .catch(() => {});
                        }
                        console.log(
                            `[Auth] Deleted session for deactivated user during sign-in`,
                        );
                        set.status = 403;
                        return {
                            error: "Account Deactivated",
                            message:
                                "Your account has been deactivated. Please contact administrator.",
                        };
                    }
                }

                return response;
            } catch (error) {
                console.error("[Auth] Sign-in error:", error);
                set.status = 401;
                return {
                    error: "Authentication Failed",
                    message:
                        error instanceof Error
                            ? error.message
                            : "Invalid credentials",
                };
            }
        },
        {
            body: t.Object({
                email: t.String({ format: "email" }),
                password: t.String(),
                rememberMe: t.Optional(t.Boolean()),
            }),
        },
    )
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
