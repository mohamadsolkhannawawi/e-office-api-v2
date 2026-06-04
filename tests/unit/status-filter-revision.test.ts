import dotenv from "dotenv";
dotenv.config();

import { Prisma } from "../../src/db/index.js";
import { ApplicationService } from "../../src/modules/surat-rekomendasi-beasiswa/services/application.service.js";

describe("DUPL-05-19: Pengujian Penyaringan (Filter) Surat saat memilih dropdown status dengan Status Surat 'Revisi' (data tersedia)", () => {
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

  test("Sistem menyaring daftar surat dan hanya menampilkan baris pengajuan yang sedang dalam tahap perbaikan oleh mahasiswa (Revisi)", async () => {
    // 1. Ambil data pendukung dari database
    const letterType = await Prisma.letterType.findFirst();
    const studentUser = await Prisma.user.findFirst({
      where: { email: "mahasiswa@students.undip.ac.id" },
    });

    if (!letterType || !studentUser) {
      throw new Error("Prasyarat Gagal: LetterType atau User tidak ditemukan di database.");
    }

    // 2. Buat data uji (seeding data dummy)
    // Satu surat dengan status REVISION (Revisi)
    const appRevision = await Prisma.letterInstance.create({
      data: {
        scholarshipName: "Beasiswa PPA 2026 - Perlu Revisi",
        values: {
          namaBeasiswa: "Beasiswa PPA 2026",
          namaLengkap: studentUser.name,
        },
        status: "REVISION", // Sesuai status 'Revisi'
        currentStep: 1,
        letterTypeId: letterType.id,
        createdById: studentUser.id,
        schema: {},
      },
    });
    createdInstances.push(appRevision.id);

    // Satu surat dengan status PENDING (Tidak boleh ikut tersaring)
    const appPending = await Prisma.letterInstance.create({
      data: {
        scholarshipName: "Beasiswa PPA 2026 - Normal",
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
    createdInstances.push(appPending.id);

    // 3. Masukan: Pilih status 'REVISION'
    const targetStatus = "REVISION";

    // 4. Prosedur: Jalankan fungsi listApplications dengan filter status
    const filterResult = await ApplicationService.listApplications({
      letterTypeId: letterType.id,
      status: targetStatus,
      page: 1,
      limit: 10,
    });

    // 5. Evaluasi Hasil:
    // Pastikan hasil penyaringan terdefinisi dan berbentuk array
    expect(filterResult).toBeDefined();
    expect(Array.isArray(filterResult.items)).toBe(true);

    // Surat dengan status REVISION harus ditemukan
    const foundRevisionApp = filterResult.items.find((item: any) => item.id === appRevision.id);
    expect(foundRevisionApp).toBeDefined();

    // Surat dengan status PENDING tidak boleh muncul dalam hasil filter REVISION
    const foundPendingApp = filterResult.items.find((item: any) => item.id === appPending.id);
    expect(foundPendingApp).toBeUndefined();

    // Pastikan seluruh data surat yang dikembalikan hanya memiliki status REVISION
    const allItemsAreRevision = filterResult.items.every((item: any) => item.status === "REVISION");
    expect(allItemsAreRevision).toBe(true);
  });
});
