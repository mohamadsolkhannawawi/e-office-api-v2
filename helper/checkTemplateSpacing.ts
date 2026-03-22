/**
 * Template spacing checker - Pemeriksa Spasi Template DOCX
 *
 * Mendeteksi kasus di mana teks label statis langsung berdampingan dengan {{placeholder}}
 * tanpa pemisah whitespace dalam XML .docx. Ini menyebabkan output yang direndering
 * menggabungkan label dan nilai (misalnya "JurusanS1 Informatika").
 *
 * Jalankan: bun run helper/checkTemplateSpacing.ts
 *
 * Fungsi utama:
 * - Membaca template .docx dari folder templates
 * - Mengekstrak XML dari dalam file .docx (format ZIP)
 * - Memeriksa setiap paragraf untuk masalah spacing
 * - Menampilkan hasil dengan konteks masalah yang ditemukan
 */
import PizZip from "pizzip";
import { readFileSync } from "fs";
import { join } from "path";

// Path ke template DOCX yang akan dicek
const templatePath = join(
  process.cwd(),
  "templates/surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-v1.docx",
);

console.log("Loading template:", templatePath);

// Baca file DOCX (format ZIP) dan ekstrak kontennya
const content = readFileSync(templatePath);
const zip = new PizZip(content);

// Daftar file XML yang perlu dicek dalam dokumen Word
// Mencakup: dokumen utama, header, dan footer
const xmlFiles = [
  "word/document.xml",
  "word/header1.xml",
  "word/header2.xml",
  "word/footer1.xml",
  "word/footer2.xml",
];

// Flag untuk menandai apakah ada masalah yang ditemukan
let issueFound = false;

// [LOOP] Iterasi setiap file XML untuk pemeriksaan
for (const fileName of xmlFiles) {
  const xmlFile = zip.file(fileName);
  if (!xmlFile) continue;

  const xmlContent = xmlFile.asText();

  // [EKSTRAK] Dapatkan semua paragraf dari XML
  // Setiap paragraf dibungkus dengan tag <w:p>...</w:p>
  const paragraphs = xmlContent.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? [];

  for (const paragraph of paragraphs) {
    // [PARSING] Bangun teks lengkap dengan memproses elemen XML dalam urutan dokumen.
    // <w:br/> (line break) dan <w:tab/> (tab) diperlakukan sebagai pemisah whitespace.
    // Catatan penting: Elemen ini adalah sibling dari <w:t>, bukan di dalamnya,
    // jadi harus diinterleave selama traversal daripada diganti sebelum ekstraksi.
    let fullText = "";
    // [REGEX] Pola untuk mencocokkan: line break, tab, atau teks dalam tag <w:t>
    // Capture group (tok[1]) berisi konten dalam tag <w:t>
    const tokenPattern =
      /<w:br(?:\s[^>]*)?\/>|<w:tab(?:\s[^>]*)?\/>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let tok: RegExpExecArray | null;

    // [ITERASI] Proses setiap token (teks atau pemisah) dalam urutan kemunculannya
    while ((tok = tokenPattern.exec(paragraph)) !== null) {
      // Jika token adalah line break atau tab, tambahkan spasi sebagai pemisah visual
      if (tok[0].startsWith("<w:br") || tok[0].startsWith("<w:tab")) {
        fullText += " "; // line break / tab = visual separator
      } else if (tok[1] !== undefined && !tok[1].includes("%")) {
        // Jika token adalah teks (dan bukan komposisi persen untuk placeholder)
        fullText += tok[1];
      }
    }

    // [FILTER] Lewatkan paragraf yang tidak mengandung placeholder
    // (placeholder ditandai dengan format {{...}})
    if (!fullText.includes("{{")) continue;

    // [DETEKSI 1] Cari karakter non-whitespace langsung sebelum {{
    // Pola: karakter apa pun yang tidak spasi diikuti langsung oleh {{
    // Contoh masalah: "JurusanS1{{major}}" (tidak ada spasi antara "JurusanS1" dan "{{major}}")
    const adjacentLabelPattern = /\S\{\{/g;
    let match: RegExpExecArray | null;

    // [LOOP DETEKSI 1] Iterasi setiap kemunculan label yang menempel di placeholder
    while ((match = adjacentLabelPattern.exec(fullText)) !== null) {
      const position = match.index;
      // [KONTEKS] Ambil teks sekitar masalah untuk ditampilkan kepada user (20 karakter sebelum, 40 sesudah)
      const context = fullText.substring(
        Math.max(0, position - 20),
        Math.min(fullText.length, position + 40),
      );

      // [IDENTIFIKASI] Cari nama placeholder yang bermasalah
      const placeholderMatch = fullText
        .substring(position + 1)
        .match(/\{\{(\w+)\}\}/);
      const placeholderName = placeholderMatch
        ? placeholderMatch[1]
        : "unknown";

      // [LAPORAN] Tampilkan peringatan dengan detail masalah
      console.warn(
        `\n[WARNING] [${fileName}] Label directly adjacent to placeholder without spacing:`,
      );
      console.warn(`   Placeholder : {{${placeholderName}}}`);
      console.warn(`   Context     : "...${context}..."`);
      console.warn(
        `   Impact      : Text before "{{" will appear without separator in output document`,
      );

      issueFound = true;
    }

    // [DETEKSI 2] Cari placeholder yang langsung diikuti huruf atau angka (value menyatu dengan label selanjutnya)
    // Catatan: Tanda baca yang disengaja setelah }} (koma, kurung tutup, titik dua, dll) TIDAK ditandai sebagai error
    // Contoh masalah: "{{value}}berikutnya" (tidak ada spasi antara "{{value}}" dan "berikutnya")
    const trailingLabelPattern = /\}\}[A-Za-z0-9]/g;

    // [LOOP DETEKSI 2] Iterasi setiap kemunculan placeholder yang menyatu dengan teks selanjutnya
    while ((match = trailingLabelPattern.exec(fullText)) !== null) {
      const position = match.index;
      // [KONTEKS] Ambil teks sekitar masalah untuk ditampilkan kepada user
      const context = fullText.substring(
        Math.max(0, position - 20),
        Math.min(fullText.length, position + 40),
      );

      // [IDENTIFIKASI] Cari nama placeholder yang bermasalah
      const placeholderMatch = fullText
        .substring(0, position + 2)
        .match(/\{\{(\w+)\}\}$/);
      const placeholderName = placeholderMatch
        ? placeholderMatch[1]
        : "unknown";

      // [LAPORAN] Tampilkan peringatan dengan detail masalah
      console.warn(
        `\n[WARNING] [${fileName}] Placeholder directly followed by text without spacing:`,
      );
      console.warn(`   Placeholder : {{${placeholderName}}}`);
      console.warn(`   Context     : "...${context}..."`);
      issueFound = true;
    }
  }
}

// [HASIL] Tampilkan ringkasan hasil pemeriksaan
if (!issueFound) {
  console.log(
    "\n[SUCCESS] No spacing issues found between labels and placeholders.",
  );
} else {
  console.log(
    "\n[SOLUTION] Open the template .docx in Word and add spacing (or move the placeholder to a separate table column) between the label text and {{placeholder}}.",
  );
}
