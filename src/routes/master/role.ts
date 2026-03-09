import {
    authGuardPlugin,
    requirePermission,
} from "@backend/middlewares/auth.ts";
import { Prisma } from "@backend/db/index.ts";
import { assignRoleToUser, removeRoleFromUser } from "@backend/lib/casbin.ts";
import { Elysia, t } from "elysia";

export default new Elysia()
    .use(authGuardPlugin)
    // Get all roles with user counts
    .get(
        "/all",
        async () => {
            const roles = await Prisma.role.findMany({
                include: {
                    permissions: {
                        include: {
                            permission: true,
                        },
                    },
                    users: {
                        include: {
                            user: true,
                        },
                    },
                },
            });

            // Format response with user counts
            const formattedRoles = roles.map((role) => ({
                id: role.id,
                name: role.name,
                userCount: role.users.length,
                permissionCount: role.permissions.length,
                permissions: role.permissions.map((rp) => ({
                    resource: rp.permission.resource,
                    action: rp.permission.action,
                })),
            }));

            return { roles: formattedRoles };
        },
        {
            ...requirePermission("role", "read:all"),
        },
    )
    // Get role details with permissions
    .get(
        "/:roleId/permissions",
        async ({ params: { roleId } }) => {
            const role = await Prisma.role.findUnique({
                where: { id: roleId },
                include: {
                    permissions: {
                        include: {
                            permission: true,
                        },
                    },
                },
            });

            if (!role) {
                throw new Error("Role not found");
            }

            return {
                role: {
                    id: role.id,
                    name: role.name,
                    permissions: role.permissions.map((rp) => ({
                        id: rp.permission.id,
                        resource: rp.permission.resource,
                        action: rp.permission.action,
                    })),
                },
            };
        },
        {
            ...requirePermission("role", "read:all"),
            params: t.Object({
                roleId: t.String(),
            }),
        },
    )
    // Assign role to user
    .post(
        "/user/:userId/assign-role",
        async ({ params: { userId }, body: { roleId } }) => {
            // Get role
            const role = await Prisma.role.findUnique({
                where: { id: roleId },
            });

            if (!role) {
                throw new Error("Role not found");
            }

            // Check if user exists
            const user = await Prisma.user.findUnique({
                where: { id: userId },
            });

            if (!user) {
                throw new Error("User not found");
            }

            // Check if user role assignment already exists
            const existingUserRole = await Prisma.userRole.findUnique({
                where: {
                    userId_roleId: {
                        userId,
                        roleId,
                    },
                },
            });

            if (existingUserRole) {
                throw new Error("User already has this role");
            }

            // Create user role assignment in database
            await Prisma.userRole.create({
                data: {
                    userId,
                    roleId,
                },
            });

            // Update Casbin policies
            await assignRoleToUser(userId, role.name);

            return {
                message: "Role assigned successfully",
                userId,
                role: role.name,
            };
        },
        {
            ...requirePermission("role", "assign"),
            params: t.Object({
                userId: t.String(),
            }),
            body: t.Object({
                roleId: t.String(),
            }),
        },
    )
    // Remove role from user
    .delete(
        "/user/:userId/remove-role/:roleId",
        async ({ params: { userId, roleId }, user: currentUser }) => {
            // Get role
            const role = await Prisma.role.findUnique({
                where: { id: roleId },
            });

            if (!role) {
                throw new Error("Role not found");
            }

            // Prevent removing own role if it's the last one
            if (currentUser.id === userId) {
                const userRolesCount = await Prisma.userRole.count({
                    where: { userId },
                });

                if (userRolesCount <= 1) {
                    throw new Error(
                        "Cannot remove your last role. You must have at least one role.",
                    );
                }
            }

            // Delete user role assignment
            await Prisma.userRole.delete({
                where: {
                    userId_roleId: {
                        userId,
                        roleId,
                    },
                },
            });

            // Update Casbin policies
            await removeRoleFromUser(userId, role.name);

            return {
                message: "Role removed successfully",
                userId,
                role: role.name,
            };
        },
        {
            ...requirePermission("role", "revoke"),
            params: t.Object({
                userId: t.String(),
                roleId: t.String(),
            }),
        },
    )
    // Get user's roles
    .get(
        "/user/:userId/roles",
        async ({ params: { userId } }) => {
            const userRoles = await Prisma.userRole.findMany({
                where: { userId },
                include: {
                    role: {
                        include: {
                            permissions: {
                                include: {
                                    permission: true,
                                },
                            },
                        },
                    },
                },
            });

            return {
                userId,
                roles: userRoles.map((ur) => ({
                    id: ur.role.id,
                    name: ur.role.name,
                    permissionCount: ur.role.permissions.length,
                })),
            };
        },
        {
            ...requirePermission("role", "read:all"),
            params: t.Object({
                userId: t.String(),
            }),
        },
    );
