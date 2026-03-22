import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import QRCode from "qrcode";
import sharp from "sharp";
// @ts-ignore - modul ini tidak menyediakan tipe bawaan
import ImageModule from "docxtemplater-image-module-free";

/**
 * Konfigurasi ukuran gambar (dalam piksel).
 * Semua gambar distandarkan ke format kotak 3cm x 3cm.
 *
 * CATATAN: Gambar akan diubah ukurannya secara proporsional dengan latar putih
 * agar pas di dalam area 3cm x 3cm tanpa crop.
 *
 * Konversi: 1 cm ≈ 37.8 piksel pada 96 DPI
 * 3cm x 3cm = 113 x 113 piksel pada 96 DPI
 */
export const IMAGE_SIZE_CONFIG = {
  // Tanda tangan: 3cm x 3cm (kotak)
  signature: {
    width: 113, // 3cm at 96 DPI
    height: 113, // 3cm at 96 DPI
  },
  // Stempel: 3cm x 3cm (kotak)
  stamp: {
    width: 113, // 3cm at 96 DPI
    height: 113, // 3cm at 96 DPI
  },
  // Kode QR: 3cm x 3cm (kotak)
  qrCode: {
    width: 113, // 3cm at 96 DPI
    height: 113, // 3cm at 96 DPI
  },
  // Nilai default untuk gambar yang tidak dikenali
  default: {
    width: 113, // 3cm at 96 DPI
    height: 113, // 3cm at 96 DPI
  },
};

export interface TemplateData {
  // Kop surat
  kop_universitas?: string;
  kop_fakultas?: string;
  kop_alamat?: string;
  kop_telepon?: string;
  kop_fax?: string;
  kop_website?: string;
  kop_email?: string;

  // Identitas surat
  judul_surat?: string;
  nomor_surat?: string;

  // Data mahasiswa
  nama_lengkap: string;
  nim: string;
  tempat_lahir: string;
  tanggal_lahir: string;
  no_hp: string;
  tahun_akademik: string;
  jurusan?: string;
  program_studi: string;
  semester: string;
  ipk: string;
  ips: string;
  keperluan: string;

  // Penandatangan
  tanggal_terbit?: string;
  jabatan_penandatangan?: string;
  nama_penandatangan: string;
  nip_penandatangan: string;

  // Fitur digital (opsional)
  qr_code?: string;
  signature_image?: string;
  stamp_image?: string;
}

export interface DigitalFeatures {
  qrCodeData?: string;
  signatureImagePath?: string;
  signatureImageBase64?: string; // Untuk data tanda tangan base64 langsung
  stampImagePath?: string;
  verificationUrl?: string; // URL untuk verifikasi dokumen
}

export class DocumentTemplateService {
  private templatesPath: string;

  constructor() {
    this.templatesPath = join(process.cwd(), "templates");
  }

  /**
   * Membuat kode QR untuk verifikasi dokumen.
   * Menggunakan resolusi tinggi agar kualitas lebih baik saat dimasukkan ke dokumen.
   */
  async generateQRCode(data: string): Promise<Buffer> {
    try {
      const qrBuffer = await QRCode.toBuffer(data, {
        type: "png",
        margin: 0, // Tanpa margin agar ukuran QR maksimal di area template
        width: 400, // Resolusi tinggi untuk kualitas lebih baik
        errorCorrectionLevel: "M", // Koreksi error tingkat menengah
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });
      return qrBuffer;
    } catch (error) {
      console.error("Error generating QR code:", error);
      throw new Error("Failed to generate QR code");
    }
  }

  /**
   * Memproses kode QR secara khusus dengan memenuhi area template tanpa padding.
   * Kode QR perlu memenuhi area penuh 3cm x 3cm untuk hasil pemindaian optimal.
   */
  async processQRCode(
    input: Buffer | string,
    maxWidth: number = 113,
    maxHeight: number = 113,
  ): Promise<Buffer> {
    try {
      // Jika input berupa string base64, ubah ke Buffer.
      const inputBuffer =
        typeof input === "string" ? Buffer.from(input, "base64") : input;

      const processedImage = await sharp(inputBuffer)
        .resize(maxWidth, maxHeight, {
          fit: "fill", // Penuhi seluruh area tanpa padding, optimal untuk QR
        })
        .png({ quality: 100, compressionLevel: 9 }) // Kompresi lossless maksimum
        .toBuffer();

      return processedImage;
    } catch (error) {
      console.error("Error processing QR code:", error);
      throw new Error("Failed to process QR code");
    }
  }

