import { Prisma } from "../src/db/index.ts";

/**
 * Seed Permissions for All Roles
 * This script creates comprehensive permissions for the 5 roles in the E-Office SRB system
 */

interface PermissionDef {
    resource: string;
    action: string;
    description: string;
}

interface RolePermissions {
    roleName: string;
    permissions: PermissionDef[];
}

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
];

export async function seedPermissions() {
    console.log("🌱 Starting permissions seeding...");

    for (const rolePermDef of rolePermissions) {
        console.log(`\n📋 Processing role: ${rolePermDef.roleName}`);

        // Find or create role
        const role = await Prisma.role.findUnique({
            where: { name: rolePermDef.roleName },
        });

        if (!role) {
            console.log(
                `  ⚠️  Role ${rolePermDef.roleName} not found, skipping...`,
            );
            continue;
        }

        // Create permissions and assign to role
        for (const permDef of rolePermDef.permissions) {
            // Create or find permission
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

            // Assign permission to role
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

            console.log(
                `  ✅ ${permDef.resource}:${permDef.action} - ${permDef.description}`,
            );
        }
    }

    console.log("\n✨ Permissions seeding completed!");
}

// Run if executed directly
if (import.meta.main) {
    seedPermissions()
        .then(() => {
            console.log("Done!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("Error seeding permissions:", error);
            process.exit(1);
        });
}
