import dotenv from "dotenv";
dotenv.config();

// Mengambil object "app" dari Elysia Server langsung untuk menguji rute (endpoint)
import { app } from "../../src/server.js";

describe("DUPL-08-02: Pengujian mengklik tombol 'Ajukan Surat' saat terdapat kolom mandatori yang masih kosong (IPK)", () => {
  test("Harus ditolak oleh sistem dan memunculkan error 400 Bad Request karena IPK kosong", async () => {
    // 1. Masukan: Payload JSON pengajuan surat tanpa atribut 'ipk' (Sesuai parameter CSV)
    const payloadTanpaIPK = {
      namaBeasiswa: "Unilever",
      values: {
        tempat_lahir: "Jakarta",
        tanggal_lahir: "2000-01-01",
        no_hp: "08123456789",
        semester: 7,
        // ipk: 3.8,  <-- SENGAJA DIHAPUS UNTUK MEMICU ERROR VALIDASI
        ips: 3.50,
        nama_beasiswa: "Unilever",
        lampiran: {
          ktm: "https://minio/ktm.jpg",
          khs: "https://minio/khs.jpg"
        }
      }
    };

    // 2. Prosedur: Tembakkan request POST langsung ke endpoint /api/surat-rekomendasi/applications
    const request = new Request("http://localhost:3000/api/surat-rekomendasi/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payloadTanpaIPK)
    });

    const response = await app.handle(request);

    // 3. Evaluasi Hasil: Jika sistem malah menyimpan data kosong tersebut (Status 200 / 201)
    if (response.status === 200 || response.status === 201) {
      const errorMsg = `Pengujian Validasi Form Kosong Gagal: Sistem memperbolehkan pengajuan surat (Status ${response.status}) meskipun kolom IPK kosong! Validasi TypeBox Elysia gagal mendeteksi.`;
      console.error(`[TEST ERROR] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // Asersi Standar (Keluaran yang Diharapkan):
    // Jika benar tertolak, maka Elysia (TypeBox) secara otomatis akan merespons HTTP 422 atau 400
    expect([400, 422]).toContain(response.status);

    // Cek detail error
    const errorBody = await response.json();
    expect(errorBody).toBeDefined();
    
    // Pastikan error body menyebutkan bahwa masalahnya ada di IPK
    expect(JSON.stringify(errorBody).toLowerCase()).toContain("ipk");
  });
});
