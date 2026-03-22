import {
  DocumentTemplateService,
  TemplateData,
  DigitalFeatures,
} from "./DocumentTemplateService.js";
import { Prisma } from "../../db/index.js";
import type {
  LetterInstance,
  LetterVerification,
} from "../../generated/prisma/client.js";
import { join } from "path";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import {
  SRB_TEMPLATE_PATH,
  SRL_TEMPLATE_PATH,
} from "../../config/templates.config.js";
import { config } from "../../config.js";

const prisma = Prisma;

export interface SuratRekomendasiData {
  letterInstanceId: string;
  applicationData: any;
  letterNumber?: string;
  signatureUrl?: string;
  stampUrl?: string;
  publishedAt?: Date;
  jenis?: string;
  leadershipConfig?: {
    name: string;
    nip: string;
    jabatan: string;
  };
}

export class SuratRekomendasiTemplateService {
  private templateService: DocumentTemplateService;
  // Path template dimuat dari konfigurasi terpusat.
  private templateName = SRB_TEMPLATE_PATH;

  constructor() {
    this.templateService = new DocumentTemplateService();
  }

  /**
   * Membuat surat rekomendasi beasiswa dari template.
   */
  async generateSuratRekomendasi(data: SuratRekomendasiData): Promise<Buffer> {
    try {
      // Transformasi data aplikasi ke format template.
      const templateData = await this.transformApplicationDataToTemplate(data);

      // Siapkan fitur digital.
      const digitalFeatures = await this.prepareDigitalFeatures(data);

      // Pilih template berdasarkan jenis surat.
      const templatePath =
        data.jenis === "keperluan_lain" ? SRL_TEMPLATE_PATH : this.templateName;

      // Buat dokumen.
      const documentBuffer = await this.templateService.generateDocument(
        templatePath,
        templateData,
        digitalFeatures,
      );

      return documentBuffer;
    } catch (error: any) {
      console.error("Error generating surat rekomendasi:", error);
      throw new Error(`Failed to generate surat rekomendasi: ${error.message}`);
    }
  }

  /**
   * Transformasi data aplikasi ke format template.
   * Mendukung nama field camelCase dan snake_case.
   */
  private async transformApplicationDataToTemplate(
    data: SuratRekomendasiData,
  ): Promise<TemplateData> {
    const { applicationData, letterNumber, leadershipConfig, publishedAt } =
      data;
    const formData = applicationData.formData || applicationData;

    // Tentukan tahun akademik saat ini sesuai aturan Indonesia:
    // - Semester Ganjil: Juli - Desember -> tahun_saat_ini/tahun_depan
    // - Semester Genap: Januari - Juni -> tahun_kemarin/tahun_saat_ini
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    // Jika bulan 1-6 (Jan-Jun, Semester Genap), gunakan previous_year/current_year.
    // Jika bulan 7-12 (Jul-Des, Semester Ganjil), gunakan current_year/next_year.
    const academicYearStart = currentMonth <= 6 ? currentYear - 1 : currentYear;
    const academicYearEnd = academicYearStart + 1;
    const calculatedAcademicYear = `${academicYearStart}/${academicYearEnd}`;

    const academicYear =
      formData.tahunAkademik ||
      formData.tahun_akademik ||
      calculatedAcademicYear;

    // Format tanggal lahir, mendukung dua format field.
    const rawTanggalLahir = formData.tanggalLahir || formData.tanggal_lahir;
    const tanggalLahir = rawTanggalLahir
      ? new Date(rawTanggalLahir).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";

    // Format tanggal terbit, hanya tampil jika benar-benar sudah publish.
    const tanggalTerbit = publishedAt
      ? publishedAt.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : ""; // Kosong jika belum dipublikasikan

    // Tentukan keperluan, cukup nama beasiswanya saja.
    // Template sudah memiliki "Pengajuan Beasiswa {{keperluan}}".
    const keperluan =
      formData.namaBeasiswa ||
      formData.nama_beasiswa ||
      formData.jenisBeasiswa ||
      formData.jenis_beasiswa ||
      "";

    const templateData: TemplateData = {
      // Nomor surat
      nomor_surat: letterNumber || "",

      // Data mahasiswa, mendukung camelCase dan snake_case.
      nama_lengkap:
        formData.namaLengkap || formData.nama_lengkap || formData.nama || "",
      nim: formData.nim || "",
      tempat_lahir: formData.tempatLahir || formData.tempat_lahir || "",
      tanggal_lahir: tanggalLahir,
      no_hp: formData.noHp || formData.no_hp || "",
      tahun_akademik: academicYear,
      jurusan: formData.departemen || formData.jurusan || "",
      program_studi:
        formData.programStudi || formData.program_studi || formData.prodi || "",
      semester: formData.semester?.toString() || "",
      ipk: formData.ipk?.toString() || "",
      ips: formData.ips?.toString() || "",
      keperluan: keperluan,

      // Tanggal terbit, kosong sebelum dipublikasikan.
      tanggal_terbit: tanggalTerbit,

      // Penandatangan (dari leadership config atau default)
      nama_penandatangan:
        leadershipConfig?.name || "Prof. Dr. Ngadiwiyana, S.Si., M.Si.",
      nip_penandatangan: leadershipConfig?.nip || "196906201990031002",
      jabatan_penandatangan:
        leadershipConfig?.jabatan || "Wakil Dekan Akademik dan Kemahasiswaan",
    };

    return templateData;
  }

