/**
 * Fix Template XML Tool
 * ---------------------
 * This script fixes DOCX templates where placeholders are fragmented
 * by Microsoft Word's XML formatting. For example:
 *
 * Bad:  <w:r><w:t>{{na</w:t></w:r><w:r><w:t>ma}}</w:t></w:r>
 * Good: <w:r><w:t>{{nama}}</w:t></w:r>
 *
 * Usage: bun run helper/fixTemplateXml.ts <input.docx> <output.docx>
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import PizZip from "pizzip";

const args = process.argv.slice(2);

if (args.length < 2) {
    console.log(
        "Usage: bun run helper/fixTemplateXml.ts <input.docx> <output.docx>",
    );
    console.log(
        "Example: bun run helper/fixTemplateXml.ts templates/surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-v1.docx templates/surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-v1-fixed.docx",
    );
    process.exit(1);
}

const inputPath = join(process.cwd(), args[0]);
const outputPath = join(process.cwd(), args[1]);

console.log(`📄 Reading template: ${inputPath}`);
const content = readFileSync(inputPath);
const zip = new PizZip(content);

// Files to process in DOCX
const filesToProcess = [
    "word/document.xml",
    "word/header1.xml",
    "word/header2.xml",
    "word/header3.xml",
    "word/footer1.xml",
    "word/footer2.xml",
    "word/footer3.xml",
];

/**
 * Fix fragmented placeholders in XML content
 * This consolidates text runs that contain split placeholders
 */
function fixFragmentedPlaceholders(xml: string): string {
    // Step 1: Extract all text content and rebuild
    // Pattern to match text runs: <w:t ...>content</w:t>
    const textRunPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;

    // First, let's try a simpler approach - merge consecutive text runs
    // Find sequences of <w:r> elements and merge their text content

    // Pattern for placeholder detection
    const placeholderPattern = /\{\{[^}]+\}\}|\{%[^}]+\}/g;

    // Count placeholders before
    const matchesBefore = xml.match(placeholderPattern);
    console.log(`  - Placeholders detected: ${matchesBefore?.length || 0}`);

    // Approach: Find and merge fragmented {{ and }} patterns
    let fixed = xml;

    // Fix fragmented {{ opening tags
    // Pattern: </w:t></w:r><w:r...><w:t...>{ where we need to merge
    fixed = fixed.replace(
        /<\/w:t><\/w:r>(<w:r[^>]*>)?<w:rPr[^>]*>.*?<\/w:rPr>(<w:t[^>]*>)/g,
        "",
    );

    // More aggressive approach: Collect all text and rebuild
    // This is a simplified version - for production, use docxtemplater's InspectModule

    // Simple regex to fix common issues:
    // 1. Merge text that has }} split across runs
    fixed = fixed.replace(
        /\{\{([^}]*)<\/w:t><\/w:r><w:r[^>]*><w:t[^>]*>([^}]*)\}\}/g,
        "{{$1$2}}",
    );

    // 2. Fix cases where the whole placeholder is in multiple runs
    // Match pattern: {...}<</w:t></w:r><w:r><w:t>...}

    // More comprehensive fix using multiple passes
    for (let i = 0; i < 5; i++) {
        // Remove intermediate XML between opening {{ and closing }}
        fixed = fixed.replace(
            /(\{\{[a-z_]*)(<\/w:t><\/w:r>(?:<w:r[^>]*>)?(?:<w:rPr>.*?<\/w:rPr>)?(?:<w:t[^>]*>))([a-z_]*\}\})/gi,
            "$1$3",
        );

        // Also handle {%...%} image placeholders
        fixed = fixed.replace(
            /(\{%[a-z_]*)(<\/w:t><\/w:r>(?:<w:r[^>]*>)?(?:<w:rPr>.*?<\/w:rPr>)?(?:<w:t[^>]*>))([a-z_]*\})/gi,
            "$1$3",
        );
    }

    const matchesAfter = fixed.match(placeholderPattern);
    console.log(`  - Placeholders after fix: ${matchesAfter?.length || 0}`);

    return fixed;
}

// Process each file
let anyChanges = false;
for (const filename of filesToProcess) {
    const file = zip.file(filename);
    if (!file) continue;

    console.log(`\n📝 Processing: ${filename}`);
    const original = file.asText();
    const fixed = fixFragmentedPlaceholders(original);

    if (original !== fixed) {
        zip.file(filename, fixed);
        anyChanges = true;
        console.log(`  ✅ Fixed fragmented placeholders`);
    } else {
        console.log(`  ℹ️ No changes needed`);
    }
}

if (anyChanges) {
    // Generate output
    const output = zip.generate({
        type: "nodebuffer",
        compression: "DEFLATE",
    });

    writeFileSync(outputPath, output);
    console.log(`\n✅ Fixed template saved to: ${outputPath}`);
} else {
    console.log(
        `\n⚠️ No fragmented placeholders found. Template may need manual fixing.`,
    );
    console.log(`\nManual fix instructions:`);
    console.log(`1. Open the template in Microsoft Word`);
    console.log(`2. For each placeholder (like {{nama_lengkap}}):`);
    console.log(`   - Select the entire placeholder text`);
    console.log(`   - Cut it (Ctrl+X)`);
    console.log(`   - Delete any remaining characters`);
    console.log(`   - Type the placeholder fresh without any formatting`);
    console.log(`   - Or paste as plain text (Ctrl+Shift+V)`);
    console.log(`3. Save the document`);
}

// Also display the raw XML near problem areas for debugging
console.log(`\n📋 Debugging - showing document.xml around placeholders...`);
const docXml = zip.file("word/document.xml")?.asText() || "";

// Find and show context around {{ patterns
const problems = [...docXml.matchAll(/\{\{[a-z]{1,4}<\/w:t>/gi)];
if (problems.length > 0) {
    console.log(
        `\n⚠️ Found ${problems.length} potentially fragmented placeholders:`,
    );
    problems.forEach((match, i) => {
        const start = Math.max(0, (match.index || 0) - 20);
        const end = Math.min(docXml.length, (match.index || 0) + 80);
        console.log(`  ${i + 1}. ...${docXml.slice(start, end)}...`);
    });
}
