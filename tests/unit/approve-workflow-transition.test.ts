import dotenv from "dotenv";
dotenv.config();

import { Prisma } from "../../src/db/index.js";
import { ApplicationController } from "../../src/modules/surat-rekomendasi-beasiswa/controllers/application.controller.js";

describe("DUPL-07-02: Pengujian perubahan status saat Verifikator klik 'Setujui', memastikan surat diteruskan ke role selanjutnya (contoh: MTU ke WD1)", () => {
  let createdInstances: string[] = [];
  let originalAutoGen: any;

  beforeAll(() => {
    // Mock autoGenerateTemplate agar tidak berjalan secara background & memicu error ESM di runtime Jest
    originalAutoGen = ApplicationController.autoGenerateTemplate;
    ApplicationController.autoGenerateTemplate = async () => {};
  });

  afterAll(() => {
    // Kembalikan ke fungsi asli setelah semua pengujian selesai
    ApplicationController.autoGenerateTemplate = originalAutoGen;
  });

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

  test("MTU menyetujui pengajuan, memastikan step naik ke 3 (WD1) dan currentRoleId berubah menjadi ID role WD1", async () => {
    // 1. Ambil data pendukung dari database
    const letterType = await Prisma.letterType.findFirst();
    const studentUser = await Prisma.user.findFirst({
      where: { email: "mahasiswa@students.undip.ac.id" },
    });

    // Cari User dengan role MANAJER_TU (MTU)
    const mtuUserRole = await Prisma.userRole.findFirst({
      where: { role: { name: "MANAJER_TU" } },
      include: { user: true, role: true },
    });

    // Cari Role WAKIL_DEKAN_1 (WD1)
    const wd1Role = await Prisma.role.findFirst({
      where: { name: "WAKIL_DEKAN_1" },
    });

    if (!letterType || !studentUser || !mtuUserRole || !wd1Role) {
      throw new Error("Prasyarat Gagal: Data pendukung (LetterType, Student, MTU, or WD1 role) tidak ditemukan di database.");
    }

    // 2. Buat data uji (surat di Step 2 - MANAJER_TU dengan status IN_PROGRESS)
    const app = await Prisma.letterInstance.create({
      data: {
        scholarshipName: "Beasiswa Unggulan 2026",
        values: {
          namaBeasiswa: "Beasiswa Unggulan 2026",
          namaLengkap: studentUser.name,
        },
        status: "IN_PROGRESS",
        currentStep: 2, // Step 2 = MANAJER_TU
        currentRoleId: mtuUserRole.roleId,
        letterTypeId: letterType.id,
        createdById: studentUser.id,
        schema: {},
      },
    });
    createdInstances.push(app.id);

    // 3. Prosedur: Panggil verifyApplication dengan tindakan 'approve' bertindak sebagai user MANAJER_TU
    const setMock: any = {};
    const result = await ApplicationController.verifyApplication({
      params: { applicationId: app.id },
      body: {
        action: "approve",
        notes: "Dokumen telah diverifikasi dan disetujui oleh Manajer TU.",
      },
      set: setMock,
      user: {
        id: mtuUserRole.userId,
        roleId: mtuUserRole.roleId,
        roles: ["MANAJER_TU"],
      },
    });

    // Cek respons controller
    expect(result).toBeDefined();
    expect(result.success).toBe(true);

    // 4. Evaluasi Hasil di Database:
    const updatedApp = await Prisma.letterInstance.findUnique({
      where: { id: app.id },
    });

    expect(updatedApp).toBeDefined();
    expect(updatedApp?.status).toBe("IN_PROGRESS");
    expect(updatedApp?.currentStep).toBe(3); // Harus naik dari step 2 ke step 3 (WD1)
    expect(updatedApp?.currentRoleId).toBe(wd1Role.id); // Harus ditugaskan ke role WAKIL_DEKAN_1
  });
});
