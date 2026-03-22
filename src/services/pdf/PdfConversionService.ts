/**
 * Layanan Konversi PDF.
 * Menggunakan LibreOffice mode headless untuk mengonversi file DOCX ke PDF.
 * Menerapkan proteksi kata sandi menggunakan qpdf (utama) atau fallback LibreOffice.
 *
 * Kebutuhan:
 * - LibreOffice harus terpasang di server.
 * - Windows: winget install TheDocumentFoundation.LibreOffice
 * - Linux: sudo apt-get install libreoffice
 * - Untuk proteksi kata sandi PDF (direkomendasikan):
 *   - Windows: choco install qpdf
 *   - Linux: sudo apt-get install qpdf
 */

import { exec } from "child_process";
import { promisify } from "util";
import { join, dirname, basename } from "path";
import * as fs from "fs";

const execAsync = promisify(exec);

// Daftar path executable LibreOffice berdasarkan sistem operasi.
const LIBREOFFICE_PATHS = {
  win32: [
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  ],
  linux: [
    // Path kustom via env var (untuk server tanpa root, misalnya AppImage extract).
    process.env.LIBREOFFICE_PATH ?? "",
    "/usr/bin/soffice",
    "/usr/bin/libreoffice",
    // Path umum hasil ekstraksi AppImage.
    `${process.env.HOME}/libreoffice/squashfs-root/usr/bin/soffice`,
    `${process.env.HOME}/squashfs-root/usr/bin/soffice`,
  ],
  darwin: ["/Applications/LibreOffice.app/Contents/MacOS/soffice"],
};

const PDF_PASSWORD = "FSMMAJUSELALU";

export class PdfConversionService {
  private libreOfficePath: string | null = null;

  constructor() {
    this.findLibreOffice();
  }

  /**
   * Mencari path instalasi LibreOffice.
   */
  private findLibreOffice(): void {
    const platform = process.platform as keyof typeof LIBREOFFICE_PATHS;
    const paths = LIBREOFFICE_PATHS[platform] || [];

    for (const path of paths) {
      if (fs.existsSync(path)) {
        this.libreOfficePath = path;
        console.log(
          `[SUCCESS] [PdfConversionService] Found LibreOffice at: ${path}`,
        );
        return;
      }
    }

    console.warn(
      "[WARN] [PdfConversionService] LibreOffice not found. PDF conversion will not be available.",
    );
    console.warn(
      "   Install with: winget install TheDocumentFoundation.LibreOffice",
    );
  }

  /**
   * Memeriksa apakah fitur konversi PDF tersedia.
   */
  isAvailable(): boolean {
    return this.libreOfficePath !== null;
  }

