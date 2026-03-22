import "dotenv/config";
import { PrismaClient } from "../src/db/index.ts";
import { hashPassword } from "better-auth/crypto";

const prisma = new PrismaClient();

/**
 * Main Seed Function - Inisialisasi Database
 * Script untuk seed data awal ke database E-Office SRB
 *
 * Fungsi Utama:
 * - Membersihkan data lama (cleanup)
 * - Membuat roles (MAHASISWA, SUPERVISOR, MANAJER_TU, WAKIL_DEKAN_1, UPA, SUPER_ADMIN)
 * - Membuat struktur organisasi (departemen dan program studi)
 * - Membuat users untuk setiap role
 * - Membuat letter types dan templates
 * - Membuat letter instances (50 contoh surat untuk testing)
 * - Seed permissions untuk setiap role
 */

async function main() {
  // [START] Mulai proses seeding database
  console.log("[INFO] Start seeding...");

  // [CLEANUP] Bersihkan akun lama dengan password hash yang sudah usang
  console.log("[Processing] Cleaning up old accounts...");
  await prisma.account.deleteMany(); // Delete all old accounts
  console.log("[Done] Old accounts cleaned.");

  // [CREATE ROLES] Buat semua role dalam sistem
  const roles = [
    { name: "MAHASISWA" },
    { name: "SUPERVISOR" },
    { name: "MANAJER_TU" },
    { name: "WAKIL_DEKAN_1" },
    { name: "UPA" },
    { name: "SUPER_ADMIN" },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }
  console.log("[Done] Roles created.");

  // [UNITS] Buat struktur organisasi (departemen dan program studi)

  // --- Matematika ---
  const departemenMatematika = await prisma.departemen.upsert({
    where: { code: "DEPT_MAT" },
    update: { name: "Departemen Matematika" },
    create: { name: "Departemen Matematika", code: "DEPT_MAT" },
  });
  const prodiS1Mat = await prisma.programStudi.upsert({
    where: { code: "PRODI_S1_MAT" },
    update: {
      name: "S1 Matematika",
      departemenId: departemenMatematika.id,
    },
    create: {
      name: "S1 Matematika",
      code: "PRODI_S1_MAT",
      departemenId: departemenMatematika.id,
    },
  });
  const prodiS2Mat = await prisma.programStudi.upsert({
    where: { code: "PRODI_S2_MAT" },
    update: {
      name: "S2 Matematika",
      departemenId: departemenMatematika.id,
    },
    create: {
      name: "S2 Matematika",
      code: "PRODI_S2_MAT",
      departemenId: departemenMatematika.id,
    },
  });

  // --- Biologi ---
  const departemenBiologi = await prisma.departemen.upsert({
    where: { code: "DEPT_BIO" },
    update: { name: "Departemen Biologi" },
    create: { name: "Departemen Biologi", code: "DEPT_BIO" },
  });
  const prodiS1Bio = await prisma.programStudi.upsert({
    where: { code: "PRODI_S1_BIO" },
    update: { name: "S1 Biologi", departemenId: departemenBiologi.id },
    create: {
      name: "S1 Biologi",
      code: "PRODI_S1_BIO",
      departemenId: departemenBiologi.id,
    },
  });
  const prodiS1Btk = await prisma.programStudi.upsert({
    where: { code: "PRODI_S1_BTK" },
    update: { name: "S1 Bioteknologi", departemenId: departemenBiologi.id },
    create: {
      name: "S1 Bioteknologi",
      code: "PRODI_S1_BTK",
      departemenId: departemenBiologi.id,
    },
  });

  // --- Fisika ---
  const departemenFisika = await prisma.departemen.upsert({
    where: { code: "DEPT_FIS" },
    update: { name: "Departemen Fisika" },
    create: { name: "Departemen Fisika", code: "DEPT_FIS" },
  });
  const prodiS1Fis = await prisma.programStudi.upsert({
    where: { code: "PRODI_S1_FIS" },
    update: { name: "S1 Fisika", departemenId: departemenFisika.id },
    create: {
      name: "S1 Fisika",
      code: "PRODI_S1_FIS",
      departemenId: departemenFisika.id,
    },
  });
  const prodiS2Fis = await prisma.programStudi.upsert({
    where: { code: "PRODI_S2_FIS" },
    update: { name: "S2 Fisika", departemenId: departemenFisika.id },
    create: {
      name: "S2 Fisika",
      code: "PRODI_S2_FIS",
      departemenId: departemenFisika.id,
    },
  });

  // --- Kimia ---
  const departemenKimia = await prisma.departemen.upsert({
    where: { code: "DEPT_KIM" },
    update: { name: "Departemen Kimia" },
    create: { name: "Departemen Kimia", code: "DEPT_KIM" },
  });
  const prodiS1Kim = await prisma.programStudi.upsert({
    where: { code: "PRODI_S1_KIM" },
    update: { name: "S1 Kimia", departemenId: departemenKimia.id },
    create: {
      name: "S1 Kimia",
      code: "PRODI_S1_KIM",
      departemenId: departemenKimia.id,
    },
  });
  const prodiS2Kim = await prisma.programStudi.upsert({
    where: { code: "PRODI_S2_KIM" },
    update: { name: "S2 Kimia", departemenId: departemenKimia.id },
    create: {
      name: "S2 Kimia",
      code: "PRODI_S2_KIM",
      departemenId: departemenKimia.id,
    },
  });

  // --- Informatika ---
  const departemenInformatika = await prisma.departemen.upsert({
    where: { code: "DEPT_INF" },
    update: { name: "Departemen Informatika" },
    create: { name: "Departemen Informatika", code: "DEPT_INF" },
  });
  const prodiInformatika = await prisma.programStudi.upsert({
    where: { code: "PRODI_INF" },
    update: {
      name: "S1 Informatika",
      departemenId: departemenInformatika.id,
    },
    create: {
      name: "S1 Informatika",
      code: "PRODI_INF",
      departemenId: departemenInformatika.id,
    },
  });
  const prodiS2Si = await prisma.programStudi.upsert({
    where: { code: "PRODI_S2_SI" },
    update: {
      name: "S2 Sistem Informasi",
      departemenId: departemenInformatika.id,
    },
    create: {
      name: "S2 Sistem Informasi",
      code: "PRODI_S2_SI",
      departemenId: departemenInformatika.id,
    },
  });

  // --- Statistika ---
  const departemenStatistika = await prisma.departemen.upsert({
    where: { code: "DEPT_STA" },
    update: { name: "Departemen Statistika" },
    create: { name: "Departemen Statistika", code: "DEPT_STA" },
  });
  const prodiS1Sta = await prisma.programStudi.upsert({
    where: { code: "PRODI_S1_STA" },
    update: {
      name: "S1 Statistika",
      departemenId: departemenStatistika.id,
    },
    create: {
      name: "S1 Statistika",
      code: "PRODI_S1_STA",
      departemenId: departemenStatistika.id,
    },
  });

  console.log("[Done] Departemen & Program Studi created.");

  // [USERS] Buat users dengan role dan detail spesifik
  console.log("[Processing] Creating users...");
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
        departemenId?: string;
        programStudiId?: string;
      };
      pegawai?: { nip: string; jabatan: string; noHp: string };
    },
  ) => {
    // [HASH PASSWORD] Hash password menggunakan Better Auth
    const hashedPassword = await hashPassword(password);

    // [CREATE/UPDATE USER] Buat atau update user
    const user = await prisma.user.upsert({
      where: { email },
      update: { name },
      create: {
        email,
        name,
        emailVerified: true,
      },
    });

    // [CREATE ACCOUNT] Buat Better Auth account dengan password hash
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

    // [ASSIGN ROLE] Assign role ke user
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

    // [ROLE DETAILS] Buat detail spesifik untuk role tertentu
    if (roleName === "MAHASISWA" && details?.mahasiswa) {
      const {
        departemenId: deptId,
        programStudiId: prodiId,
        ...mahasiswaFields
      } = details.mahasiswa;
      await prisma.mahasiswa.upsert({
        where: { userId: user.id },
        update: mahasiswaFields,
        create: {
          userId: user.id,
          ...mahasiswaFields,
          departemenId: deptId ?? departemenInformatika.id,
          programStudiId: prodiId ?? prodiInformatika.id,
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

    // [LOG] Tampilkan user yang sudah dibuat
    console.log(`[SUCCESS] Created user: ${email} (password: ${password})`);
    return user;
  };

  // Mahasiswa
  const mahasiswaBudi = await upsertUser(
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

  // Mahasiswa - Solkhan
  await upsertUser(
    "solkhan@students.undip.ac.id",
    "Solkhan",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24060120120002",
        semester: 4,
        ipk: 3.5,
        ips: 3.6,
        tahunMasuk: "2021",
        noHp: "081234567891",
        tempatLahir: "Jakarta",
        tanggalLahir: new Date("2003-03-20"),
      },
    },
  );

  // Mahasiswa - Setta
  await upsertUser(
    "setta@students.undip.ac.id",
    "Setta",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24060120120003",
        semester: 5,
        ipk: 3.65,
        ips: 3.75,
        tahunMasuk: "2021",
        noHp: "081234567892",
        tempatLahir: "Bandung",
        tanggalLahir: new Date("2003-07-10"),
      },
    },
  );

  // ── Mahasiswa tambahan per Program Studi ─────────────────────────────────
  console.log("[Processing] Seeding mahasiswa per program studi...");

  // S1 Matematika
  await upsertUser(
    "andi.mat@students.undip.ac.id",
    "Andi Prasetyo",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24020123000001",
        semester: 4,
        ipk: 3.6,
        ips: 3.65,
        tahunMasuk: "2023",
        noHp: "081300000001",
        tempatLahir: "Semarang",
        tanggalLahir: new Date("2003-01-10"),
        departemenId: departemenMatematika.id,
        programStudiId: prodiS1Mat.id,
      },
    },
  );
  await upsertUser(
    "dewi.mat@students.undip.ac.id",
    "Dewi Kartika",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24020123000002",
        semester: 4,
        ipk: 3.45,
        ips: 3.5,
        tahunMasuk: "2023",
        noHp: "081300000002",
        tempatLahir: "Yogyakarta",
        tanggalLahir: new Date("2003-04-22"),
        departemenId: departemenMatematika.id,
        programStudiId: prodiS1Mat.id,
      },
    },
  );

  // S2 Matematika
  await upsertUser(
    "rudi.mat2@students.undip.ac.id",
    "Rudi Hartono",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24020223000001",
        semester: 2,
        ipk: 3.75,
        ips: 3.8,
        tahunMasuk: "2023",
        noHp: "081300000003",
        tempatLahir: "Surabaya",
        tanggalLahir: new Date("1999-07-15"),
        departemenId: departemenMatematika.id,
        programStudiId: prodiS2Mat.id,
      },
    },
  );
  await upsertUser(
    "sari.mat2@students.undip.ac.id",
    "Sari Wulandari",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24020223000002",
        semester: 2,
        ipk: 3.85,
        ips: 3.9,
        tahunMasuk: "2023",
        noHp: "081300000004",
        tempatLahir: "Bandung",
        tanggalLahir: new Date("1999-09-05"),
        departemenId: departemenMatematika.id,
        programStudiId: prodiS2Mat.id,
      },
    },
  );

  // S1 Biologi
  await upsertUser(
    "ahmad.bio@students.undip.ac.id",
    "Ahmad Fauzi",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24040123000001",
        semester: 4,
        ipk: 3.55,
        ips: 3.6,
        tahunMasuk: "2023",
        noHp: "081300000005",
        tempatLahir: "Malang",
        tanggalLahir: new Date("2003-02-18"),
        departemenId: departemenBiologi.id,
        programStudiId: prodiS1Bio.id,
      },
    },
  );
  await upsertUser(
    "rina.bio@students.undip.ac.id",
    "Rina Kusuma",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24040123000002",
        semester: 4,
        ipk: 3.7,
        ips: 3.75,
        tahunMasuk: "2023",
        noHp: "081300000006",
        tempatLahir: "Solo",
        tanggalLahir: new Date("2003-06-30"),
        departemenId: departemenBiologi.id,
        programStudiId: prodiS1Bio.id,
      },
    },
  );

  // S1 Bioteknologi
  await upsertUser(
    "ferdi.btk@students.undip.ac.id",
    "Ferdi Santoso",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24040323000001",
        semester: 4,
        ipk: 3.5,
        ips: 3.55,
        tahunMasuk: "2023",
        noHp: "081300000007",
        tempatLahir: "Jakarta",
        tanggalLahir: new Date("2003-03-12"),
        departemenId: departemenBiologi.id,
        programStudiId: prodiS1Btk.id,
      },
    },
  );
  await upsertUser(
    "maya.btk@students.undip.ac.id",
    "Maya Putri",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24040323000002",
        semester: 4,
        ipk: 3.65,
        ips: 3.7,
        tahunMasuk: "2023",
        noHp: "081300000008",
        tempatLahir: "Depok",
        tanggalLahir: new Date("2003-08-25"),
        departemenId: departemenBiologi.id,
        programStudiId: prodiS1Btk.id,
      },
    },
  );

  // S1 Fisika
  await upsertUser(
    "bagas.fis@students.undip.ac.id",
    "Bagas Nugroho",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24060523000001",
        semester: 4,
        ipk: 3.4,
        ips: 3.45,
        tahunMasuk: "2023",
        noHp: "081300000009",
        tempatLahir: "Purwokerto",
        tanggalLahir: new Date("2003-05-07"),
        departemenId: departemenFisika.id,
        programStudiId: prodiS1Fis.id,
      },
    },
  );
  await upsertUser(
    "indah.fis@students.undip.ac.id",
    "Indah Lestari",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24060523000002",
        semester: 4,
        ipk: 3.78,
        ips: 3.82,
        tahunMasuk: "2023",
        noHp: "081300000010",
        tempatLahir: "Magelang",
        tanggalLahir: new Date("2003-11-14"),
        departemenId: departemenFisika.id,
        programStudiId: prodiS1Fis.id,
      },
    },
  );

  // S2 Fisika
  await upsertUser(
    "yogi.fis2@students.undip.ac.id",
    "Yogi Prasetya",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24060623000001",
        semester: 2,
        ipk: 3.8,
        ips: 3.85,
        tahunMasuk: "2023",
        noHp: "081300000011",
        tempatLahir: "Kudus",
        tanggalLahir: new Date("1999-12-01"),
        departemenId: departemenFisika.id,
        programStudiId: prodiS2Fis.id,
      },
    },
  );
  await upsertUser(
    "tari.fis2@students.undip.ac.id",
    "Tari Susanti",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24060623000002",
        semester: 2,
        ipk: 3.7,
        ips: 3.75,
        tahunMasuk: "2023",
        noHp: "081300000012",
        tempatLahir: "Pati",
        tanggalLahir: new Date("2000-03-19"),
        departemenId: departemenFisika.id,
        programStudiId: prodiS2Fis.id,
      },
    },
  );

  // S1 Kimia
  await upsertUser(
    "nanda.kim@students.undip.ac.id",
    "Nanda Pratama",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24080123000001",
        semester: 4,
        ipk: 3.55,
        ips: 3.6,
        tahunMasuk: "2023",
        noHp: "081300000013",
        tempatLahir: "Demak",
        tanggalLahir: new Date("2003-07-21"),
        departemenId: departemenKimia.id,
        programStudiId: prodiS1Kim.id,
      },
    },
  );
  await upsertUser(
    "putri.kim@students.undip.ac.id",
    "Putri Rahayu",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24080123000002",
        semester: 4,
        ipk: 3.72,
        ips: 3.77,
        tahunMasuk: "2023",
        noHp: "081300000014",
        tempatLahir: "Kendal",
        tanggalLahir: new Date("2003-09-09"),
        departemenId: departemenKimia.id,
        programStudiId: prodiS1Kim.id,
      },
    },
  );

  // S2 Kimia
  await upsertUser(
    "hendra.kim2@students.undip.ac.id",
    "Hendra Wijaya",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24080223000001",
        semester: 2,
        ipk: 3.88,
        ips: 3.9,
        tahunMasuk: "2023",
        noHp: "081300000015",
        tempatLahir: "Batang",
        tanggalLahir: new Date("1999-04-03"),
        departemenId: departemenKimia.id,
        programStudiId: prodiS2Kim.id,
      },
    },
  );
  await upsertUser(
    "lina.kim2@students.undip.ac.id",
    "Lina Aprilia",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24080223000002",
        semester: 2,
        ipk: 3.76,
        ips: 3.8,
        tahunMasuk: "2023",
        noHp: "081300000016",
        tempatLahir: "Pemalang",
        tanggalLahir: new Date("2000-01-28"),
        departemenId: departemenKimia.id,
        programStudiId: prodiS2Kim.id,
      },
    },
  );

  // S1 Informatika (tambahan)
  await upsertUser(
    "rizal.inf@students.undip.ac.id",
    "Rizal Firmansyah",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24100123000001",
        semester: 4,
        ipk: 3.68,
        ips: 3.72,
        tahunMasuk: "2023",
        noHp: "081300000017",
        tempatLahir: "Semarang",
        tanggalLahir: new Date("2003-10-16"),
        departemenId: departemenInformatika.id,
        programStudiId: prodiInformatika.id,
      },
    },
  );
  await upsertUser(
    "nurul.inf@students.undip.ac.id",
    "Nurul Hidayah",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24100123000002",
        semester: 4,
        ipk: 3.82,
        ips: 3.85,
        tahunMasuk: "2023",
        noHp: "081300000018",
        tempatLahir: "Ungaran",
        tanggalLahir: new Date("2003-12-05"),
        departemenId: departemenInformatika.id,
        programStudiId: prodiInformatika.id,
      },
    },
  );

  // S2 Sistem Informasi
  await upsertUser(
    "gilang.si2@students.undip.ac.id",
    "Gilang Ramadhan",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24100223000001",
        semester: 2,
        ipk: 3.78,
        ips: 3.82,
        tahunMasuk: "2023",
        noHp: "081300000019",
        tempatLahir: "Salatiga",
        tanggalLahir: new Date("1999-06-11"),
        departemenId: departemenInformatika.id,
        programStudiId: prodiS2Si.id,
      },
    },
  );
  await upsertUser(
    "fitri.si2@students.undip.ac.id",
    "Fitriani",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24100223000002",
        semester: 2,
        ipk: 3.9,
        ips: 3.92,
        tahunMasuk: "2023",
        noHp: "081300000020",
        tempatLahir: "Ambarawa",
        tanggalLahir: new Date("2000-08-17"),
        departemenId: departemenInformatika.id,
        programStudiId: prodiS2Si.id,
      },
    },
  );

  // S1 Statistika
  await upsertUser(
    "dimas.sta@students.undip.ac.id",
    "Dimas Arif",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24120123000001",
        semester: 4,
        ipk: 3.58,
        ips: 3.62,
        tahunMasuk: "2023",
        noHp: "081300000021",
        tempatLahir: "Blora",
        tanggalLahir: new Date("2003-02-27"),
        departemenId: departemenStatistika.id,
        programStudiId: prodiS1Sta.id,
      },
    },
  );
  await upsertUser(
    "vera.sta@students.undip.ac.id",
    "Vera Anggraini",
    "MAHASISWA",
    "password123",
    {
      mahasiswa: {
        nim: "24120123000002",
        semester: 4,
        ipk: 3.74,
        ips: 3.78,
        tahunMasuk: "2023",
        noHp: "081300000022",
        tempatLahir: "Rembang",
        tanggalLahir: new Date("2003-05-14"),
        departemenId: departemenStatistika.id,
        programStudiId: prodiS1Sta.id,
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
  await upsertUser("upa@staff.undip.ac.id", "Staff UPA", "UPA", "password123", {
    pegawai: {
      nip: "199009092015041003",
      jabatan: "Staff Akademik",
      noHp: "085566778899",
    },
  });

  // Super Admin
  await upsertUser(
    "admin@undip.ac.id",
    "Super Admin",
    "SUPER_ADMIN",
    "admin123",
    {
      pegawai: {
        nip: "198505052010011004",
        jabatan: "Administrator Sistem",
        noHp: "081299887766",
      },
    },
  );

  console.log("[Done] Users created.");

  // [LETTER TYPE] Buat tipe surat (Surat Rekomendasi Beasiswa)
  console.log("[Processing] Creating letter type...");
  const srbType = await prisma.letterType.upsert({
    where: { id: "srb-type-id" }, // Using fixed ID for simplicity in seeding
    update: {},
    create: {
      id: "srb-type-id",
      name: "Surat Rekomendasi Beasiswa",
      description: "Surat rekomendasi untuk pengajuan beasiswa mahasiswa",
    },
  });
  console.log("[Done] Letter Type created.");

  // [LETTER TEMPLATE] Buat template untuk surat rekomendasi beasiswa
  console.log("[Processing] Creating letter template...");
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
          jenisBeasiswa: {
            type: "string",
            title: "Jenis Beasiswa",
            enum: ["internal", "eksternal", "akademik"],
          },
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
        required: [
          "nama_lengkap",
          "nim",
          "semester",
          "nama_beasiswa",
          "jenisBeasiswa",
        ],
      },
      formFields: [
        { key: "nama_lengkap", label: "Nama Lengkap", readonly: true }, // Auto-filled
        { key: "nim", label: "NIM", readonly: true }, // Auto-filled
        { key: "email", label: "Email", readonly: true }, // Auto-filled
        { key: "departemen", label: "Departemen", readonly: true }, // Auto-filled
        { key: "prodi", label: "Program Studi", readonly: true }, // Auto-filled
        {
          key: "jenisBeasiswa",
          label: "Jenis Beasiswa",
          readonly: true,
        }, // Auto-filled
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
  console.log("[Done] Letter Template created.");

  // [DOCUMENT TEMPLATE] Buat document template untuk surat rekomendasi
  console.log("[Processing] Creating document template...");
  const srbDocumentTemplate = await prisma.documentTemplate.upsert({
    where: {
      name_version: {
        name: "Surat Rekomendasi Beasiswa",
        version: "v1",
      },
    },
    update: {},
    create: {
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

  // [TEMPLATE VARIABLES] Buat daftar variable yang akan digunakan dalam template
  console.log("[Processing] Creating template variables...");
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
    await prisma.templateVariable.upsert({
      where: {
        templateId_variableName: {
          templateId: srbDocumentTemplate.id,
          variableName: variable.name,
        },
      },
      update: {},
      create: {
        templateId: srbDocumentTemplate.id,
        variableName: variable.name,
        variableType: variable.type,
        isRequired: variable.required,
        description: variable.description,
      },
    });
  }

  console.log("[Done] Document Template and Variables created.");

  // [LETTER CONFIG] Buat konfigurasi dinamis untuk letter
  console.log("[Processing] Creating letter config...");
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
        kementerian: "KEMENTERIAN PENDIDIKAN TINGGI, SAINS, DAN TEKNOLOGI",
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
  console.log("[Done] Letter Config created.");

  // [LETTER INSTANCES] Seed 50 contoh surat rekomendasi beasiswa
  console.log("[Processing] Seeding 50 letter instances...");

  const scholarships = [
    // KATEGORI 1: BEASISWA INTERNAL UNDIP (15)
    { name: "Beasiswa Internal UNDIP", category: "internal" },
    {
      name: "Beasiswa PPA (Peningkatan Prestasi Akademik)",
      category: "internal",
    },
    {
      name: "Beasiswa Bantuan Belajar Mahasiswa (BBM)",
      category: "internal",
    },
    { name: "Beasiswa UKT (Khusus Pandemi/Krisis)", category: "internal" },
    { name: "Beasiswa IKA UNDIP", category: "internal" },
    { name: "Beasiswa Stimulan Prestasi", category: "internal" },
    { name: "Beasiswa Hafidz Al-Qur'an UNDIP", category: "internal" },
    { name: "Beasiswa Atlet/Seni UNDIP", category: "internal" },
    {
      name: "Beasiswa BAZNAS Kota Semarang/Jawa Tengah",
      category: "internal",
    },
    { name: "Beasiswa Kader Surau (YBM PLN)", category: "internal" },
    { name: "Beasiswa Kerja Paruh Waktu Kampus", category: "internal" },
    { name: "Beasiswa Akselerator Inovasi UNDIP", category: "internal" },
    {
      name: "Beasiswa Penghargaan Berprestasi UNDIP",
      category: "internal",
    },
    { name: "Beasiswa Afirmasi Pendidikan UNDIP", category: "internal" },
    { name: "Beasiswa Dhuafa UNDIP", category: "internal" },

    // KATEGORI 2: BEASISWA EKSTERNAL - KORPORAT (25)
    { name: "Beasiswa Djarum Plus", category: "eksternal" },
    { name: "Beasiswa Bank Indonesia (BI)", category: "eksternal" },
    { name: "Beasiswa KSE (Karya Salemba Empat)", category: "eksternal" },
    { name: "Beasiswa BCA Finance", category: "eksternal" },
    { name: "Beasiswa Tanoto Foundation", category: "eksternal" },
    { name: "Beasiswa CIMB Niaga", category: "eksternal" },
    { name: "Beasiswa BRI (BRILiaN Scholarship)", category: "eksternal" },
    { name: "Beasiswa Bakti BCA", category: "eksternal" },
    { name: "Beasiswa Adaro Foundation", category: "eksternal" },
    {
      name: "Beasiswa Pertamina Foundation (Sobat Bumi)",
      category: "eksternal",
    },
    { name: "Beasiswa Telkomsel", category: "eksternal" },
    { name: "Beasiswa Unilever", category: "eksternal" },
    { name: "Beasiswa Paragon (Wardah/Emina)", category: "eksternal" },
    { name: "Beasiswa Bayan Resources", category: "eksternal" },
    { name: "Beasiswa Indofood (BIP)", category: "eksternal" },
    { name: "Beasiswa XL Future Leaders", category: "eksternal" },
    { name: "Beasiswa Goodwill International", category: "eksternal" },
    { name: "Beasiswa Sampoerna Foundation", category: "eksternal" },
    {
      name: "Beasiswa SMART (Sinar Mas Agribusiness)",
      category: "eksternal",
    },
    { name: "Beasiswa Medco Foundation", category: "eksternal" },
    { name: "Beasiswa Wika Foundation", category: "eksternal" },
    { name: "Beasiswa Pemberdayaan Indonesia (PI)", category: "eksternal" },
    { name: "Beasiswa Yayasan Karya Dharma", category: "eksternal" },
    { name: "Beasiswa Stiebel Mitra Indonesia", category: "eksternal" },
    { name: "Beasiswa Perusahaan Tambang Nasional", category: "eksternal" },

    // KATEGORI 3: BEASISWA AKADEMIK & PEMERINTAH (15)
    { name: "KIP Kuliah (Kemendikbudristek)", category: "akademik" },
    { name: "Beasiswa Unggulan (Kemendikbudristek)", category: "akademik" },
    { name: "Beasiswa LPDP (Targeted)", category: "akademik" },
    { name: "Beasiswa Jabar Future Leaders (JFLS)", category: "akademik" },
    { name: "Beasiswa Jateng Muda (Pemprov Jateng)", category: "akademik" },
    {
      name: "Beasiswa OSC (Online Scholarship Competition)",
      category: "akademik",
    },
    { name: "Beasiswa MEXT (Jepang)", category: "akademik" },
    {
      name: "Beasiswa GKS (Global Korea Scholarship)",
      category: "akademik",
    },
    {
      name: "Beasiswa IISMA (Indonesian International Student)",
      category: "akademik",
    },
    { name: "Beasiswa Fulbright (AMINEF)", category: "akademik" },
    { name: "Beasiswa Erasmus+ (Eropa)", category: "akademik" },
    { name: "Beasiswa DAAD (Jerman)", category: "akademik" },
    { name: "Beasiswa Australia Awards (AAS)", category: "akademik" },
    {
      name: "Beasiswa Taiwan Experience Education (TEEP)",
      category: "akademik",
    },
    { name: "Beasiswa Riset BRIN", category: "akademik" },
  ];

  // Ambil user mahasiswa Budi untuk createdBy
  const mahasiswaBudiUser = await prisma.user.findUnique({
    where: { email: "mahasiswa@students.undip.ac.id" },
  });

  if (!mahasiswaBudiUser) {
    throw new Error(
      "Mahasiswa Budi user not found. Make sure user is created before seeding letters.",
    );
  }

  // Ambil semua data yang diperlukan untuk form mahasiswa Budi
  const mahasiswaBudiData = await prisma.mahasiswa.findUnique({
    where: { userId: mahasiswaBudiUser.id },
    include: {
      user: true,
      departemen: true,
      programStudi: true,
    },
  });

  if (!mahasiswaBudiData) {
    throw new Error(
      "Mahasiswa Budi data not found. Make sure mahasiswa profile is created.",
    );
  }

  // Seed 50 letter instances dengan 50 beasiswa pertama dari list
  for (let i = 0; i < 50; i++) {
    const scholarship = scholarships[i]!;

    // Buat schema values untuk form yang sudah diisi
    const formValues = {
      nama_lengkap: mahasiswaBudiData.user.name,
      nim: mahasiswaBudiData.nim,
      email: mahasiswaBudiData.user.email,
      departemen:
        mahasiswaBudiData.departemen?.name || "Departemen Informatika",
      prodi: mahasiswaBudiData.programStudi?.name || "S1 Informatika",
      tempat_lahir: mahasiswaBudiData.tempatLahir || "Semarang",
      tanggal_lahir:
        mahasiswaBudiData.tanggalLahir?.toISOString().split("T")[0] ||
        "2002-05-15",
      no_hp: mahasiswaBudiData.noHp,
      semester: mahasiswaBudiData.semester || 6,
      ipk: mahasiswaBudiData.ipk || 3.75,
      ips: mahasiswaBudiData.ips || 3.8,
      nama_beasiswa: scholarship.name,
      jenisBeasiswa: scholarship.category,
      lampiran: {
        ktm: null,
        khs: null,
      },
    };

    // Buat schema definition berdasarkan yang sudah ada
    const schemaDefinition = {
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
        jenisBeasiswa: {
          type: "string",
          title: "Jenis Beasiswa",
          enum: ["internal", "eksternal", "akademik"],
        },
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
      required: [
        "nama_lengkap",
        "nim",
        "semester",
        "nama_beasiswa",
        "jenisBeasiswa",
      ],
    };

    await prisma.letterInstance.create({
      data: {
        schema: schemaDefinition,
        values: formValues,
        status: "DRAFT",
        scholarshipName: scholarship.name,
        letterTypeId: srbType.id,
        createdById: mahasiswaBudiUser.id,
        currentStep: 1,
      },
    });
  }

  console.log(
    "[SUCCESS] 50 Letter Instances seeded successfully for Budi Mahasiswa",
  );

  // [PERMISSIONS] Seed permissions untuk setiap role
  console.log("[Processing] Seeding permissions...");
  const { seedPermissions } = await import("./seed-permissions.ts");
  await seedPermissions();

  console.log("[Done] Seeding finished.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("[ERROR] SEEDING FAILED:");
    console.error(e);
    if (e instanceof Error) {
      console.error(e.stack);
    }
    await prisma.$disconnect();
    process.exit(1);
  });
