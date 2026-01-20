import { PrismaClient } from "../src/generated/prisma/client.js";
import { hashPassword } from "better-auth/crypto";

const prisma = new PrismaClient();

async function main() {
    console.log("Start seeding...");

    // 1. Clean up existing accounts with old password hashes
    console.log("Cleaning up old accounts...");
    await prisma.account.deleteMany(); // Delete all old accounts
    console.log("Old accounts cleaned.");

    // 2. Create Roles
    const roles = [
        { name: "MAHASISWA" },
        { name: "SUPERVISOR" },
        { name: "MANAJER_TU" },
        { name: "WAKIL_DEKAN_1" },
        { name: "UPA" },
    ];

    for (const role of roles) {
        await prisma.role.upsert({
            where: { name: role.name },
            update: {},
            create: role,
        });
    }
    console.log("Roles created.");

    // 3. Create Units (Departemen & Prodi)
    const departemenInformatika = await prisma.departemen.upsert({
        where: { code: "DEPT_INF" },
        update: {},
        create: {
            name: "Departemen Informatika",
            code: "DEPT_INF",
        },
    });

    const prodiInformatika = await prisma.programStudi.upsert({
        where: { code: "PRODI_INF" },
        update: {},
        create: {
            name: "S1 Informatika",
            code: "PRODI_INF",
            departemenId: departemenInformatika.id,
        },
    });
    console.log("Units created.");

    // 4. Create Users with Roles

    // Helper function to create/update user
    const upsertUser = async (
        email: string,
        name: string,
        roleName: string,
        password: string,
        details?: {
            mahasiswa?: {
                nim: string;
                semester: number;
                ipk: number;
                ips: number;
                tahunMasuk: string;
                noHp: string;
            };
            pegawai?: { nip: string; jabatan: string; noHp: string };
        },
    ) => {
        // Hash password using Better Auth's hashPassword function
        const hashedPassword = await hashPassword(password);

        const user = await prisma.user.upsert({
            where: { email },
            update: { name },
            create: {
                email,
                name,
                emailVerified: true,
            },
        });

        // Create Better Auth account with password
        await prisma.account.upsert({
            where: {
                userId_providerId: {
                    userId: user.id,
                    providerId: "credential", // Better Auth uses 'credential' for email/password
                },
            },
            update: {
                password: hashedPassword,
            },
            create: {
                id: `${user.id}_credential`, // Generate unique ID
                userId: user.id,
                providerId: "credential", // Better Auth uses 'credential' for email/password
                accountId: email,
                password: hashedPassword,
            },
        });

        // Assign Role
        const role = await prisma.role.findUnique({
            where: { name: roleName },
        });
        if (role) {
            await prisma.userRole.upsert({
                where: { userId_roleId: { userId: user.id, roleId: role.id } },
                update: {},
                create: { userId: user.id, roleId: role.id },
            });
        }

        // Role specific details
        if (roleName === "MAHASISWA" && details?.mahasiswa) {
            await prisma.mahasiswa.upsert({
                where: { userId: user.id },
                update: details.mahasiswa,
                create: {
                    userId: user.id,
                    ...details.mahasiswa,
                    departemenId: departemenInformatika.id,
                    programStudiId: prodiInformatika.id,
                },
            });
        } else if (details?.pegawai) {
            // For other roles, we treat them as Pegawai
            await prisma.pegawai.upsert({
                where: { userId: user.id },
                update: details.pegawai,
                create: {
                    userId: user.id,
                    ...details.pegawai,
                    departemenId: departemenInformatika.id,
                    programStudiId: prodiInformatika.id,
                },
            });
        }

        console.log(`  ✅ Created user: ${email} (password: ${password})`);
        return user;
    };

    // Mahasiswa
    await upsertUser(
        "mahasiswa@students.undip.ac.id",
        "Budi Mahasiswa",
        "MAHASISWA",
        "password123",
        {
            mahasiswa: {
                nim: "24060120120001",
                semester: 6,
                ipk: 3.75,
                ips: 3.8,
                tahunMasuk: "2020",
                noHp: "081234567890",
            },
        },
    );

    // Supervisor
    await upsertUser(
        "spv@staff.undip.ac.id",
        "Dr. Supervisor",
        "SUPERVISOR",
        "password123",
        {
            pegawai: {
                nip: "198001012005011001",
                jabatan: "Dosen Wali",
                noHp: "089876543210",
            },
        },
    );

    // Manajer TU
    await upsertUser(
        "tu@staff.undip.ac.id",
        "Budi TU",
        "MANAJER_TU",
        "password123",
        {
            pegawai: {
                nip: "197505052000031002",
                jabatan: "Manajer Tata Usaha",
                noHp: "081122334455",
            },
        },
    );

    // Wakil Dekan 1
    await upsertUser(
        "wd1@lecturer.undip.ac.id",
        "Prof. Wakil Dekan 1",
        "WAKIL_DEKAN_1",
        "password123",
        {
            pegawai: {
                nip: "196501011990021001",
                jabatan: "Wakil Dekan Akademik",
                noHp: "081211223344",
            },
        },
    );

    // UPA
    await upsertUser(
        "upa@staff.undip.ac.id",
        "Staff UPA",
        "UPA",
        "password123",
        {
            pegawai: {
                nip: "199009092015041003",
                jabatan: "Staff Akademik",
                noHp: "085566778899",
            },
        },
    );

    console.log("Users created.");

    // 5. Create Letter Type (Letter Definition)
    await prisma.letterType.upsert({
        where: { id: "srb-type-id" }, // Using fixed ID for simplicity in seeding
        update: {},
        create: {
            id: "srb-type-id",
            name: "Surat Rekomendasi Beasiswa",
            description: "Surat rekomendasi untuk pengajuan beasiswa mahasiswa",
        },
    });
    console.log("Letter Type created.");

    // 6. Seed Permissions
    const { seedPermissions } = await import("./seed-permissions.js");
    await seedPermissions();

    console.log("Seeding finished.");
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
