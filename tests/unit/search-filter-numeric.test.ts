import dotenv from "dotenv";
dotenv.config();

import { Prisma } from "../../src/db/index.js";
import { ApplicationService } from "../../src/modules/surat-rekomendasi-beasiswa/services/application.service.js";

describe("DUPL-05-11: Pengujian Pencarian Surat saat mencari riwayat pengajuan dengan Kata Kunci Pencarian berupa angka (misal: NIM atau tahun pengajuan)", () => {
  let createdInstances: string[] = [];

  afterEach(async () => {
    // Bersihkan semua letterInstance yang dibuat selama pengujian
    if (createdInstances.length > 0) {
      await Prisma.letterInstance.deleteMany({
        where: {
          id: { in: createdInstances },
        },
      });
      createdInstances = [];
    }
  });

  test("Sistem memperbarui tampilan tabel dan menyajikan data surat yang diajukan pada tahun tersebut secara tepat", async () => {
    // 1. Ambil data pendukung (LetterType dan User) dari database
    const letterType = await Prisma.letterType.findFirst();
    const studentUser = await Prisma.user.findFirst({
      where: { email: "mahasiswa@students.undip.ac.id" },
    });

    if (!letterType || !studentUser) {
      throw new Error("Prasyarat Gagal: LetterType atau User tidak ditemukan di database.");
    }

    // 2. Buat data uji (seeding data dummy khusus untuk test case ini)
    // Satu surat dengan tahun 2026 di namanya
    const app2026 = await Prisma.letterInstance.create({
      data: {
        scholarshipName: "Beasiswa PPA 2026",
        values: {
          namaBeasiswa: "Beasiswa PPA 2026",
          namaLengkap: studentUser.name,
        },
        status: "PENDING",
        currentStep: 1,
        letterTypeId: letterType.id,
        createdById: studentUser.id,
        schema: {},
      },
    });
    createdInstances.push(app2026.id);

    // Satu surat dengan tahun 2025 (tidak boleh cocok dengan pencarian '2026')
    const app2025 = await Prisma.letterInstance.create({
      data: {
        scholarshipName: "Beasiswa PPA 2025",
        values: {
          namaBeasiswa: "Beasiswa PPA 2025",
          namaLengkap: studentUser.name,
        },
        status: "PENDING",
        currentStep: 1,
        letterTypeId: letterType.id,
        createdById: studentUser.id,
        schema: {},
      },
    });
    createdInstances.push(app2025.id);

    // 3. Masukan: Kata Kunci Angka Tahun '2026'
    const searchKeyword = "2026";

    // 4. Prosedur: Jalankan fungsi listApplications dengan filter kata kunci pencarian
    const searchResult = await ApplicationService.listApplications({
      letterTypeId: letterType.id,
      search: searchKeyword,
      page: 1,
      limit: 10,
    });

    // 5. Evaluasi Hasil:
    // Pastikan hasil pencarian terdefinisi dan merupakan array
    expect(searchResult).toBeDefined();
    expect(Array.isArray(searchResult.items)).toBe(true);

    // Pastikan data surat tahun 2026 yang baru saja kita buat berhasil ditemukan
    const foundCreatedApp = searchResult.items.find((item: any) => item.id === app2026.id);
    expect(foundCreatedApp).toBeDefined();

    // Pastikan data surat tahun 2025 TIDAK ditemukan dalam hasil pencarian '2026'
    const foundApp2025 = searchResult.items.find((item: any) => item.id === app2025.id);
    expect(foundApp2025).toBeUndefined();

    // Cek secara ketat apakah SETIAP item yang dikembalikan memuat angka tahun pencarian '2026'
    const allItemsMatch = searchResult.items.every((item: any) => {
      const scholarshipMatch = item.scholarshipName?.toLowerCase().includes(searchKeyword.toLowerCase());
      const nameMatch = item.createdBy?.name?.toLowerCase().includes(searchKeyword.toLowerCase());
      const nimMatch = item.createdBy?.mahasiswa?.nim?.toLowerCase().includes(searchKeyword.toLowerCase());
      const valuesScholarshipMatch = item.values?.namaBeasiswa?.toLowerCase().includes(searchKeyword.toLowerCase());
      const valuesNameMatch = item.values?.namaLengkap?.toLowerCase().includes(searchKeyword.toLowerCase());

      return scholarshipMatch || nameMatch || nimMatch || valuesScholarshipMatch || valuesNameMatch;
    });

    expect(allItemsMatch).toBe(true);
  });
});