  /**
   * Memproses tanda tangan secara khusus dengan ukuran maksimal sambil menjaga rasio aspek.
   * Menggunakan mode 'cover' agar area terisi semaksimal mungkin tanpa distorsi.
   */
  async processSignature(
    input: Buffer | string,
    maxWidth: number = 113,
    maxHeight: number = 113,
  ): Promise<Buffer> {
    try {
      // Jika input berupa string base64, ubah ke Buffer.
      const inputBuffer =
        typeof input === "string" ? Buffer.from(input, "base64") : input;

      const processedImage = await sharp(inputBuffer)
        .resize(maxWidth, maxHeight, {
          fit: "cover", // Penuhi area sambil menjaga rasio aspek
          position: "center", // Posisikan tanda tangan di tengah
        })
        .png({ quality: 100, compressionLevel: 9 }) // Kompresi lossless maksimum
        .toBuffer();

      return processedImage;
    } catch (error) {
      console.error("Error processing signature:", error);
      throw new Error("Failed to process signature");
    }
  }

  /**
   * Memproses gambar untuk penyisipan template (dari path file).
   * Mengubah ukuran ke format kotak (3cm x 3cm) dengan latar putih.
   * Gambar diskalakan proporsional dan diposisikan di tengah tanpa crop.
   */
  async processImage(
    imagePath: string,
    maxWidth: number = 113,
    maxHeight: number = 113,
  ): Promise<Buffer> {
    try {
      const processedImage = await sharp(imagePath)
        .resize(maxWidth, maxHeight, {
          fit: "contain", // Skalakan agar muat dengan latar, tanpa crop
          background: { r: 255, g: 255, b: 255, alpha: 1 }, // Latar putih
        })
        .png({ quality: 100, compressionLevel: 9 }) // Kompresi lossless maksimum
        .toBuffer();

      return processedImage;
    } catch (error) {
      console.error("Error processing image:", error);
      throw new Error("Failed to process image");
    }
  }

  /**
   * Memproses gambar dari Buffer atau string base64.
   * Mengubah ukuran ke format kotak (3cm x 3cm) dengan latar putih.
   * Gambar diskalakan proporsional dan diposisikan di tengah tanpa crop.
   */
  async processImageBuffer(
    input: Buffer | string,
    maxWidth: number,
    maxHeight: number,
  ): Promise<Buffer> {
    try {
      // Jika input berupa string base64, ubah ke Buffer.
      const inputBuffer =
        typeof input === "string" ? Buffer.from(input, "base64") : input;

      const processedImage = await sharp(inputBuffer)
        .resize(maxWidth, maxHeight, {
          fit: "contain", // Skalakan agar muat dengan latar, tanpa crop
          background: { r: 255, g: 255, b: 255, alpha: 1 }, // Latar putih
        })
        .png({ quality: 100, compressionLevel: 9 }) // Kompresi lossless maksimum
        .toBuffer();

      return processedImage;
    } catch (error) {
      console.error("Error processing image buffer:", error);
      throw new Error("Failed to process image buffer");
    }
  }

