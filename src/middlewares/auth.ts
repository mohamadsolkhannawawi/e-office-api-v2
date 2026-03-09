import { Elysia } from "elysia";
import { auth } from "@backend/lib/auth.ts";
import { checkPermission, getUserRoles } from "@backend/lib/casbin.ts";
import { Prisma } from "@backend/db/index.ts";

export interface PermissionProps {
    resource: string;
    action: string;
}

export interface RequiredRoleProps {
    requiredRole: string;
}

/* ---------- authGuardPlugin ---------- */
export const authGuardPlugin = new Elysia({
    name: "auth",
})
    .mount(auth.handler)
    .resolve(async ({ status, request: { headers } }) => {
        const session = await auth.api.getSession({ headers });

        if (!session) return status(401);

        // Check if user is still active (not deactivated)
        const user = await Prisma.user.findUnique({
            where: { id: session.user.id },
            select: { isActive: true, email: true },
        });

        if (!user || !user.isActive) {
            console.log(
                `[Auth Guard] Blocked request from deactivated user: ${user?.email || session.user.email}`,
            );
            return status(403, {
                error: "Account Deactivated",
                message:
                    "Your account has been deactivated. Please contact administrator.",
            });
        }

        return {
            user: session.user,
            session: session.session,
        };
    })
    .macro({
        permission: ({ resource, action }: PermissionProps) => {
            return {
                async resolve({ status, user }) {
                    if (!user) {
                        return status(401, {
                            error: "Unauthorized",
                            message: "Authentication required",
                        });
                    }

                    const hasPermission = await checkPermission(
                        user.id,
                        resource,
                        action,
                    );

                    if (!hasPermission) {
                        const roles = await getUserRoles(user.id);
                        return status(403, {
                            error: "Forbidden",
                            message: `You don't have permission to ${action} ${resource}`,
                            userRoles: roles,
                        });
                    }

                    return { user };
                },
            };
        },

        role: ({ requiredRole }: RequiredRoleProps) => {
            return {
                async resolve({ status, user }) {
                    if (!user) {
                        return status(401, {
                            error: "Unauthorized",
                            message: "Authentication required",
                        });
                    }

                    const roles = await getUserRoles(user.id);

                    if (!roles.includes(requiredRole)) {
                        return status(403, {
                            error: "Forbidden",
                            message: `Role '${requiredRole}' required`,
                            userRoles: roles,
                        });
                    }
                    return { user };
                },
            };
        },
    })
    .as("scoped");

/* ---------- helper functions ---------- */
export const requirePermission = (resource: string, action: string) => ({
    permission: { resource, action },
});

export const requireRole = (role: string) => ({
    role: { requiredRole: role },
});
