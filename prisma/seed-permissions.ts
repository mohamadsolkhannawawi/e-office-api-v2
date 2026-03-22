import { Prisma } from "../src/db/index.ts";

/**
 * Seed Permissions for All Roles
 * Script untuk membuat comprehensive permissions untuk semua role di sistem E-Office SRB
 *
 * Fungsi Utama:
 * - Mendefinisikan permission matrix untuk setiap role
 * - Membuat permission entries di database jika belum ada
 * - Mengasosiasikan permissions dengan roles
 * - Mencakup: MAHASISWA, SUPERVISOR, MANAJER_TU, WAKIL_DEKAN_1, UPA, SUPER_ADMIN
 */

// [INTERFACE] Mendefinisikan struktur permission individu
// resource: nama resource yang diakses (letter, user, profile, dll)
// action: aksi yang dapat dilakukan (create, read, update, delete, dll)
// description: penjelasan permission untuk dokumentasi

interface PermissionDef {
  resource: string;
  action: string;
  description: string;
}

// [INTERFACE] Struktur mapping permissions untuk satu role
// roleName: nama role unik dalam sistem
// permissions: array dari permission yang dimiliki role

interface RolePermissions {
  roleName: string;
  permissions: PermissionDef[];
}

// [PERMISSIONS MATRIX] Data lengkap permission untuk setiap role di sistem
// Setiap role memiliki set permissions yang berbeda sesuai fungsi dan tanggung jawabnya
const rolePermissions: RolePermissions[] = [
  {
    roleName: "MAHASISWA",
    permissions: [
      {
        resource: "letter",
        action: "create",
        description: "Submit SRB application",
      },
      {
        resource: "letter",
        action: "read:own",
        description: "View own applications",
      },
      {
        resource: "letter",
        action: "update:own",
        description: "Revise own applications (when in revision state)",
      },
      {
        resource: "letter",
        action: "download:own",
        description: "Download completed letters",
      },
      {
        resource: "notification",
        action: "read:own",
        description: "Read own notifications",
      },
      {
        resource: "profile",
        action: "read:own",
        description: "View own profile",
      },
      {
        resource: "profile",
        action: "update:own",
        description: "Update own profile",
      },
    ],
  },
  {
    roleName: "SUPERVISOR",
    permissions: [
      {
        resource: "letter",
        action: "read:pending_supervisor",
        description: "View applications pending supervisor review",
      },
      {
        resource: "letter",
        action: "approve:supervisor",
        description: "Approve applications",
      },
      {
        resource: "letter",
        action: "reject:supervisor",
        description: "Reject applications",
      },
      {
        resource: "letter",
        action: "revise:supervisor",
        description: "Request revision from mahasiswa",
      },
      {
        resource: "notification",
        action: "read:own",
        description: "Read own notifications",
      },
      {
        resource: "profile",
        action: "read:own",
        description: "View own profile",
      },
      {
        resource: "profile",
        action: "update:own",
        description: "Update own profile",
      },
    ],
  },
  {
    roleName: "MANAJER_TU",
    permissions: [
      {
        resource: "letter",
        action: "read:pending_tu",
        description: "View applications pending TU review",
      },
      {
        resource: "letter",
        action: "approve:tu",
        description: "Approve applications",
      },
      {
        resource: "letter",
        action: "reject:tu",
        description: "Reject applications",
      },
      {
        resource: "letter",
        action: "revise:tu",
        description: "Request revision (to mahasiswa or supervisor)",
      },
      {
        resource: "notification",
        action: "read:own",
        description: "Read own notifications",
      },
      {
        resource: "profile",
        action: "read:own",
        description: "View own profile",
      },
      {
        resource: "profile",
        action: "update:own",
        description: "Update own profile",
      },
    ],
  },
  {
    roleName: "WAKIL_DEKAN_1",
    permissions: [
      {
        resource: "letter",
        action: "read:pending_wd1",
        description: "View applications pending WD1 review",
      },
      {
        resource: "letter",
        action: "approve:wd1",
        description: "Approve and sign applications",
      },
      {
        resource: "letter",
        action: "reject:wd1",
        description: "Reject applications",
      },
      {
        resource: "letter",
        action: "revise:wd1",
        description: "Request revision (to any previous role)",
      },
      {
        resource: "signature",
        action: "manage",
        description: "Manage signature templates",
      },
      {
        resource: "signature",
        action: "create",
        description: "Create new signature",
      },
      {
        resource: "signature",
        action: "read:own",
        description: "View own signatures",
      },
      {
        resource: "signature",
        action: "delete:own",
        description: "Delete own signatures",
      },
      {
        resource: "notification",
        action: "read:own",
        description: "Read own notifications",
      },
      {
        resource: "profile",
        action: "read:own",
        description: "View own profile",
      },
      {
        resource: "profile",
        action: "update:own",
        description: "Update own profile",
      },
    ],
  },
  {
    roleName: "UPA",
    permissions: [
      {
        resource: "letter",
        action: "read:pending_upa",
        description: "View applications pending UPA processing",
      },
      {
        resource: "letter",
        action: "publish",
        description: "Publish letters with numbering and stamp",
      },
      {
        resource: "letter",
        action: "update:number",
        description: "Update letter number manually",
      },
      {
        resource: "letter",
        action: "archive",
        description: "Manage letter archives",
      },
      {
        resource: "letter",
        action: "read:archive",
        description: "View archived letters",
      },
      {
        resource: "stamp",
        action: "manage",
        description: "Manage stamp templates",
      },
      {
        resource: "stamp",
        action: "create",
        description: "Create new stamp template",
      },
      {
        resource: "stamp",
        action: "read:own",
        description: "View own stamps",
      },
      {
        resource: "stamp",
        action: "delete",
        description: "Delete own stamp templates",
      },
      {
        resource: "stamp",
        action: "apply",
        description: "Apply stamp to letters",
      },
      {
        resource: "notification",
        action: "read:own",
        description: "Read own notifications",
      },
      {
        resource: "profile",
        action: "read:own",
        description: "View own profile",
      },
      {
        resource: "profile",
        action: "update:own",
        description: "Update own profile",
      },
    ],
  },
  {
    roleName: "SUPER_ADMIN",
    permissions: [
      // User Management
      {
        resource: "user",
        action: "create",
        description: "Create new users",
      },
      {
        resource: "user",
        action: "read:all",
        description: "View all users across system",
      },
      {
        resource: "user",
        action: "update:all",
        description: "Update any user profile",
      },
      {
        resource: "user",
        action: "delete",
        description: "Delete users",
      },
      {
        resource: "user",
        action: "toggle:status",
        description: "Activate/deactivate user accounts",
      },
      // Role Management
      {
        resource: "role",
        action: "read:all",
        description: "View all roles and permissions",
      },
      {
        resource: "role",
        action: "assign",
        description: "Assign roles to users",
      },
      {
        resource: "role",
        action: "revoke",
        description: "Remove roles from users",
      },
      // Password Management
      {
        resource: "password",
        action: "reset",
        description: "Reset user passwords",
      },
      // Master Data Management
      {
        resource: "department",
        action: "manage",
        description: "Full CRUD for departments",
      },
      {
        resource: "prodi",
        action: "manage",
        description: "Full CRUD for program studi",
      },
      // System Monitoring
      {
        resource: "system",
        action: "audit",
        description: "View system audit logs",
      },
      {
        resource: "system",
        action: "config",
        description: "Manage system configuration",
      },
      {
        resource: "system",
        action: "stats",
        description: "View system statistics",
      },
      // Document Management
      {
        resource: "document",
        action: "cleanup",
        description: "Clean up old/orphaned documents",
      },
      // Letter Management (full access + workflow override)
      {
        resource: "letter",
        action: "read:all",
        description: "View all letters across system",
      },
      {
        resource: "letter",
        action: "read:archive",
        description: "View archived letters",
      },
      {
        resource: "letter",
        action: "approve:supervisor",
        description: "Act as Supervisor Akademik – approve letter",
      },
      {
        resource: "letter",
        action: "reject:supervisor",
        description: "Act as Supervisor Akademik – reject letter",
      },
      {
        resource: "letter",
        action: "revise:supervisor",
        description: "Act as Supervisor Akademik – request revision",
      },
      {
        resource: "letter",
        action: "approve:tu",
        description: "Act as Manajer TU – approve letter",
      },
      {
        resource: "letter",
        action: "reject:tu",
        description: "Act as Manajer TU – reject letter",
      },
      {
        resource: "letter",
        action: "revise:tu",
        description: "Act as Manajer TU – request revision",
      },
      {
        resource: "letter",
        action: "approve:wd1",
        description: "Act as Wakil Dekan 1 – approve and sign letter",
      },
      {
        resource: "letter",
        action: "reject:wd1",
        description: "Act as Wakil Dekan 1 – reject letter",
      },
      {
        resource: "letter",
        action: "revise:wd1",
        description: "Act as Wakil Dekan 1 – request revision",
      },
      {
        resource: "letter",
        action: "publish",
        description: "Act as UPA – publish letter with number and stamp",
      },
      {
        resource: "letter",
        action: "override",
        description: "Override any workflow step as Super Admin",
      },
      // Notification
      {
        resource: "notification",
        action: "read:own",
        description: "Read own notifications",
      },
      // Profile
      {
        resource: "profile",
        action: "read:own",
        description: "View own profile",
      },
      {
        resource: "profile",
        action: "update:own",
        description: "Update own profile",
      },
    ],
  },
];

