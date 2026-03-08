/**
 * Template spacing checker
 *
 * Detects cases where a static label text is immediately adjacent to a {{placeholder}}
 * without any whitespace separator in the .docx XML. This causes the rendered output
 * to concatenate the label and value (e.g. "JurusanS1 Informatika").
 *
 * Run: bun run helper/checkTemplateSpacing.ts
 */
import PizZip from "pizzip";
import { readFileSync } from "fs";
import { join } from "path";

const templatePath = join(
    process.cwd(),
    "templates/surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-v1.docx",
);

console.log("Loading template:", templatePath);
const content = readFileSync(templatePath);
const zip = new PizZip(content);

const xmlFiles = [
    "word/document.xml",
    "word/header1.xml",
    "word/header2.xml",
    "word/footer1.xml",
    "word/footer2.xml",
];

let issueFound = false;

for (const fileName of xmlFiles) {
    const xmlFile = zip.file(fileName);
    if (!xmlFile) continue;

    const xmlContent = xmlFile.asText();

    // Extract all paragraphs
    const paragraphs = xmlContent.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? [];

    for (const paragraph of paragraphs) {
        // Build full text by processing XML elements in document order.
        // <w:br/> and <w:tab/> are treated as whitespace separators — they are
        // sibling elements of <w:t>, not inside it, so they must be interleaved
        // during traversal rather than replaced before extraction.
        let fullText = "";
        const tokenPattern =
            /<w:br(?:\s[^>]*)?\/>|<w:tab(?:\s[^>]*)?\/>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
        let tok: RegExpExecArray | null;
        while ((tok = tokenPattern.exec(paragraph)) !== null) {
            if (tok[0].startsWith("<w:br") || tok[0].startsWith("<w:tab")) {
                fullText += " "; // line break / tab = visual separator
            } else if (tok[1] !== undefined && !tok[1].includes("%")) {
                fullText += tok[1];
            }
        }

        // Skip paragraphs with no placeholders
        if (!fullText.includes("{{")) continue;

        // Detect: non-whitespace character immediately before {{
        // Pattern: any non-space char followed directly by {{
        const adjacentLabelPattern = /\S\{\{/g;
        let match: RegExpExecArray | null;

        while ((match = adjacentLabelPattern.exec(fullText)) !== null) {
            const position = match.index;
            const context = fullText.substring(
                Math.max(0, position - 20),
                Math.min(fullText.length, position + 40),
            );

            // Find which placeholder it is
            const placeholderMatch = fullText
                .substring(position + 1)
                .match(/\{\{(\w+)\}\}/);
            const placeholderName = placeholderMatch
                ? placeholderMatch[1]
                : "unknown";

            console.warn(
                `\n⚠️  [${fileName}] Label langsung menempel ke placeholder tanpa spasi:`,
            );
            console.warn(`   Placeholder : {{${placeholderName}}}`);
            console.warn(`   Konteks     : "...${context}..."`);
            console.warn(
                `   Dampak      : Teks sebelum "{{" akan ikut muncul tanpa pemisah di dokumen hasil`,
            );

            issueFound = true;
        }

        // Also detect: placeholder immediately followed by a letter or digit (value runs into next label).
        // Intentional punctuation after }} (comma, closing paren, colon, etc.) is NOT flagged.
        const trailingLabelPattern = /\}\}[A-Za-z0-9]/g;
        while ((match = trailingLabelPattern.exec(fullText)) !== null) {
            const position = match.index;
            const context = fullText.substring(
                Math.max(0, position - 20),
                Math.min(fullText.length, position + 40),
            );

            // Find which placeholder it is
            const placeholderMatch = fullText
                .substring(0, position + 2)
                .match(/\{\{(\w+)\}\}$/);
            const placeholderName = placeholderMatch
                ? placeholderMatch[1]
                : "unknown";

            console.warn(
                `\n⚠️  [${fileName}] Placeholder langsung diikuti teks tanpa spasi:`,
            );
            console.warn(`   Placeholder : {{${placeholderName}}}`);
            console.warn(`   Konteks     : "...${context}..."`);
            issueFound = true;
        }
    }
}

if (!issueFound) {
    console.log(
        "\n✅ Tidak ditemukan masalah spacing antara label dan placeholder.",
    );
} else {
    console.log(
        "\n💡 Solusi: Buka template .docx di Word dan tambahkan spasi (atau pindahkan placeholder ke kolom tabel terpisah) di antara teks label dan {{placeholder}}.",
    );
}
