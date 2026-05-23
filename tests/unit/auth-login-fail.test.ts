import dotenv from "dotenv";
dotenv.config();

import { Prisma } from "../../src/db/index.js";
import { auth } from "../../src/lib/auth.js";

describe("DUPL-01-02: Login Manual dengan Email Benar dan Password Salah", () => {
  test("Harus gagal login dan memunculkan error validasi / kredensial salah", async () => {
    // 1. Ambil data langsung dari database untuk memverifikasi user tersebut ada
    const userFromDb = await Prisma.user.findUnique({
      where: { email: "mahasiswa@students.undip.ac.id" },
    });

    if (!userFromDb) {
      const errorMsg = "Prasyarat Gagal: User 'mahasiswa@students.undip.ac.id' tidak ditemukan di database.";
      console.error(`[TEST ERROR] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // 2. Jalankan fungsi signInEmail dengan password salah
    let loginError: any = null;
    let loginResponse: any = null;
    try {
      loginResponse = await auth.api.signInEmail({
        body: {
          email: "mahasiswa@students.undip.ac.id",
          password: "password1234", // Password salah
        },
      });
    } catch (error: any) {
      loginError = error;
    }

    // 3. Evaluasi Hasil: Jika login malah berhasil atau tidak menimbulkan error validasi
    if (!loginError || !loginError.message || !loginError.message.toLowerCase().includes("invalid")) {
      const successToken = loginResponse?.token || "N/A";
      const errorMsg = `Pengujian Login Salah Gagal: Pengguna diperbolehkan masuk meskipun password salah! Token Sesi: ${successToken}`;
      console.error(`[TEST ERROR] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // Asersi standar jika login gagal (sesuai harapan)
    expect(loginError.message.toLowerCase()).toContain("invalid");
  });
});
