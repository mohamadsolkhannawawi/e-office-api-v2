/**
 * Better Auth Configuration - Konfigurasi Authentication System
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * File ini mendefinisikan konfigurasi Better Auth untuk authentication system FSM UNDIP.
 * Better Auth adalah authentication library yang production-ready dengan Prisma adapter.
 *
 * PENTING:
 * - Jangan gunakan @ import aliases di file ini (Better Auth sangat picky dengan imports)
 * - Semua konfigurasi plugin, session, dan cookie didefinisikan di sini
 * - Mendukung email/password auth, anonymous users, dan bearer token auth
 * - Session expire dalam 7 hari
 * - Support SSO integration melalui plugin bearer token
 *
 * Feature Utama:
 * - Email & Password authentication (dengan optional email verification)
 * - Anonymous user support (untuk guest access)
 * - Bearer token auth (untuk API/SSO integration)
 * - Session caching (5 menit untuk performa)
 * - CORS dengan configurable trusted origins
 * - Secure cookies (HttpOnly, SameSite=Lax)
 */

// [IMPORTS] Import Better Auth dan dependencies
// PENTING: Tidak menggunakan @ alias di file ini
import { PrismaClient } from "@backend/db/index.ts";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { anonymous, bearer } from "better-auth/plugins";

// [PRISMA CLIENT] Initialize Prisma Client untuk Better Auth adapter
const prisma = new PrismaClient();

// [ORIGINS] Parse trusted origins dari environment variable
// Format: comma-separated list
// Better Auth expects origin only (scheme + host + optional port), no path
// Fallback ke localhost:3000 jika tidak dikonfigurasi
const trustedOrigins = process.env.ALLOWED_ORIGINS?.split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => {
    try {
      // [PARSE] Parse URL dan extract origin (scheme + host + port)
      return new URL(value).origin;
    } catch {
      // [FALLBACK] Jika parsing gagal, gunakan value apa adanya
      return value;
    }
  }) || ["http://localhost:3000"];

/**
 * [AUTH] Better Auth Configuration Instance
 *
 * Konfigurasi lengkap untuk authentication system:
 * - Database adapter: Prisma PostgreSQL
 * - Email/Password auth: enabled dengan optional email verification
 * - Session: 7 hari expiry, update setiap 24 jam
 * - Plugins: anonymous users + bearer token (untuk SSO)
 * - Cookie: Secure HttpOnly dengan SameSite=Lax
 * - CORS: Configurable trusted origins
 */
export const auth = betterAuth({
  // [DATABASE] Prisma adapter untuk PostgreSQL
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  // [EXPERIMENTAL] Enable experimental features (joins untuk query optimization)
  experimental: {
    joins: true,
  },
  // [EMAIL PASSWORD] Email & password authentication
  emailAndPassword: {
    enabled: true,
    // [VERIFICATION] Email verification requirement (configurable via env var)
    requireEmailVerification: process.env.ENABLE_EMAIL_VERIFICATION === "true",
    // [PASSWORD RESET] Send password reset email handler
    sendResetPassword: async ({ user, url }) => {
      console.log(`[INFO] Password reset URL for ${user.email}: ${url}`);
    },
  },
  // [USER FIELDS] Additional user fields beyond default
  user: {
    additionalFields: {
      emailVerified: {
        type: "boolean",
        defaultValue: false,
        required: false,
      },
    },
  },
  // [SESSION] Session configuration
  session: {
    // [EXPIRY] Session expires dalam 7 hari
    expiresIn: 60 * 60 * 24 * 7,
    // [UPDATE AGE] Update session timestamp setiap 24 jam (untuk activity tracking)
    updateAge: 60 * 60 * 24,
    // [CACHE] Cookie cache untuk performa
    cookieCache: {
      enabled: true,
      // [CACHE AGE] Cache selama 5 menit
      maxAge: 5 * 60,
    },
  },
  // [ADVANCED] Advanced configuration untuk security
  advanced: {
    defaultCookieAttributes: {
      // [SECURE] HttpOnly: prevent JS access, Secure: HTTPS only in production
      secure: process.env.NODE_ENV === "production",
      // [SAMESITE] SameSite: Lax untuk balance antara security dan functionality
      sameSite: "lax",
      httpOnly: true,
    },
  },
  // [BASEPATH] Base path untuk auth endpoints
  basePath: "/api/auth",
  // [ORIGINS] Trusted origins untuk CORS
  trustedOrigins,
  // [PLUGINS] Authentication plugins
  // anonymous: support guest/anonymous users
  // bearer: support bearer token auth (untuk SSO integration)
  plugins: [anonymous(), bearer()],
});