export async function seedPermissions() {
  // [START] Mulai proses seeding permissions
  console.log("[INFO] Starting permissions seeding...");

  // [LOOP] Iterasi setiap role dan permissions-nya
  for (const rolePermDef of rolePermissions) {
    console.log(`\n[PROCESSING] Role: ${rolePermDef.roleName}`);

    // [FIND ROLE] Cari role di database berdasarkan nama
    const role = await Prisma.role.findUnique({
      where: { name: rolePermDef.roleName },
    });

    // [CHECK ROLE] Jika role tidak ditemukan, lewati
    if (!role) {
      console.log(
        `[WARNING] Role ${rolePermDef.roleName} not found, skipping...`,
      );
      continue;
    }

    // [ASSIGN PERMISSIONS] Loop untuk setiap permission yang akan diassign ke role
    for (const permDef of rolePermDef.permissions) {
      // [UPSERT PERMISSION] Buat permission baru atau gunakan yang sudah ada
      // Menggunakan unique composite key: (resource, action)
      const permission = await Prisma.permission.upsert({
        where: {
          resource_action: {
            resource: permDef.resource,
            action: permDef.action,
          },
        },
        update: {},
        create: {
          resource: permDef.resource,
          action: permDef.action,
        },
      });

      // [ASSIGN TO ROLE] Buat relasi antara role dan permission
      // Menggunakan unique composite key: (roleId, permissionId) untuk menghindari duplikat
      await Prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });

      // [LOG SUCCESS] Tampilkan permission yang berhasil diassign
      console.log(
        `[SUCCESS] ${permDef.resource}:${permDef.action} - ${permDef.description}`,
      );
    }
  }

  // [COMPLETE] Seeding selesai
  console.log("\n[INFO] Permissions seeding completed!");
}

// [EXECUTE] Jalankan seed jika file dijalankan langsung (bukan import)
if (import.meta.main) {
  seedPermissions()
    .then(() => {
      console.log("[SUCCESS] Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("[ERROR] Error seeding permissions:", error);
      process.exit(1);
    });
}
