/**
 * PDF Conversion Service
 * Uses LibreOffice headless to convert DOCX files to PDF
 * Applies password protection using qpdf (preferred) or LibreOffice fallback
 *
 * Requirements:
 * - LibreOffice must be installed on the server
 * - Windows: winget install TheDocumentFoundation.LibreOffice
 * - Linux: sudo apt-get install libreoffice
 * - For PDF password protection (recommended):
 *   - Windows: choco install qpdf
 *   - Linux: sudo apt-get install qpdf
 */

import { exec } from "child_process";
import { promisify } from "util";
import { join, dirname, basename } from "path";
import * as fs from "fs";

const execAsync = promisify(exec);

// LibreOffice executable paths by OS
const LIBREOFFICE_PATHS = {
    win32: [
        "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
        "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    ],
    linux: [
        // Custom path via env var (for servers without root, e.g. AppImage extracted)
        process.env.LIBREOFFICE_PATH ?? "",
        "/usr/bin/soffice",
        "/usr/bin/libreoffice",
        // Common extracted AppImage path
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
     * Find LibreOffice installation path
     */
    private findLibreOffice(): void {
        const platform = process.platform as keyof typeof LIBREOFFICE_PATHS;
        const paths = LIBREOFFICE_PATHS[platform] || [];

        for (const path of paths) {
            if (fs.existsSync(path)) {
                this.libreOfficePath = path;
                console.log(
                    `✅ [PdfConversionService] Found LibreOffice at: ${path}`,
                );
                return;
            }
        }

        console.warn(
            "⚠️ [PdfConversionService] LibreOffice not found. PDF conversion will not be available.",
        );
        console.warn(
            "   Install with: winget install TheDocumentFoundation.LibreOffice",
        );
    }

    /**
     * Check if PDF conversion is available
     */
    isAvailable(): boolean {
        return this.libreOfficePath !== null;
    }

    /**
     * Convert a DOCX file to PDF
     * @param docxPath Absolute path to the DOCX file
     * @returns Path to the generated PDF file
     */
    async convertToPdf(docxPath: string): Promise<string> {
        if (!this.libreOfficePath) {
            throw new Error(
                "LibreOffice is not installed. Please install LibreOffice to enable PDF conversion.",
            );
        }

        // Verify input file exists
        if (!fs.existsSync(docxPath)) {
            throw new Error(`DOCX file not found: ${docxPath}`);
        }

        const outputDir = dirname(docxPath);
        const baseNameWithoutExt = basename(docxPath, ".docx");
        const pdfPath = join(outputDir, `${baseNameWithoutExt}.pdf`);

        console.log(`📄 [PdfConversionService] Converting: ${docxPath}`);
        console.log(`📄 [PdfConversionService] Output: ${pdfPath}`);

        // Step 1: Convert DOCX to unencrypted PDF
        console.log(`📄 [PdfConversionService] Converting: ${docxPath}`);
        const convertCommand = `"${this.libreOfficePath}" --headless --convert-to pdf --outdir "${outputDir}" "${docxPath}"`;
        console.log(`🔧 [PdfConversionService] Executing conversion...`);

        try {
            const { stdout, stderr } = await execAsync(convertCommand, {
                timeout: 60000,
            });

            if (stdout)
                console.log(`📝 [PdfConversionService] stdout: ${stdout}`);
            if (stderr)
                console.warn(`⚠️ [PdfConversionService] stderr: ${stderr}`);

            if (!fs.existsSync(pdfPath)) {
                throw new Error(
                    "PDF file was not created. Conversion may have failed.",
                );
            }

            console.log(`✅ [PdfConversionService] PDF created: ${pdfPath}`);
        } catch (error: any) {
            console.error(
                `❌ [PdfConversionService] Conversion failed:`,
                error,
            );
            throw new Error(`PDF conversion failed: ${error.message}`);
        }

        // Step 2: Apply password protection using qpdf (if available)
        try {
            const encryptedPath = pdfPath.replace(".pdf", "_encrypted.pdf");
            const qpdfCommand = `qpdf --encrypt "${PDF_PASSWORD}" "" 256 -- "${pdfPath}" "${encryptedPath}"`;

            await execAsync(qpdfCommand, { timeout: 30000 });

            if (fs.existsSync(encryptedPath)) {
                // Replace original with encrypted version
                fs.unlinkSync(pdfPath);
                fs.renameSync(encryptedPath, pdfPath);
                console.log(
                    `🔒 [PdfConversionService] PDF password protected successfully`,
                );
            }
        } catch (encryptError: any) {
            // qpdf not available - try LibreOffice macro approach as fallback
            console.warn(
                `⚠️ [PdfConversionService] qpdf not available, trying LibreOffice re-export with password...`,
            );

            try {
                // Re-export the existing PDF with password using LibreOffice
                const encCommand = `"${this.libreOfficePath}" --headless --convert-to "pdf:writer_pdf_Export:{'EncryptFile':{'type':'boolean','value':'true'},'DocumentOpenPassword':{'type':'string','value':'${PDF_PASSWORD}'}}" --outdir "${outputDir}" "${pdfPath}"`;
                await execAsync(encCommand, { timeout: 60000 });
                console.log(
                    `🔒 [PdfConversionService] PDF password protected via LibreOffice fallback`,
                );
            } catch (fallbackError: any) {
                console.warn(
                    `⚠️ [PdfConversionService] Password protection not available. PDF will be unencrypted.`,
                );
                console.warn(
                    `   Install qpdf for reliable PDF encryption: apt-get install qpdf (Linux) or choco install qpdf (Windows)`,
                );
            }
        }

        return pdfPath;
    }

    /**
     * Get PDF for a DOCX file, generating if needed
     * Uses caching - if PDF already exists and is newer than DOCX, returns cached version
     */
    async getPdfForDocx(docxPath: string): Promise<string> {
        const pdfPath = docxPath.replace(/\.docx$/i, ".pdf");

        // Check if PDF exists and is up-to-date
        if (fs.existsSync(pdfPath)) {
            const docxStat = fs.statSync(docxPath);
            const pdfStat = fs.statSync(pdfPath);

            if (pdfStat.mtime > docxStat.mtime) {
                console.log(
                    `📎 [PdfConversionService] Using cached PDF: ${pdfPath}`,
                );
                return pdfPath;
            }
        }

        // Generate new PDF
        return this.convertToPdf(docxPath);
    }
}

// Export singleton instance
export const pdfConversionService = new PdfConversionService();
