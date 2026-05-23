import dotenv from "dotenv";
dotenv.config();

import { Prisma } from "../../src/db/index.js";
import { auth } from "../../src/lib/auth.js";

describe("DUPL-01-01: Login Manual dengan Email dan Password Benar", () => {
  test("Harus berhasil login dan mengembalikan session serta data user yang sesuai", async () => {
    // 1. Ambil data langsung dari database untuk memverifikasi user tersebut ada
    const userFromDb = await Prisma.user.findUnique({
      where: { email: "mahasiswa@students.undip.ac.id" },
    });

    if (!userFromDb) {
      const errorMsg = "Prasyarat Gagal: User 'mahasiswa@students.undip.ac.id' tidak ditemukan di database.";
      console.error(`[TEST ERROR] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // 2. Jalankan fungsi signInEmail yang dimiliki oleh Better Auth
    let response: any = null;
    let errorOccurred: any = null;
    try {
      response = await auth.api.signInEmail({
        body: {
          email: "mahasiswa@students.undip.ac.id",
          password: "password123",
        },
      });
    } catch (err: any) {
      errorOccurred = err;
    }

    // 3. Evaluasi Hasil: Jika terjadi kesalahan saat kredensial benar
    if (errorOccurred || !response || !response.user || !response.token) {
      const errorDetail = errorOccurred?.message || "Respons tidak lengkap (Missing user or token)";
      const errorMsg = `Pengujian Login Benar Gagal: Kredensial benar tetapi tidak bisa masuk. Detail: ${errorDetail}`;
      console.error(`[TEST ERROR] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // Asersi standar jika login berhasil (sesuai harapan)
    expect(response.user.email).toBe("mahasiswa@students.undip.ac.id");
    expect(response.user.name).toBe(userFromDb?.name);
  });
});
