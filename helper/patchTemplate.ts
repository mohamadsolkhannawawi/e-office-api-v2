/**
 * Patch template: merge split template tags in-place in the .docx file.
 * Patcher Template: Gabungkan tag template yang terpisah di dalam file .docx
 *
 * This fixes cases where Word splits a {{tag}} across multiple XML runs,
 * Ini memperbaiki kasus di mana Word memisahkan {{tag}} di beberapa XML runs,
 * e.g. <w:t>{{program_studi}</w:t></w:r><w:r ...><w:t>}</w:t></w:r>
 * causing docxtemplater to not recognize the tag.
 * yang menyebabkan docxtemplater tidak mengenali tag tersebut.
 *
 * Fungsi Utama:
 * - Membuka file .docx (format ZIP)
 * - Mendeteksi tag template yang terpecah di beberapa XML run
 * - Menggabungkan run yang terpisah
 * - Menambahkan xml:space="preserve" untuk menjaga spasi
 * - Menyimpan template yang sudah diperbaiki
 *
 * Run: bun run helper/patchTemplate.ts
 */
import PizZip from "pizzip";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// [INPUT] Ambil path template dari argument command line atau gunakan path default
const templateArg = process.argv[2];
const templatePath = templateArg
  ? join(process.cwd(), templateArg)
  : join(
      process.cwd(),
      "templates/surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-v1.docx",
    );

// [LOAD] Baca file DOCX dan ekstrak sebagai ZIP
console.log("Loading template:", templatePath);
const content = readFileSync(templatePath);
const zip = new PizZip(content);

// [EXTRACT] Ambil file XML dokumen utama
const xmlFile = zip.file("word/document.xml");
if (!xmlFile) throw new Error("word/document.xml not found in docx");

// [INIT] Inisialisasi variable untuk tracking
let xml = xmlFile.asText();
let patchCount = 0;

// [REGEX PATTERN] Pola untuk mendeteksi batas XML run yang terpisah
// Mencocokkan: </w:t></w:r> diikuti <w:r><w:rPr optional><w:t>
// Ini adalah titik di mana Word memisahkan bagian dari template tag
const xmlBoundaryPattern =
  /<\/w:t>\s*<\/w:r>\s*<w:r(?:\s[^>]*)?>(?:\s*<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:t(?:\s[^>]*)?>/g;

// [PROCESS PARAGRAPHS] Proses setiap paragraf dalam XML untuk deteksi dan perbaikan
const newXml = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
  // [EXTRACT TEXT] Ekstrak semua bagian teks dari paragraf
  const textParts: string[] = [];
  paragraph.replace(
    /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g,
    (_: string, t: string) => {
      textParts.push(t);
      return _;
    },
  );

  // [CHECK] Gabungkan semua teks untuk pengecekan keseimbangan brace
  const fullText = textParts.join("");
  if (!fullText.includes("{")) return paragraph;

  // [BALANCE CHECK] Periksa apakah ada brace yang tidak seimbang
  // Tanda bahwa tag terpecah di beberapa XML run
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

  patchCount++;

  // [MERGE] Gabungkan text runs dengan menghapus batas-batas XML run
  const merged = paragraph.replace(xmlBoundaryPattern, "");

  // [PRESERVE SPACE] Tambahkan xml:space="preserve" untuk menjaga spasi di sekitar tag
  return merged.replace(
    /<w:t(?![^>]*xml:space="preserve")([^>]*)>([^<]*\{\{)/g,
    (_, attrs, content) => `<w:t xml:space="preserve"${attrs}>${content}`,
  );
});

// [CHECK RESULT] Cek apakah ada tag yang terpecah ditemukan
if (patchCount === 0) {
  console.log("[SUCCESS] No split tags found — template is already clean.");
  process.exit(0);
}

// [SAVE] Simpan XML yang sudah diperbaiki ke dalam ZIP
zip.file("word/document.xml", newXml);

// [WRITE] Tulis file DOCX yang sudah diperbaiki ke disk
const patched = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
writeFileSync(templatePath, patched);

console.log(
  `[SUCCESS] Patched ${patchCount} paragraph(s) with split template tags.`,
);
console.log("[INFO] Template saved:", templatePath);

// [VERIFY] Verifikasi bahwa tidak ada tag dengan brace tunggal tersisa
const verify = new PizZip(readFileSync(templatePath));
const verifyXml = verify.file("word/document.xml")!.asText();
const remaining = verifyXml.match(/\{\{(\w+)\}(?!\})/g);
if (remaining) {
  console.warn("[WARNING] Remaining single-brace tags after patch:", remaining);
} else {
  console.log(
    "[SUCCESS] Verification passed — no more single-brace tag typos.",
  );
}
