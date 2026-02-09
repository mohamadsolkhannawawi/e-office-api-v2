import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
// @ts-ignore
import ImageModule from "docxtemplater-image-module-free";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const IMAGE_TAGS = ["signature_image", "stamp_image", "qr_code"];

const templatePath = join(
    process.cwd(),
    "templates/surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-v1.docx",
);
console.log("Loading template:", templatePath);

const content = readFileSync(templatePath);
const zip = new PizZip(content);
let doc = zip.file("word/document.xml")?.asText() ?? "";

// Fix program_studi typo using split/join
doc = doc.split("{{program_studi}").join("{{program_studi}}");

// Convert image tags
for (const img of IMAGE_TAGS) {
    const single = "{%" + img + "}";
    const double = "{{%" + img + "}}";
    if (doc.includes(single)) {
        console.log("Converting:", single, "->", double);
        doc = doc.split(single).join(double);
    }
}

zip.file("word/document.xml", doc);

// Save the fixed XML for inspection
const textContent = doc.replace(/<[^>]+>/g, "");
writeFileSync("debug-template.txt", textContent);
console.log("Saved debug-template.txt for inspection");

// Find all { and } positions
const bracePositions: { char: string; pos: number; context: string }[] = [];
for (let i = 0; i < textContent.length; i++) {
    const ch = textContent[i] ?? "";
    if (ch === "{" || ch === "}") {
        bracePositions.push({
            char: ch,
            pos: i,
            context: textContent.substring(Math.max(0, i - 10), i + 15),
        });
    }
}

// Check for unmatched
let depth = 0;
for (const bp of bracePositions) {
    if (bp.char === "{") depth++;
    else depth--;

    if (depth < 0) {
        console.log("UNMATCHED } at position", bp.pos, "context:", bp.context);
        depth = 0;
    }
}

// Test with docxtemplater
const imageModule = new ImageModule({
    centered: false,
    getImage: () =>
        Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "base64",
        ),
    getSize: () => [100, 100],
});

try {
    const docx = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "{{", end: "}}" },
        modules: [imageModule],
        nullGetter() {
            return "";
        },
    });
    docx.setData({
        nomor_surat: "TEST/123",
        program_studi: "Info",
        nama_lengkap: "Test",
    });
    docx.render();
    console.log("✅ SUCCESS! Template renders correctly!");
} catch (e: any) {
    console.log("❌ ERROR:", e.message);
    if (e.properties?.errors) {
        e.properties.errors.slice(0, 5).forEach((err: any) => {
            console.log(" -", err.properties?.explanation || err.message);
        });
    }
}
