/**
 * Casbin Authorization Engine - RBAC (Role-Based Access Control) System
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * File ini mengimplementasikan Casbin enforcer dengan Prisma adapter untuk permission checking.
 * Casbin adalah library authorization yang support berbagai RBAC, ABAC, dan access control models.
 *
 * Model Permission:
 * - rbac: Role-based access control
 * - Resource: Object (surat, dokumen, setting, dll)
 * - Action: Operation (read, create, update, delete, approve, sign, publish)
 *
 * Flow:
 * 1. getEnforcer() - Initialize Casbin enforcer dengan model.conf
 * 2. syncPoliciesFromDatabase() - Load policies dari Prisma database ke Casbin
 * 3. Check permission atau modify roles/permissions
 *
 * Policies Structure:
 * - Policies: role + resource + action (contoh: MAHASISWA, letter, read)
 * - Grouping: user + role (contoh: user123 → MAHASISWA)
 *
 * Available Functions:
 * - checkPermission(userId, resource, action) - Check apakah user punya permission
 * - addPermissionToRole(role, resource, action) - Add permission ke role
 * - removePermissionFromRole(role, resource, action) - Remove permission dari role
 * - assignRoleToUser(userId, role) - Assign role ke user
 * - removeRoleFromUser(userId, role) - Remove role dari user
 * - getUserRoles(userId) - Get semua roles untuk user
 * - getRolePermissions(role) - Get semua permissions untuk role
 */

// [IMPORTS] Import Casbin, Prisma, dan utilities
import { newEnforcer, type Enforcer } from "casbin";
import { Prisma } from "@backend/db/index.ts";
import path from "node:path";

// [SINGLETON] Global Casbin enforcer instance
// Null check untuk lazy initialization
let enforcer: Enforcer | null = null;

/**
 * [FUNCTION] getEnforcer - Get Casbin enforcer instance (dengan lazy initialization)
 *
 * Lazy initialization untuk Casbin enforcer:
 * 1. Load model.conf dari casbin folder
 * 2. Create enforcer instance
 * 3. Sync policies dari Prisma database
 * 4. Cache instance untuk reuse
 *
 * @returns Promise<Enforcer> - Initialized Casbin enforcer instance
 */
export async function getEnforcer(): Promise<Enforcer> {
  // [CHECK INSTANCE] Cek apakah enforcer sudah diinit sebelumnya
  if (!enforcer) {
    // [LOAD MODEL] Ambil path ke model.conf
    const modelPath = path.join(process.cwd(), "casbin", "model.conf");

    // [INIT ENFORCER] Create Casbin enforcer baru
    enforcer = await newEnforcer(modelPath);

    // [SYNC POLICIES] Load policies dari database ke Casbin
    await syncPoliciesFromDatabase(enforcer);
  }

  return enforcer;
}

/**
 * [FUNCTION] syncPoliciesFromDatabase - Sync policies dari Prisma ke Casbin
 *
 * Load semua policies dan role assignments dari database dan add ke Casbin enforcer.
 * Ini dipanggil saat initialization dan setelah ada perubahan permissions.
 *
 * Process:
 * 1. Fetch semua rolePermissions dari database
 * 2. Add setiap permission sebagai policy (role, resource, action)
 * 3. Fetch semua userRoles dari database
 * 4. Add setiap user-role mapping sebagai grouping policy
 *
 * @param enforcer - Casbin enforcer instance
 */
async function syncPoliciesFromDatabase(enforcer: Enforcer) {
  // [FETCH ROLE PERMISSIONS] Ambil semua permission assignments dari database
  // Include relation ke role dan permission untuk full data
  const rolePermissions = await Prisma.rolePermission.findMany({
    include: {
      role: true,
      permission: true,
    },
  });

  // [ADD POLICIES] Add setiap permission sebagai policy ke Casbin
  // Policy format: (role, resource, action) = (MAHASISWA, letter, read)
  for (const rp of rolePermissions) {
    const roleName = rp.role.name;
    const resource = rp.permission.resource;
    const action = rp.permission.action;

    await enforcer.addPolicy(roleName, resource, action);
  }

  // [FETCH USER ROLES] Ambil semua user-role assignments dari database
  // Include relation ke user dan role
  const userRoles = await Prisma.userRole.findMany({
    include: {
      user: true,
      role: true,
    },
  });

  // [ADD GROUPING] Add setiap user-role mapping sebagai grouping policy
  // GroupingPolicy format: (user, role) = (user123, MAHASISWA)
  for (const ur of userRoles) {
    await enforcer.addGroupingPolicy(ur.userId, ur.role.name);
  }

  console.log("[SUCCESS] Casbin Policies synced from database to enforcer");
}

