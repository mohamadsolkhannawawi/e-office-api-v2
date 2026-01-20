// dont use any @ import for this file, better auth is picky
import { PrismaClient } from "@backend/db/index.ts";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { anonymous, bearer } from "better-auth/plugins";

const prisma = new PrismaClient();

/**
 * Better Auth Configuration for FSM UNDIP
 * Version: 1.x
 */
export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    experimental: {
        joins: true,
    },
    emailAndPassword: {
        enabled: true,
        requireEmailVerification:
            process.env.ENABLE_EMAIL_VERIFICATION === "true",
        sendResetPassword: async ({ user, url }) => {
            console.log(`Password reset URL for ${user.email}: ${url}`);
        },
    },
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // Update session every 24 hours
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60, // Cache for 5 minutes
        },
    },
    advanced: {
        defaultCookieAttributes: {
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            httpOnly: true,
        },
    },
    basePath: "/api/auth",
    trustedOrigins: process.env.ALLOWED_ORIGINS?.split(",") || [
        "http://localhost:3000",
    ],
    plugins: [anonymous(), bearer()],
});