  /**
   * Menyiapkan fitur digital (QR, tanda tangan, stempel).
   */
  private async prepareDigitalFeatures(
    data: SuratRekomendasiData,
  ): Promise<DigitalFeatures | undefined> {
    const digitalFeatures: DigitalFeatures = {};

    // Kode QR untuk verifikasi, hanya jika surat sudah publish.
    if (data.letterNumber && data.publishedAt) {
      try {
        // Ambil atau buat kode verifikasi.
        const verification = await this.getOrCreateVerification(
          data.letterInstanceId,
          data.letterNumber,
        );
        if (verification) {
          const verificationUrl = `${config.FRONTEND_URL}/verify/${verification.code}`;
          digitalFeatures.qrCodeData = verificationUrl;
        }
      } catch (error) {
        console.error("Error preparing QR code:", error);
        // Lanjutkan proses tanpa QR code.
      }
    }

    // Tanda tangan.
    if (data.signatureUrl) {
      try {
        // Cek apakah data berupa base64 (data:image/png;base64,...).
        if (data.signatureUrl.startsWith("data:")) {
          // Ambil bagian base64 dari data URL.
          const base64Match = data.signatureUrl.match(
            /^data:image\/\w+;base64,(.+)$/,
          );
          if (base64Match && base64Match[1]) {
            digitalFeatures.signatureImageBase64 = base64Match[1];
          }
        } else if (data.signatureUrl.startsWith("http")) {
          // URL HTTP penuh, unduh lalu simpan lokal.
          digitalFeatures.signatureImagePath = await this.downloadAndSaveImage(
            data.signatureUrl,
            "signature",
          );
        } else {
          // Path lokal.
          const localPath = join(process.cwd(), "uploads", data.signatureUrl);
          digitalFeatures.signatureImagePath = localPath;
        }
      } catch (error) {
        console.error("Error preparing signature image:", error);
        // Lanjutkan proses tanpa tanda tangan.
      }
    }

    // Stempel.
    if (data.stampUrl) {
      try {
        if (data.stampUrl.startsWith("http")) {
          digitalFeatures.stampImagePath = await this.downloadAndSaveImage(
            data.stampUrl,
            "stamp",
          );
        } else {
          const localPath = join(process.cwd(), "uploads", data.stampUrl);
          digitalFeatures.stampImagePath = localPath;
        }
      } catch (error) {
        console.error("Error preparing stamp image:", error);
        // Lanjutkan proses tanpa stempel.
      }
    }

    return Object.keys(digitalFeatures).length > 0
      ? digitalFeatures
      : undefined;
  }