/**
 * [FUNCTION] checkPermission - Check apakah user memiliki permission untuk resource dan action
 *
 * Validate permission menggunakan Casbin enforcer dengan RBAC model.
 * User harus memiliki role yang memiliki permission untuk resource+action.
 *
 * Contoh:
 * - checkPermission(userId, "letter", "read") - Cek bisa baca surat?
 * - checkPermission(userId, "letter", "approve") - Cek bisa approve surat?
 *
 * @param userId - User ID (uuidv4)
 * @param resource - Resource name (letter, dokumen, setting, dll)
 * @param action - Action name (read, create, update, delete, approve, sign, publish)
 * @returns Promise<boolean> - true jika user punya permission, false jika tidak
 */
export async function checkPermission(
  userId: string,
  resource: string,
  action: string,
): Promise<boolean> {
  // [GET ENFORCER] Ambil enforcer instance
  const enforcer = await getEnforcer();
  // [ENFORCE] Check permission menggunakan Casbin
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

/**
 * [FUNCTION] removePermissionFromRole - Remove permission dari role tertentu
 *
 * Remove policy dari role: mencegah role untuk melakukan action ke resource.
 * Perubahan ini hanya di Casbin, untuk persist ke database gunakan API lain.
 *
 * Contoh:
 * - removePermissionFromRole("SUPERVISOR", "letter", "approve")
 *
 * @param role - Role name
 * @param resource - Resource name
 * @param action - Action name
 * @returns Promise<boolean> - true jika berhasil remove, false jika tidak ada
 */
export async function removePermissionFromRole(
  role: string,
  resource: string,
  action: string,
): Promise<boolean> {
  // [GET ENFORCER] Ambil enforcer instance
  const enforcer = await getEnforcer();
  // [REMOVE POLICY] Remove policy dari role
  return await enforcer.removePolicy(role, resource, action);
}

/**
 * [FUNCTION] assignRoleToUser - Assign role ke user tertentu
 *
 * Add grouping policy: user sekarang memiliki semua permissions dari role tersebut.
 * Perubahan ini hanya di Casbin, untuk persist ke database gunakan API lain.
 *
 * Contoh:
 * - assignRoleToUser(userId, "SUPERVISOR")
 *
 * @param userId - User ID (uuidv4)
 * @param role - Role name
 * @returns Promise<boolean> - true jika berhasil assign, false jika sudah ada
 */
export async function assignRoleToUser(
  userId: string,
  role: string,
): Promise<boolean> {
  // [GET ENFORCER] Ambil enforcer instance
  const enforcer = await getEnforcer();
  // [ADD GROUPING] Add grouping policy (user -> role)
  return await enforcer.addGroupingPolicy(userId, role);
}

/**
 * [FUNCTION] removeRoleFromUser - Remove role dari user tertentu
 *
 * Remove grouping policy: user tidak lagi memiliki permissions dari role tersebut.
 * Perubahan ini hanya di Casbin, untuk persist ke database gunakan API lain.
 *
 * Contoh:
 * - removeRoleFromUser(userId, "SUPERVISOR")
 *
 * @param userId - User ID (uuidv4)
 * @param role - Role name
 * @returns Promise<boolean> - true jika berhasil remove, false jika tidak ada
 */
export async function removeRoleFromUser(
  userId: string,
  role: string,
): Promise<boolean> {
  // [GET ENFORCER] Ambil enforcer instance
  const enforcer = await getEnforcer();
  // [REMOVE GROUPING] Remove grouping policy (user -x role)
  return await enforcer.removeGroupingPolicy(userId, role);
}

/**
 * [FUNCTION] getUserRoles - Get semua roles yang dimiliki user tertentu
 *
 * Query Casbin untuk semua roles yang di-assign ke user.
 * Contoh return: ["MAHASISWA", "SUPERVISOR"]
 *
 * Contoh:
 * - getRoles(userId) returns ["MAHASISWA"]
 *
 * @param userId - User ID (uuidv4)
 * @returns Promise<string[]> - Array dari role names
 */
export async function getUserRoles(userId: string): Promise<string[]> {
  // [GET ENFORCER] Ambil enforcer instance
  const enforcer = await getEnforcer();
  // [GET ROLES] Query Casbin untuk roles
  return await enforcer.getRolesForUser(userId);
}

/**
 * [FUNCTION] getRolePermissions - Get semua permissions untuk role tertentu
 *
 * Query Casbin untuk semua permissions (resource+action) yang dimiliki role.
 * Contoh return: [["letter", "read"], ["letter", "update"], ["letter", "delete"]]
 *
 * Contoh:
 * - getRolePermissions("MAHASISWA") returns [["letter", "read"], ["letter", "create"]]
 *
 * @param role - Role name
 * @returns Promise<string[][]> - Array of [resource, action] pairs
 */
export async function getRolePermissions(role: string): Promise<string[][]> {
  // [GET ENFORCER] Ambil enforcer instance
  const enforcer = await getEnforcer();
  // [GET PERMISSIONS] Query Casbin untuk permissions
  return await enforcer.getPermissionsForUser(role);
}
