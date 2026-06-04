import dotenv from "dotenv";
dotenv.config();

import { Prisma } from "../../src/db/index.js";
import { ApplicationService } from "../../src/modules/surat-rekomendasi-beasiswa/services/application.service.js";

describe("DUPL-05-27: Pengujian Penyaringan (Filter) Surat saat mengisi rentang tanggal dengan input 'Dari' dan 'Sampai' pada rentang waktu yang tidak memiliki data surat (tampilan kosong)", () => {
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

  test("Sistem menyaring daftar surat berdasarkan rentang tanggal kosong dan mengembalikan daftar kosong", async () => {
    // 1. Ambil data pendukung dari database
    const letterType = await Prisma.letterType.findFirst();
    const studentUser = await Prisma.user.findFirst({
      where: { email: "mahasiswa@students.undip.ac.id" },
    });

    if (!letterType || !studentUser) {
      throw new Error("Prasyarat Gagal: LetterType atau User tidak ditemukan di database.");
    }

    // 2. Buat data uji (seeding data dummy dengan tanggal pembuatan saat ini)
    const app = await Prisma.letterInstance.create({
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
    createdInstances.push(app.id);

    // 3. Masukan: Tentukan rentang tanggal di masa lalu (tahun 2020) di mana data uji tidak ada
    const startDate = "2020-01-01T00:00:00.000Z";
    const endDate = "2020-12-31T23:59:59.999Z";

    // 4. Prosedur: Panggil listApplications dengan filter rentang tanggal kosong tersebut
    const filterResult = await ApplicationService.listApplications({
      letterTypeId: letterType.id,
      startDate: startDate,
      endDate: endDate,
      page: 1,
      limit: 10,
    });

    // 5. Evaluasi Hasil:
    // Hasil filter harus didefinisikan
    expect(filterResult).toBeDefined();
    // Jumlah item yang dikembalikan harus kosong (0) karena tidak ada surat pada tahun 2020
    expect(filterResult.items.length).toBe(0);
    expect(filterResult.total).toBe(0);
  });
});
