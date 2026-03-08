/**
 * Patch template: merge split template tags in-place in the .docx file.
 *
 * This fixes cases where Word splits a {{tag}} across multiple XML runs,
 * e.g. <w:t>{{program_studi}</w:t></w:r><w:r ...><w:t>}</w:t></w:r>
 * causing docxtemplater to not recognize the tag.
 *
 * Run: bun run helper/patchTemplate.ts
 */
import PizZip from "pizzip";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const templateArg = process.argv[2];
const templatePath = templateArg
    ? join(process.cwd(), templateArg)
    : join(
          process.cwd(),
          "templates/surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-v1.docx",
      );

console.log("Loading template:", templatePath);
const content = readFileSync(templatePath);
const zip = new PizZip(content);

const xmlFile = zip.file("word/document.xml");
if (!xmlFile) throw new Error("word/document.xml not found in docx");

let xml = xmlFile.asText();
let patchCount = 0;

// Pattern: merges adjacent runs where the split occurs between </w:t></w:r> and <w:r...><w:rPr...><w:t>
// Only targets paragraphs that contain a template tag with unbalanced braces.
const xmlBoundaryPattern =
    /<\/w:t>\s*<\/w:r>\s*<w:r(?:\s[^>]*)?>(?:\s*<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:t(?:\s[^>]*)?>/g;

const newXml = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    // Extract text node content to check for unbalanced braces
    const textParts: string[] = [];
    paragraph.replace(
        /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g,
        (_: string, t: string) => {
            textParts.push(t);
            return _;
        },
    );

    const fullText = textParts.join("");
    if (!fullText.includes("{")) return paragraph;

    // Check for unbalanced { }
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

    // Merge text runs by removing XML run boundaries
    const merged = paragraph.replace(xmlBoundaryPattern, "");

    // Ensure xml:space="preserve" on any <w:t> that contains static text + {{tag}}
    return merged.replace(
        /<w:t(?![^>]*xml:space="preserve")([^>]*)>([^<]*\{\{)/g,
        (_, attrs, content) => `<w:t xml:space="preserve"${attrs}>${content}`,
    );
});

if (patchCount === 0) {
    console.log("✅ No split tags found — template is already clean.");
    process.exit(0);
}

zip.file("word/document.xml", newXml);

const patched = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
writeFileSync(templatePath, patched);

console.log(`✅ Patched ${patchCount} paragraph(s) with split template tags.`);
console.log("Template saved:", templatePath);

// Verify
const verify = new PizZip(readFileSync(templatePath));
const verifyXml = verify.file("word/document.xml")!.asText();
const remaining = verifyXml.match(/\{\{(\w+)\}(?!\})/g);
if (remaining) {
    console.warn("⚠️  Remaining single-brace tags after patch:", remaining);
} else {
    console.log("✅ Verification passed — no more single-brace tag typos.");
}