  /**
   * Memuat file template.
   */
  private loadTemplate(templateName: string): Buffer {
    const templatePath = join(this.templatesPath, templateName);

    if (!existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`);
    }

    return readFileSync(templatePath);
  }

  /**
   * Daftar variabel template yang dikenal untuk validasi dan normalisasi placeholder.
   */
  private readonly KNOWN_VARIABLES = [
    "nomor_surat",
    "nama_lengkap",
    "nim",
    "tempat_lahir",
    "tanggal_lahir",
    "no_hp",
    "tahun_akademik",
    "program_studi",
    "semester",
    "ipk",
    "ips",
    "keperluan",
    "tanggal_terbit",
    "jabatan_penandatangan",
    "nama_penandatangan",
    "nip_penandatangan",
    "jurusan",
    // Variabel gambar (ditangani oleh image module)
    "signature_image",
    "stamp_image",
    "qr_code",
  ];

  /**
   * Memperbaiki tag template yang terbelah di beberapa Word XML run.
   * Word kadang menambahkan batas format XML di tengah tag template,
   * misalnya {{nama</w:t></w:r><w:r><w:t>_lengkap}}
   * Metode ini menggabungkan kembali tag yang terbelah pada paragraf terkait.
   */
  private fixSplitTags(zip: PizZip): void {
    const xmlFiles = [
      "word/document.xml",
      "word/header1.xml",
      "word/header2.xml",
      "word/header3.xml",
      "word/footer1.xml",
      "word/footer2.xml",
      "word/footer3.xml",
    ];

    // Pola untuk mencocokkan batas XML run antar elemen teks.
    const xmlBoundaryPattern =
      /<\/w:t>\s*<\/w:r>\s*<w:r(?:\s[^>]*)?>(?:\s*<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:t(?:\s[^>]*)?>/g;

    for (const fileName of xmlFiles) {
      const xmlFile = zip.file(fileName);
      if (!xmlFile) continue;

      const content = xmlFile.asText();
      let modified = false;

      // Proses setiap paragraf: gabungkan run hanya pada paragraf dengan tag template terbelah.
      const newContent = content.replace(
        /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g,
        (paragraph) => {
          // Ekstrak semua teks dari elemen <w:t> di paragraf ini.
          const textParts: string[] = [];
          paragraph.replace(
            /<w:t[^>]*>([\s\S]*?)<\/w:t>/g,
            (_: string, text: string) => {
              textParts.push(text);
              return _;
            },
          );

          if (textParts.length < 2) return paragraph;

          const fullText = textParts.join("");

          // Cek apakah paragraf ini memiliki konten terkait template (kurung kurawal).
          if (!fullText.includes("{")) return paragraph;

          // Cek apakah ada elemen teks dengan kurung kurawal tidak seimbang (indikasi tag terbelah).
          let hasSplit = false;
          for (const text of textParts) {
            const opens = (text.match(/\{/g) || []).length;
            const closes = (text.match(/\}/g) || []).length;
            if (opens !== closes) {
              hasSplit = true;
              break;
            }
          }

          if (!hasSplit) return paragraph;

          // Gabungkan text run dengan menghapus batas XML antar elemen teks berurutan.
          modified = true;
          const merged = paragraph.replace(xmlBoundaryPattern, "");
          // Setelah digabung, pastikan elemen <w:t> yang berisi variabel template
          // memiliki xml:space="preserve" agar processor XML tidak menghapus
          // whitespace (spasi, titik dua, tab) di sekitar variabel.
          return merged.replace(
            /<w:t(?![^>]*xml:space="preserve")([^>]*)>([^<]*\{\{)/g,
            (_, attrs, content) =>
              `<w:t xml:space="preserve"${attrs}>${content}`,
          );
        },
      );

      if (modified) {
        console.log(`[fixSplitTags] Fixed split template tags in ${fileName}`);
        zip.file(fileName, newContent);
      }
    }
  }

  /**
   * Normalizer aman khusus tag gambar.
   * Mengubah {%tag} -> {{%tag}} untuk placeholder gambar agar kompatibel
   * dengan delimiter kurung ganda {{ }} pada docxtemplater.
   *
   * Aman dijalankan (berbeda dengan normalizeTemplateBraces penuh) karena:
   * - Tag gambar cenderung pendek dan jarang terbelah antar XML run
   * - Penggantian string dilakukan secara exact untuk nama tag gambar yang dikenal
   * - Tag variabel teks tidak disentuh (menghindari masalah split-tag)
   */
  private normalizeImageTags(zip: PizZip): void {
    const IMAGE_TAGS = ["signature_image", "stamp_image", "qr_code"];

    const xmlFiles = [
      "word/document.xml",
      "word/header1.xml",
      "word/header2.xml",
      "word/header3.xml",
      "word/footer1.xml",
      "word/footer2.xml",
      "word/footer3.xml",
    ];

    for (const fileName of xmlFiles) {
      const xmlFile = zip.file(fileName);
      if (!xmlFile) continue;

      let content = xmlFile.asText();
      let modified = false;

      for (const imgTag of IMAGE_TAGS) {
        const singleBrace = `{%${imgTag}}`;
        const doubleBrace = `{{%${imgTag}}}`;

        // Lewati jika sudah dalam format kurung ganda.
        if (content.includes(doubleBrace)) continue;

        if (content.includes(singleBrace)) {
          console.log(
            `[normalizeImageTags] Converting in ${fileName}: ${singleBrace} -> ${doubleBrace}`,
          );
          content = content.split(singleBrace).join(doubleBrace);
          modified = true;
        }
      }

      if (modified) {
        zip.file(fileName, content);
      }
    }
  }

  /**
   * Mengonversi kurung ganda {{name}} menjadi kurung tunggal {name} pada template.
   * Ini memungkinkan template format {{}} tetap berjalan pada docxtemplater 3.67+.
   * Tag gambar {%name} dipertahankan apa adanya.
   * Juga memperbaiki typo umum seperti {{name} (kurung penutup kurang).
   * Memproses semua file word/*.xml termasuk header/footer.
   */
  private normalizeTemplateBraces(zip: PizZip): void {
    // Proses semua file XML Word.
    const xmlFiles = [
      "word/document.xml",
      "word/header1.xml",
      "word/header2.xml",
      "word/header3.xml",
      "word/footer1.xml",
      "word/footer2.xml",
      "word/footer3.xml",
    ];

    // Tag gambar yang perlu dikonversi dari {%...} menjadi {{%...}}.
    const IMAGE_TAGS = ["signature_image", "stamp_image", "qr_code"];

    let totalModified = 0;

    for (const fileName of xmlFiles) {
      const xmlFile = zip.file(fileName);
      if (!xmlFile) continue;

      let content = xmlFile.asText();
      let fileModified = false;

      // Perbaiki tag variabel: {{variable} -> {{variable}}.
      // Gunakan regex untuk menemukan pola {{varname} dan menambahkan kurung penutup yang hilang.
      for (const varName of this.KNOWN_VARIABLES) {
        // Cocokkan {{varName} tapi BUKAN {{varName}} (negative lookahead untuk kurung kedua).
        const regex = new RegExp(`\\{\\{${varName}\\}(?!\\})`, "g");
        const replacement = `{{${varName}}}`;

        if (regex.test(content)) {
          console.log(`Fixing in ${fileName}: {{${varName}} -> {{${varName}}}`);
          // Reset lastIndex regex lalu lakukan replace.
          content = content.replace(
            new RegExp(`\\{\\{${varName}\\}(?!\\})`, "g"),
            replacement,
          );
          fileModified = true;
        }
      }

      // Konversi tag gambar dari {%tag} ke {{%tag}} agar kompatibel dengan delimiter kurung ganda.
      for (const imgTag of IMAGE_TAGS) {
        const singleBrace = `{%${imgTag}}`;
        const doubleBrace = `{{%${imgTag}}}`;

        if (content.includes(singleBrace)) {
          console.log(
            `Converting image tag in ${fileName}: {%${imgTag}} -> {{%${imgTag}}}`,
          );
          content = content.split(singleBrace).join(doubleBrace);
          fileModified = true;
        }
      }

      if (fileModified) {
        zip.file(fileName, content);
        totalModified++;
      }
    }

    if (totalModified > 0) {
      console.log(`Template braces normalized in ${totalModified} file(s)`);
    }
  }

  /**
   * Membuat dokumen dari template.
   */
  async generateDocument(
    templateName: string,
    data: TemplateData,
    digitalFeatures?: DigitalFeatures,
  ): Promise<Buffer> {
    try {
      console.log("Loading template:", templateName);

      // Muat template.
      const templateBuffer = this.loadTemplate(templateName);
      const zip = new PizZip(templateBuffer);

      // CATATAN: Normalisasi template penuh DINONAKTIFKAN karena bisa merusak
      // saat tag variabel teks terbelah antar elemen XML oleh Word
      // (misalnya {{program</w:t></w:r><w:r><w:t>_studi}}).
      // Sebagai gantinya:
      // 1. Perbaiki split tag dengan menggabungkan run pada paragraf terdampak
      // 2. Normalisasi tag gambar ({%tag} -> {{%tag}}) yang aman
      this.fixSplitTags(zip);
      this.normalizeImageTags(zip);

      // Siapkan data dengan nilai default (termasuk pemrosesan gambar).
      console.log("Preparing template data...");
      const templateData = await this.prepareTemplateData(
        data,
        digitalFeatures,
      );
      console.log("Template data prepared:", Object.keys(templateData));

      // Konfigurasi image module untuk menangani tag {%image}.
      const imageModuleOptions = {
        centered: false,
        getImage: (tagValue: string) => {
          // tagValue adalah string base64 yang disimpan di templateData.
          if (tagValue && tagValue.length > 0) {
            return Buffer.from(tagValue, "base64");
          }
          // Kembalikan PNG 1x1 transparan jika tidak ada gambar.
          return Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "base64",
          );
        },
        getSize: (img: Buffer, tagValue: string, tagName: string) => {
          // Jika tidak ada data gambar, kembalikan ukuran minimal agar tidak terlihat.
          if (!tagValue || tagValue.length === 0) {
            return [1, 1]; // Secara visual tidak terlihat
          }
          // Gunakan ukuran terkonfigurasi dari IMAGE_SIZE_CONFIG.
          if (tagName === "signature_image") {
            return [
              IMAGE_SIZE_CONFIG.signature.width,
              IMAGE_SIZE_CONFIG.signature.height,
            ];
          }
          if (tagName === "stamp_image") {
            return [
              IMAGE_SIZE_CONFIG.stamp.width,
              IMAGE_SIZE_CONFIG.stamp.height,
            ];
          }
          if (tagName === "qr_code") {
            return [
              IMAGE_SIZE_CONFIG.qrCode.width,
              IMAGE_SIZE_CONFIG.qrCode.height,
            ];
          }
          return [
            IMAGE_SIZE_CONFIG.default.width,
            IMAGE_SIZE_CONFIG.default.height,
          ];
        },
      };

      const imageModule = new ImageModule(imageModuleOptions);

      // Inisialisasi docxtemplater dengan image module.
      // CATATAN: docxtemplater 3.67+ memakai kurung tunggal {} secara default.
      // Konfigurasikan delimiter ke kurung ganda {{}} agar kompatibel dengan template klien.
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        // Gunakan kurung ganda {{}} agar sesuai format template klien.
        delimiters: { start: "{{", end: "}}" },
        modules: [imageModule],
        nullGetter(part: any) {
          // Untuk tag gambar, kembalikan string kosong agar placeholder tidak tampil.
          if (
            part.module === "open-xml-templating/docxtemplater-image-module"
          ) {
            return "";
          }
          console.warn("Template variable not found:", part.value);
          return "";
        },
      });

      console.log("[DEBUG] Template data for rendering:", templateData);

      try {
        // Render dokumen dengan data (API baru menggantikan setData + render yang deprecated).
        console.log("Rendering document...");
        doc.render(templateData);
        console.log("Document rendered successfully");
      } catch (error: any) {
        console.error("Error rendering document:", error);
        console.error("Template data keys:", Object.keys(templateData));

        // Tangani multi-error dari docxtemplater.
        if (error.properties && error.properties.errors) {
          const errorMessages = error.properties.errors.map((e: any) => {
            console.error("Docxtemplater error detail:", {
              message: e.message,
              properties: e.properties,
            });
            return `${e.properties?.explanation || e.message || "Unknown error"} (tag: ${e.properties?.id || e.properties?.xtag || "unknown"})`;
          });
          console.error("Docxtemplater errors:", errorMessages);
          throw new Error(
            `Template rendering failed: ${errorMessages.join("; ")}`,
          );
        }

        throw new Error(`Template rendering failed: ${error.message}`);
      }

      // Hasilkan buffer dokumen.
      const buffer = doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
      });

      console.log("Document generated successfully, size:", buffer.length);
      return buffer;
    } catch (error: any) {
      console.error("Error generating document:", error);
      throw new Error(`Document generation failed: ${error.message}`);
    }
  }

  /**
   * Menyiapkan data template dengan nilai default dan pemrosesan tambahan.
   */
  private async prepareTemplateData(
    data: TemplateData,
    digitalFeatures?: DigitalFeatures,
  ): Promise<TemplateData> {
    const currentYear = new Date().getFullYear();
    const currentDate = new Date().toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Nilai default.
    const defaults = {
      kop_universitas:
        "KEMENTERIAN PENDIDIKAN TINGGI, SAINS, DAN TEKNOLOGI\\nUNIVERSITAS DIPONEGORO",
      kop_fakultas: "FAKULTAS SAINS DAN MATEMATIKA",
      kop_alamat:
        "Jalan Prof. Jacob Rais\\nKampus Universitas Diponegoro\\nTembalang Semarang, Kode Pos 50275",
      kop_telepon: "Telp (024) 7474754",
      kop_fax: "Fax (024) 76480690",
      kop_website: "Laman: www.fsm.undip.ac.id",
      kop_email: "Pos-el: fsm(at)undip.ac.id",
      judul_surat: "SURAT-REKOMENDASI",
      // Jangan gunakan placeholder untuk nomor_surat: kosongkan jika belum ditetapkan.
      nomor_surat: data.nomor_surat || "",
      tahun_akademik:
        data.tahun_akademik || `${currentYear}/${currentYear + 1}`,
      // Jangan gunakan tanggal saat ini untuk tanggal_terbit: kosongkan jika belum dipublikasikan.
      tanggal_terbit: data.tanggal_terbit || "",
      jabatan_penandatangan:
        data.jabatan_penandatangan || "Wakil Dekan Akademik dan Kemahasiswaan",
      // keperluan cukup nama beasiswa (template sudah memiliki prefix "Pengajuan Beasiswa").
      keperluan: data.keperluan || "",
    };

    // Gabungkan data input dengan nilai default.
    const processedData: TemplateData = {
      ...defaults,
      ...data,
    };

    // Proses fitur digital.
    if (digitalFeatures) {
      // Proses kode QR.
      if (digitalFeatures.qrCodeData) {
        const qrBuffer = await this.generateQRCode(digitalFeatures.qrCodeData);
        // Ubah ukuran kode QR agar memenuhi area template untuk pemindaian optimal.
        const resizedQr = await this.processQRCode(
          qrBuffer,
          IMAGE_SIZE_CONFIG.qrCode.width,
          IMAGE_SIZE_CONFIG.qrCode.height,
        );
        processedData.qr_code = resizedQr.toString("base64");
      }

      // Tangani tanda tangan dari path file atau base64 langsung.
      if (digitalFeatures.signatureImageBase64) {
        // Proses tanda tangan untuk ukuran maksimal dengan rasio aspek tetap.
        const resizedSig = await this.processSignature(
          digitalFeatures.signatureImageBase64,
          IMAGE_SIZE_CONFIG.signature.width,
          IMAGE_SIZE_CONFIG.signature.height,
        );
        processedData.signature_image = resizedSig.toString("base64");
      } else if (
        digitalFeatures.signatureImagePath &&
        existsSync(digitalFeatures.signatureImagePath)
      ) {
        // Baca file lalu proses tanda tangan agar ukurannya maksimal.
        const fileBuffer = readFileSync(digitalFeatures.signatureImagePath);
        const signatureBuffer = await this.processSignature(
          fileBuffer,
          IMAGE_SIZE_CONFIG.signature.width,
          IMAGE_SIZE_CONFIG.signature.height,
        );
        processedData.signature_image = signatureBuffer.toString("base64");
      }

      // Tangani gambar stempel.
      if (
        digitalFeatures.stampImagePath &&
        existsSync(digitalFeatures.stampImagePath)
      ) {
        const stampBuffer = await this.processImage(
          digitalFeatures.stampImagePath,
          IMAGE_SIZE_CONFIG.stamp.width,
          IMAGE_SIZE_CONFIG.stamp.height,
        );
        processedData.stamp_image = stampBuffer.toString("base64");
      }
    }

    return processedData;
  }

  /**
   * Menyimpan dokumen hasil generate ke file.
   */
  saveDocument(buffer: Buffer, outputPath: string): void {
    try {
      writeFileSync(outputPath, buffer);
    } catch (error) {
      console.error("Error saving document:", error);
      throw new Error("Failed to save document");
    }
  }

  /**
   * Mengambil daftar template yang tersedia.
   */
  getAvailableTemplates(): string[] {
    try {
      const fs = require("fs");
      const files = fs.readdirSync(this.templatesPath);
      return files.filter((file: string) => file.endsWith(".docx"));
    } catch (error) {
      console.error("Error reading templates directory:", error);
      return [];
    }
  }

  /**
   * Memvalidasi data template terhadap skema.
   */
  validateTemplateData(data: TemplateData): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validasi field wajib.
    const requiredFields = [
      "nama_lengkap",
      "nim",
      "tempat_lahir",
      "tanggal_lahir",
      "no_hp",
      "program_studi",
      "semester",
      "ipk",
      "ips",
      "keperluan",
      "nama_penandatangan",
      "nip_penandatangan",
    ];

    for (const field of requiredFields) {
      if (
        !data[field as keyof TemplateData] ||
        data[field as keyof TemplateData] === ""
      ) {
        errors.push(`Field '${field}' is required`);
      }
    }

    // Validasi format.
    if (data.tahun_akademik && !/^\d{4}\/\d{4}$/.test(data.tahun_akademik)) {
      errors.push("tahun_akademik must be in format YYYY/YYYY");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
