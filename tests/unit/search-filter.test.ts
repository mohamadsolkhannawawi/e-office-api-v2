import dotenv from "dotenv";
dotenv.config();

import { ApplicationService } from "../../src/modules/surat-rekomendasi-beasiswa/services/application.service.js";

describe("DUPL-07-30: Pengujian pencarian menggunakan nama pengaju (mahasiswa) atau perihal surat yang valid", () => {
  test("Sistem menyaring daftar tabel dan menampilkan hanya baris surat yang memiliki nama pengaju atau perihal sesuai kata kunci", async () => {
    // 1. Masukan: Kata Kunci (Misalnya mencari "Budi Santoso")
    const searchKeyword = "Budi Santoso";

    // 2. Prosedur: Jalankan fungsi listApplications dari ApplicationService dengan parameter search
    let searchResult: any = null;
    let errorOccurred: any = null;
    try {
      searchResult = await ApplicationService.listApplications({
        letterTypeId: "srb-type-id",
        search: searchKeyword, // Parameter kata kunci dikirim ke database
        page: 1,
        limit: 10,
      });
    } catch (err: any) {
      errorOccurred = err;
    }

    // 3. Evaluasi Hasil: Pastikan tidak ada error internal saat query
    if (errorOccurred) {
      const errorMsg = `Pengujian Pencarian Gagal: Terjadi kesalahan server saat mencari data. Detail: ${errorOccurred.message}`;
      console.error(`[TEST ERROR] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // Pastikan response terformat dengan benar
    if (!searchResult || !Array.isArray(searchResult.items)) {
       const errorMsg = `Pengujian Pencarian Gagal: Respons listApplications tidak sesuai format yang diharapkan.`;
       console.error(`[TEST ERROR] ${errorMsg}`);
       throw new Error(errorMsg);
    }

    // Cek secara ketat apakah SETIAP baris data yang kembali benar-benar memuat kata kunci
    const allItemsMatch = searchResult.items.every((item: any) => {
       const nameMatch = item.createdBy?.name?.toLowerCase().includes(searchKeyword.toLowerCase());
       const scholarshipMatch = item.scholarshipName?.toLowerCase().includes(searchKeyword.toLowerCase());
       return nameMatch || scholarshipMatch;
    });

    // Jika ada data yang bocor (tidak mengandung nama Budi Santoso tapi ikut tampil)
    if (!allItemsMatch && searchResult.items.length > 0) {
      const errorMsg = `Pengujian Pencarian Gagal: Terdapat baris data yang muncul di tabel namun sama sekali tidak mengandung kata kunci '${searchKeyword}'. Filter bocor!`;
      console.error(`[TEST ERROR] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // Asersi standar (Kriteria evaluasi hasil)
    expect(searchResult.items).toBeDefined();
    expect(Array.isArray(searchResult.items)).toBe(true);
  });
});
