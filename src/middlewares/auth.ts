/**
 * Authentication & Authorization Middleware - Elysia Middleware Plugins
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * File ini mendefinisikan Elysia middleware plugins untuk authentication dan authorization.
 * Middleware ini di-attach ke routes untuk validasi session dan permission checking.
 *
 * Fitur Utama:
 * - authGuardPlugin: Validasi session dan cek apakah user masih active
 * - permission macro: Check permission (resource + action) menggunakan Casbin
 * - role macro: Check role requirement menggunakan Casbin
 * - Helper functions: Utility functions untuk create permission/role requirements di routes
 *
 * Usage di Routes:
 * ```.get("/api/letter",
 *   ({ user }) => {
 *     // user data tersedia karena guard memvalidasi session
 *   },
 *   authGuardPlugin,
 *   { permission: { resource: "letter", action: "read" } }
 * )``
 *
 * atau dengan helper:
 * ```.get("/api/letter",
 *   ({ user }) => { ... },
 *   authGuardPlugin,
 *   requirePermission("letter", "read")
 * )``
 */

// [IMPORTS] Import Elysia, auth, permission checking, dan database
import { Elysia } from "elysia";
import { auth } from "@backend/lib/auth.ts";
import { checkPermission, getUserRoles } from "@backend/lib/casbin.ts";
import { Prisma } from "@backend/db/index.ts";

// [INTERFACES] Tipe-tipe props untuk macro functions
// PermissionProps: untuk permission checking macro
export interface PermissionProps {
  resource: string;
  action: string;
}

// RequiredRoleProps: untuk role checking macro
export interface RequiredRoleProps {
  requiredRole: string;
}

/**
 * [PLUGIN] authGuardPlugin - Session Validation & User Active Check Plugin
 *
 * Elysia plugin yang di-attach ke routes untuk:
 * 1. Validasi session dari Better Auth
 * 2. Cek apakah user masih active (tidak di-deactivate)
 * 3. Return user and session data untuk resolve di route handler
 *
 * Return:
 * - 401: Jika tidak ada session (belum login)
 * - 403: Jika user tidak active (account deactivated)
 * - { user, session }: Jika validasi berhasil
 *
 * Usage:
 * ```.get("/api/protected", ({ user }) => {...}, authGuardPlugin)``
 */
// [AUTH GUARD PLUGIN] Buat Elysia plugin untuk authentication guard
export const authGuardPlugin = new Elysia({
  name: "auth",
})
  .resolve(async ({ status, request: { headers } }) => {
    // [SESSION CHECK] Ambil session dari headers menggunakan Better Auth
    const session = await auth.api.getSession({ headers });

    // [UNAUTHORIZED] Jika tidak ada session, return 401
    if (!session) return status(401);

    // [ACTIVE CHECK] Cek apakah user masih active di database
    // Only fetch isActive status dan email untuk validation
    const user = await Prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isActive: true, email: true },
    });

    // [DEACTIVATED] Jika user tidak ditemukan atau sudah di-deactivate
    if (!user || !user.isActive) {
      console.log(
        `[WARNING] Auth Guard Blocked request from deactivated user: ${user?.email || session.user.email}`,
      );
      return status(403, {
        error: "Account Deactivated",
        message:
          "Your account has been deactivated. Please contact administrator.",
      });
    }

    // [SUCCESS] Return user dan session data untuk route handler
    return {
      user: session.user,
      session: session.session,
    };
  })
  .macro({
    // [PERMISSION MACRO] Macro untuk check permission (resource + action)
    // Usage: { permission: { resource: "letter", action: "read" } }
    permission: ({ resource, action }: PermissionProps) => {
      return {
        async resolve({ status, user }) {
          // [AUTH REQUIRED] Cek apakah user sudah authenticate
          if (!user) {
            return status(401, {
              error: "Unauthorized",
              message: "Authentication required",
            });
          }

          // [CHECK PERMISSION] Gunakan Casbin enforcer untuk check permission
          const hasPermission = await checkPermission(
            user.id,
            resource,
            action,
          );

          // [PERMISSION DENIED] Jika user tidak punya permission
          if (!hasPermission) {
            const roles = await getUserRoles(user.id);
            console.log(
              `[WARNING] Permission denied for user ${user.id}: ${action} on ${resource}`,
            );
            return status(403, {
              error: "Forbidden",
              message: `You don't have permission to ${action} ${resource}`,
              userRoles: roles,
            });
          }

          // [SUCCESS] Permission granted, return user
          return { user };
        },
      };
    },

    // [ROLE MACRO] Macro untuk check role requirement
    // Usage: { role: { requiredRole: "MAHASISWA" } }
    role: ({ requiredRole }: RequiredRoleProps) => {
      return {
        async resolve({ status, user }) {
          // [AUTH REQUIRED] Cek apakah user sudah authenticate
          if (!user) {
            return status(401, {
              error: "Unauthorized",
              message: "Authentication required",
            });
          }

          // [GET ROLES] Ambil semua roles dari Casbin
          const roles = await getUserRoles(user.id);

          // [ROLE NOT FOUND] Jika user tidak memiliki role yang dibutuhkan
          if (!roles.includes(requiredRole)) {
            console.log(
              `[WARNING] Role denied for user ${user.id}: requires ${requiredRole}, has ${roles.join(", ")}`,
            );
            return status(403, {
              error: "Forbidden",
              message: `Role '${requiredRole}' required`,
              userRoles: roles,
            });
          }

          // [SUCCESS] Role valid, return user
          return { user };
        },
      };
    },
  })
  .as("scoped");

// [HELPER FUNCTIONS] Utility functions untuk create requirement objects untuk routes

/**
 * [FUNCTION] requirePermission - Create permission requirement untuk route
 *
 * Helper function yang return object untuk digunakan di route decoration.
 * Memudahkan developer menggunakan permission macro tanpa perlu type object secara manual.
 *
 * Contoh:
 * ```.get("/api/letter",
 *   ({ user }) => { ... },
 *   authGuardPlugin,
 *   requirePermission("letter", "read")
 * )``
 *
 * @param resource - Resource name (letter, dokumen, setting, dll)
 * @param action - Action name (read, create, update, delete, approve, sign, publish)
 * @returns Object dengan permission requirement untuk macro
 */
// [PERMISSION HELPER] Return object untuk permission checking
export const requirePermission = (resource: string, action: string) => ({
  permission: { resource, action },
});

/**
 * [FUNCTION] requireRole - Create role requirement untuk route
 *
 * Helper function yang return object untuk digunakan di route decoration.
 * Memudahkan developer menggunakan role macro tanpa perlu type object secara manual.
 *
 * Contoh:
 * ```.get("/api/supervisor/dashboard",
 *   ({ user }) => { ... },
 *   authGuardPlugin,
 *   requireRole("SUPERVISOR")
 * )``
 *
 * @param role - Role name (MAHASISWA, SUPERVISOR, MANAJER_TU, WAKIL_DEKAN_1, UPA, SUPER_ADMIN)
 * @returns Object dengan role requirement untuk macro
 */
// [ROLE HELPER] Return object untuk role checking
export const requireRole = (role: string) => ({
  role: { requiredRole: role },
});