  /**
   * Mengonversi file DOCX menjadi PDF.
   * @param docxPath Path absolut ke file DOCX.
   * @returns Path ke file PDF yang dihasilkan.
   */
  async convertToPdf(docxPath: string): Promise<string> {
    if (!this.libreOfficePath) {
      throw new Error(
        "LibreOffice is not installed. Please install LibreOffice to enable PDF conversion.",
      );
    }

    // Validasi bahwa file input tersedia.
    if (!fs.existsSync(docxPath)) {
      throw new Error(`DOCX file not found: ${docxPath}`);
    }

    const outputDir = dirname(docxPath);
    const baseNameWithoutExt = basename(docxPath, ".docx");
    const pdfPath = join(outputDir, `${baseNameWithoutExt}.pdf`);

    console.log(`[INFO] [PdfConversionService] Converting: ${docxPath}`);
    console.log(`[INFO] [PdfConversionService] Output: ${pdfPath}`);

    // Langkah 1: Konversi DOCX ke PDF tanpa enkripsi.
    console.log(`[INFO] [PdfConversionService] Converting: ${docxPath}`);
    const convertCommand = `"${this.libreOfficePath}" --headless --convert-to pdf --outdir "${outputDir}" "${docxPath}"`;
    console.log(`[INFO] [PdfConversionService] Executing conversion...`);

    try {
      const { stdout, stderr } = await execAsync(convertCommand, {
        timeout: 60000,
      });

      if (stdout)
        console.log(`[INFO] [PdfConversionService] stdout: ${stdout}`);
      if (stderr)
        console.warn(`[WARN] [PdfConversionService] stderr: ${stderr}`);

      if (!fs.existsSync(pdfPath)) {
        throw new Error(
          "PDF file was not created. Conversion may have failed.",
        );
      }

      console.log(`[SUCCESS] [PdfConversionService] PDF created: ${pdfPath}`);
    } catch (error: any) {
      console.error(`[ERROR] [PdfConversionService] Conversion failed:`, error);
      throw new Error(`PDF conversion failed: ${error.message}`);
    }

    // Langkah 2: Terapkan proteksi kata sandi menggunakan qpdf (jika tersedia).
    // user-password="" (tanpa password untuk membuka), owner-password=PDF_PASSWORD (tersembunyi)
    // --modify=none --annotate=n mencegah pengeditan di Nitro PDF, Adobe, dll.
    try {
      const encryptedPath = pdfPath.replace(".pdf", "_encrypted.pdf");
      const qpdfCommand = `qpdf --encrypt "" "${PDF_PASSWORD}" 256 --modify=none --annotate=n --print=full --extract=n -- "${pdfPath}" "${encryptedPath}"`;

      await execAsync(qpdfCommand, { timeout: 30000 });

      if (fs.existsSync(encryptedPath)) {
        // Ganti file asli dengan versi terenkripsi.
        fs.unlinkSync(pdfPath);
        fs.renameSync(encryptedPath, pdfPath);
        console.log(
          `[SUCCESS] [PdfConversionService] PDF password protected successfully`,
        );
      }
    } catch (encryptError: any) {
      // qpdf tidak tersedia, coba fallback re-export via LibreOffice.
      console.warn(
        `[WARN] [PdfConversionService] qpdf not available, trying LibreOffice re-export with password...`,
      );

      try {
        // Re-export PDF yang sudah ada dengan password menggunakan LibreOffice.
        const encCommand = `"${this.libreOfficePath}" --headless --convert-to "pdf:writer_pdf_Export:{'EncryptFile':{'type':'boolean','value':'true'},'DocumentOpenPassword':{'type':'string','value':'${PDF_PASSWORD}'}}" --outdir "${outputDir}" "${pdfPath}"`;
        await execAsync(encCommand, { timeout: 60000 });
        console.log(
          `[SUCCESS] [PdfConversionService] PDF password protected via LibreOffice fallback`,
        );
      } catch (fallbackError: any) {
        console.warn(
          `[WARN] [PdfConversionService] Password protection not available. PDF will be unencrypted.`,
        );
        console.warn(
          `   Install qpdf for reliable PDF encryption: apt-get install qpdf (Linux) or choco install qpdf (Windows)`,
        );
      }
    }

    return pdfPath;
  }

  /**
   * Mengambil PDF untuk file DOCX dan membuatnya jika diperlukan.
   * Menggunakan cache: jika PDF sudah ada dan lebih baru dari DOCX, gunakan versi cache.
   */
  async getPdfForDocx(docxPath: string): Promise<string> {
    const pdfPath = docxPath.replace(/\.docx$/i, ".pdf");

    // Periksa apakah PDF sudah ada dan masih terbaru.
    if (fs.existsSync(pdfPath)) {
      const docxStat = fs.statSync(docxPath);
      const pdfStat = fs.statSync(pdfPath);

      if (pdfStat.mtime > docxStat.mtime) {
        console.log(
          `[INFO] [PdfConversionService] Using cached PDF: ${pdfPath}`,
        );
        return pdfPath;
      }
    }

    // Buat PDF baru.
    return this.convertToPdf(docxPath);
  }
}

// Ekspor instance singleton.
export const pdfConversionService = new PdfConversionService();
