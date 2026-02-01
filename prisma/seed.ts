import { PrismaClient } from "../src/db/index.ts";
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
                tempatLahir?: string;
                tanggalLahir?: Date;
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
        const accountId = `${user.id}_credential`;

        await prisma.account.upsert({
            where: {
                id: accountId,
            },
            update: {
                password: hashedPassword,
            },
            create: {
                id: accountId,
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
                tempatLahir: "Semarang",
                tanggalLahir: new Date("2002-05-15"),
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
    const srbType = await prisma.letterType.upsert({
        where: { id: "srb-type-id" }, // Using fixed ID for simplicity in seeding
        update: {},
        create: {
            id: "srb-type-id",
            name: "Surat Rekomendasi Beasiswa",
            description: "Surat rekomendasi untuk pengajuan beasiswa mahasiswa",
        },
    });
    console.log("Letter Type created.");

    // 6. Create SRB Template (Version 1)
    await prisma.letterTemplate.create({
        data: {
            letterTypeId: srbType.id,
            versionName: "v1-standard",
            templateEngine: "HANDLEBARS",
            schemaDefinition: {
                title: "Surat Rekomendasi Beasiswa",
                type: "object",
                properties: {
                    nama_lengkap: { type: "string", title: "Nama Lengkap" },
                    role: {
                        type: "string",
                        title: "Role",
                        default: "Mahasiswa",
                    },
                    nim: { type: "string", title: "NIM" },
                    email: { type: "string", title: "Email" },
                    departemen: { type: "string", title: "Departemen" },
                    prodi: { type: "string", title: "Program Studi" },
                    tempat_lahir: { type: "string", title: "Tempat Lahir" },
                    tanggal_lahir: {
                        type: "string",
                        format: "date",
                        title: "Tanggal Lahir",
                    },
                    no_hp: { type: "string", title: "Nomor HP" },
                    semester: { type: "integer", title: "Semester" },
                    ipk: { type: "number", title: "IPK" },
                    ips: { type: "number", title: "IPS (Semester Lalu)" },
                    nama_beasiswa: { type: "string", title: "Nama Beasiswa" },
                    lampiran: {
                        type: "object",
                        title: "Lampiran",
                        properties: {
                            ktm: {
                                type: "string",
                                format: "uri",
                                title: "KTM",
                            },
                            khs: {
                                type: "string",
                                format: "uri",
                                title: "KHS",
                            },
                        },
                    },
                },
                required: ["nama_lengkap", "nim", "semester", "nama_beasiswa"],
            },
            formFields: [
                { key: "nama_lengkap", label: "Nama Lengkap", readonly: true }, // Auto-filled
                { key: "nim", label: "NIM", readonly: true }, // Auto-filled
                { key: "email", label: "Email", readonly: true }, // Auto-filled
                { key: "departemen", label: "Departemen", readonly: true }, // Auto-filled
                { key: "prodi", label: "Program Studi", readonly: true }, // Auto-filled
                { key: "tempat_lahir", label: "Tempat Lahir", required: true },
                {
                    key: "tanggal_lahir",
                    label: "Tanggal Lahir",
                    type: "date",
                    required: true,
                },
                {
                    key: "no_hp",
                    label: "Nomor HP",
                    type: "tel",
                    required: true,
                },
                {
                    key: "semester",
                    label: "Semester",
                    type: "number",
                    required: true,
                },
                {
                    key: "ipk",
                    label: "IPK",
                    type: "number",
                    step: 0.01,
                    required: true,
                },
                {
                    key: "ips",
                    label: "IPS",
                    type: "number",
                    step: 0.01,
                    required: true,
                },
                {
                    key: "nama_beasiswa",
                    label: "Nama Beasiswa",
                    required: true,
                },
                {
                    key: "lampiran.ktm",
                    label: "KTM (Kartu Tanda Mahasiswa)",
                    type: "file",
                    accept: ".pdf,.jpg,.png",
                    required: true,
                },
                {
                    key: "lampiran.khs",
                    label: "KHS (Kartu Hasil Studi)",
                    type: "file",
                    accept: ".pdf,.jpg,.png",
                    required: true,
                },
            ],
        },
    });
    console.log("Letter Template (v1) created.");

    // 6.5. 🔴 TAMBAHAN: Create Document Template for Surat Rekomendasi Beasiswa
    const srbDocumentTemplate = await prisma.documentTemplate.create({
        data: {
            name: "Surat Rekomendasi Beasiswa",
            description:
                "Template Word untuk surat rekomendasi beasiswa dengan sistem variable substitution",
            templatePath:
                "surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-v1.docx",
            templateType: "HANDLEBARS",
            version: "v1",
            isActive: true,
            supportedFormats: ["DOCX", "PDF"],
            letterTypeId: srbType.id,
            schemaDefinition: {
                title: "Surat Rekomendasi Beasiswa Template Schema",
                type: "object",
                properties: {
                    kop_universitas: {
                        type: "string",
                        title: "Nama Universitas",
                        default:
                            "KEMENTERIAN PENDIDIKAN TINGGI, SAINS, DAN TEKNOLOGI\\nUNIVERSITAS DIPONEGORO",
                    },
                    kop_fakultas: {
                        type: "string",
                        title: "Nama Fakultas",
                        default: "FAKULTAS SAINS DAN MATEMATIKA",
                    },
                    nama_lengkap: { type: "string", title: "Nama Lengkap" },
                    nim: { type: "string", title: "NIM" },
                    tempat_lahir: { type: "string", title: "Tempat Lahir" },
                    tanggal_lahir: {
                        type: "string",
                        title: "Tanggal Lahir",
                        format: "date",
                    },
                    no_hp: { type: "string", title: "Nomor HP" },
                    tahun_akademik: {
                        type: "string",
                        title: "Tahun Akademik",
                        pattern: "^\\d{4}/\\d{4}$",
                    },
                    program_studi: { type: "string", title: "Program Studi" },
                    semester: { type: "string", title: "Semester" },
                    ipk: { type: "string", title: "IPK" },
                    ips: { type: "string", title: "IPS" },
                    keperluan: {
                        type: "string",
                        title: "Keperluan",
                        default: "Pengajuan Beasiswa",
                    },
                    nama_penandatangan: {
                        type: "string",
                        title: "Nama Penandatangan",
                    },
                    nip_penandatangan: {
                        type: "string",
                        title: "NIP Penandatangan",
                    },
                    nomor_surat: { type: "string", title: "Nomor Surat" },
                },
                required: [
                    "nama_lengkap",
                    "nim",
                    "tempat_lahir",
                    "tanggal_lahir",
                    "no_hp",
                    "tahun_akademik",
                    "program_studi",
                    "semester",
                    "ipk",
                    "ips",
                    "keperluan",
                    "nama_penandatangan",
                    "nip_penandatangan",
                ],
            },
        },
    });

    // 6.6. 🔴 TAMBAHAN: Create Template Variables
    const templateVariables = [
        {
            name: "nama_lengkap",
            type: "string",
            required: true,
            description: "Nama lengkap mahasiswa pemohon",
        },
        {
            name: "nim",
            type: "string",
            required: true,
            description: "Nomor Induk Mahasiswa",
        },
        {
            name: "tempat_lahir",
            type: "string",
            required: true,
            description: "Tempat lahir mahasiswa",
        },
        {
            name: "tanggal_lahir",
            type: "date",
            required: true,
            description: "Tanggal lahir mahasiswa",
        },
        {
            name: "no_hp",
            type: "string",
            required: true,
            description: "Nomor HP/telepon mahasiswa",
        },
        {
            name: "program_studi",
            type: "string",
            required: true,
            description: "Program studi mahasiswa",
        },
        {
            name: "semester",
            type: "string",
            required: true,
            description: "Semester saat ini",
        },
        {
            name: "ipk",
            type: "string",
            required: true,
            description: "Indeks Prestasi Kumulatif",
        },
        {
            name: "ips",
            type: "string",
            required: true,
            description: "Indeks Prestasi Semester",
        },
        {
            name: "keperluan",
            type: "string",
            required: true,
            description: "Keperluan pembuatan surat",
        },
        {
            name: "nama_penandatangan",
            type: "string",
            required: true,
            description: "Nama pejabat penandatangan",
        },
        {
            name: "nip_penandatangan",
            type: "string",
            required: true,
            description: "NIP pejabat penandatangan",
        },
        {
            name: "nomor_surat",
            type: "string",
            required: false,
            description: "Nomor surat resmi",
        },
        {
            name: "tahun_akademik",
            type: "string",
            required: false,
            description: "Tahun akademik",
        },
    ];

    for (const variable of templateVariables) {
        await prisma.templateVariable.create({
            data: {
                templateId: srbDocumentTemplate.id,
                variableName: variable.name,
                variableType: variable.type,
                isRequired: variable.required,
                description: variable.description,
            },
        });
    }

    console.log("Document Template and Variables created.");

    // 7. Seed Letter Config (Konfigurasi Dinamis)
    await prisma.letterConfig.upsert({
        where: { key: "WAKIL_DEKAN_1" },
        update: {},
        create: {
            key: "WAKIL_DEKAN_1",
            value: {
                name: "Prof. Dr. Ngadiwiyana, S.Si., M.Si.",
                nip: "196906201999031002",
                jabatan: "Wakil Dekan Akademik dan Kemahasiswaan",
            },
            version: 1,
            isActive: true,
        },
    });

    await prisma.letterConfig.upsert({
        where: { key: "SUPERVISOR" },
        update: {},
        create: {
            key: "SUPERVISOR",
            value: {
                name: "Dr. Supervisor Name",
                nip: "198001012005011001",
                jabatan: "Supervisor",
            },
            version: 1,
            isActive: true,
        },
    });

    await prisma.letterConfig.upsert({
        where: { key: "MANAJER" },
        update: {},
        create: {
            key: "MANAJER",
            value: {
                name: "Dr. Manajer Name",
                nip: "198002012005011002",
                jabatan: "Manajer",
            },
            version: 1,
            isActive: true,
        },
    });

    await prisma.letterConfig.upsert({
        where: { key: "UPA" },
        update: {},
        create: {
            key: "UPA",
            value: {
                name: "Staff UPA",
                nip: "198003012005011003",
                jabatan: "Staff Unit Pelayanan Akademik",
            },
            version: 1,
            isActive: true,
        },
    });

    await prisma.letterConfig.upsert({
        where: { key: "KOP_SURAT_FSM" },
        update: {},
        create: {
            key: "KOP_SURAT_FSM",
            value: {
                kementerian:
                    "KEMENTERIAN PENDIDIKAN TINGGI, SAINS, DAN TEKNOLOGI",
                universitas: "UNIVERSITAS DIPONEGORO",
                fakultas: "FAKULTAS SAINS DAN MATEMATIKA",
                alamat: "Jalan Prof. Jacub Rais",
                kampus: "Kampus Universitas Diponegoro",
                kota: "Tembalang, Semarang",
                kodePos: "50275",
                telp: "(024) 7474754",
                fax: "(024) 76480690",
                website: "www.fsm.undip.ac.id",
                email: "fsm(at)undip.ac.id",
            },
            version: 1,
            isActive: true,
        },
    });
    console.log("Letter Config seeded.");

    // 8. Seed Permissions
    const { seedPermissions } = await import("./seed-permissions.ts");
    await seedPermissions();

    console.log("Seeding finished.");
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error("SEEDING FAILED:");
        console.error(e);
        if (e instanceof Error) {
            console.error(e.stack);
        }
        await prisma.$disconnect();
        process.exit(1);
    });
