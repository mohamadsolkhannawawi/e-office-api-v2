import { newEnforcer, type Enforcer } from "casbin";
import { Prisma } from "@backend/db/index.ts";
import path from "node:path";

let enforcer: Enforcer | null = null;

export async function getEnforcer(): Promise<Enforcer> {
	if (!enforcer) {
		const modelPath = path.join(process.cwd(), "casbin", "model.conf");

		enforcer = await newEnforcer(modelPath);

		await syncPoliciesFromDatabase(enforcer);
	}

	return enforcer;
}

// Sync policies from Prisma database to Casbin
async function syncPoliciesFromDatabase(enforcer: Enforcer) {
	// Get all role permissions from database
	const rolePermissions = await Prisma.rolePermission.findMany({
		include: {
			role: true,
			permission: true,
		},
	});

	// Add policies from database
	for (const rp of rolePermissions) {
		const roleName = rp.role.name;
		const resource = rp.permission.resource;
		const action = rp.permission.action;

		await enforcer.addPolicy(roleName, resource, action);
	}

	// Get all user roles from database
	const userRoles = await Prisma.userRole.findMany({
		include: {
			user: true,
			role: true,
		},
	});

	// Add role assignments from database
	for (const ur of userRoles) {
		await enforcer.addGroupingPolicy(ur.userId, ur.role.name);
	}

	console.log("Policies synced from database to Casbin");
}

// Check if user has permission
export async function checkPermission(
	userId: string,
	resource: string,
	action: string,
): Promise<boolean> {
	const enforcer = await getEnforcer();
	return await enforcer.enforce(userId, resource, action);
}

// Add permission to role
export async function addPermissionToRole(
	role: string,
	resource: string,
	action: string,
): Promise<boolean> {
	const enforcer = await getEnforcer();
	return await enforcer.addPolicy(role, resource, action);
}

// Remove permission from role
export async function removePermissionFromRole(
	role: string,
	resource: string,
	action: string,
): Promise<boolean> {
	const enforcer = await getEnforcer();
	return await enforcer.removePolicy(role, resource, action);
}

// Assign role to user
export async function assignRoleToUser(
	userId: string,
	role: string,
): Promise<boolean> {
	const enforcer = await getEnforcer();
	return await enforcer.addGroupingPolicy(userId, role);
}

// Remove role from user
export async function removeRoleFromUser(
	userId: string,
	role: string,
): Promise<boolean> {
	const enforcer = await getEnforcer();
	return await enforcer.removeGroupingPolicy(userId, role);
}

// Get all roles for user
export async function getUserRoles(userId: string): Promise<string[]> {
	const enforcer = await getEnforcer();
	return await enforcer.getRolesForUser(userId);
}

// Get all permissions for role
export async function getRolePermissions(role: string): Promise<string[][]> {
	const enforcer = await getEnforcer();
	return await enforcer.getPermissionsForUser(role);
}