  /**
   * Mengambil atau membuat kode verifikasi untuk surat.
   */
  private async getOrCreateVerification(
    letterInstanceId: string,
    letterNumber: string,
  ): Promise<LetterVerification | null> {
    try {
      // Periksa apakah verifikasi sudah ada.
      let verification = await prisma.letterVerification.findUnique({
        where: { applicationId: letterInstanceId },
      });

      if (!verification) {
        // Buat kode verifikasi 12 karakter.
        const code = this.generateVerificationCode();

        verification = await prisma.letterVerification.create({
          data: {
            applicationId: letterInstanceId,
            letterNumber: letterNumber,
            code: code,
          },
        });
      }

      return verification;
    } catch (error) {
      console.error("Error getting/creating verification:", error);
      return null;
    }
  }

  /**
   * Membuat kode verifikasi acak.
   */
  private generateVerificationCode(length: number = 12): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Mengunduh dan menyimpan gambar secara lokal untuk pemrosesan.
   */
  private async downloadAndSaveImage(
    url: string,
    type: "signature" | "stamp",
  ): Promise<string> {
    try {
      // Pastikan direktori temp tersedia.
      const tempDir = join(process.cwd(), "uploads", "temp");
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }

      // Buat nama file unik.
      const ext = url.includes(".png") ? "png" : "png";
      const filename = `${type}_${Date.now()}.${ext}`;
      const localPath = join(tempDir, filename);

      // Unduh gambar.
      console.log(`[INFO] Downloading ${type} from:`, url);
      const response = await fetch(url);
      if (!response.ok) {
        console.error(
          `[ERROR] Failed to download ${type}: HTTP ${response.status} ${response.statusText}`,
        );
        throw new Error(`Failed to download ${type}: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      if (buffer.length === 0) {
        throw new Error(`Downloaded ${type} is empty (0 bytes)`);
      }

      writeFileSync(localPath, buffer);
      console.log(`[SUCCESS] ${type} saved to:`, localPath);

      return localPath;
    } catch (error) {
      console.error(`Error downloading ${type}:`, error);
      throw error;
    }
  }

  /**
   * Memvalidasi data surat rekomendasi.
   * Mendukung nama field camelCase dan snake_case.
   */
  validateSuratRekomendasiData(data: SuratRekomendasiData): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!data.letterInstanceId) {
      errors.push("letterInstanceId is required");
    }

    if (!data.applicationData) {
      errors.push("applicationData is required");
    }

    const formData = data.applicationData?.formData || data.applicationData;
    if (!formData) {
      errors.push("formData is required in applicationData");
    }

    // Validasi field form wajib, mendukung camelCase dan snake_case.
    // Pemetaan varian field: [camelCase, snake_case, alias...]
    const requiredFieldVariants = [
      ["namaLengkap", "nama_lengkap", "nama"],
      ["nim"],
      ["tempatLahir", "tempat_lahir"],
      ["tanggalLahir", "tanggal_lahir"],
      ["noHp", "no_hp"],
      ["programStudi", "program_studi", "prodi"],
      ["semester"],
      ["ipk"],
      ["ips"],
    ];

    for (const variants of requiredFieldVariants) {
      const hasField = variants.some(
        (v) => formData?.[v] !== undefined && formData?.[v] !== "",
      );
      if (!hasField) {
        errors.push(
          `formData.${variants[0]} (or ${variants.slice(1).join(", ")}) is required`,
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Mengambil skema template untuk validasi.
   */
  async getTemplateSchema(): Promise<any> {
    try {
      const schemaPath = join(
        process.cwd(),
        "templates",
        "surat-rekomendasi-beasiswa",
        "schema.json",
      );
      const schema = require(schemaPath);
      return schema;
    } catch (error) {
      console.error("Error loading template schema:", error);
      return null;
    }
  }
}
