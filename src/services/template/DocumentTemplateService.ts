import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import QRCode from "qrcode";
import sharp from "sharp";
// @ts-ignore - no types for this module
import ImageModule from "docxtemplater-image-module-free";

/**
 * Image size configuration (in pixels)
 * Adjust these values to change the size of generated images in documents
 *
 * NOTE: Higher resolution = better quality but larger file size
 * The images will be scaled proportionally to fit within these dimensions
 *
 * Conversion: 1 cm ≈ 37.8 pixels at 96 DPI
 * For print quality (300 DPI): 1 cm ≈ 118 pixels
 */
export const IMAGE_SIZE_CONFIG = {
    // Signature: 6cm x 3cm (wider than tall, typical signature ratio)
    // Using print quality resolution
    signature: {
        width: 227, // ~6cm at 96 DPI
        height: 113, // ~3cm at 96 DPI
    },
    // Stamp: 4cm x 4cm (square)
    stamp: {
        width: 151, // ~4cm at 96 DPI
        height: 151, // ~4cm at 96 DPI
    },
    // QR Code: 3cm x 3cm (square, needs to be readable)
    qrCode: {
        width: 113, // ~3cm at 96 DPI
        height: 113, // ~3cm at 96 DPI
    },
    // Default for unknown images
    default: {
        width: 150,
        height: 150,
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

    // Digital features (optional)
    qr_code?: string;
    signature_image?: string;
    stamp_image?: string;
}

export interface DigitalFeatures {
    qrCodeData?: string;
    signatureImagePath?: string;
    signatureImageBase64?: string; // For direct base64 signature data
    stampImagePath?: string;
    verificationUrl?: string; // URL for document verification
}

export class DocumentTemplateService {
    private templatesPath: string;

    constructor() {
        this.templatesPath = join(process.cwd(), "templates");
    }

    /**
     * Generate QR Code for document verification
     * Using high resolution for better quality when inserted into documents
     */
    async generateQRCode(data: string): Promise<Buffer> {
        try {
            const qrBuffer = await QRCode.toBuffer(data, {
                type: "png",
                margin: 1,
                width: 400, // High resolution for better quality
                errorCorrectionLevel: "M", // Medium error correction
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
     * Process image for template insertion (from file path)
     * Uses fit: "inside" to scale proportionally without cropping
     */
    async processImage(
        imagePath: string,
        maxWidth: number = 150,
        maxHeight: number = 100,
    ): Promise<Buffer> {
        try {
            const processedImage = await sharp(imagePath)
                .resize(maxWidth, maxHeight, {
                    fit: "inside", // Scale to fit inside bounds, no cropping
                    withoutEnlargement: false, // Allow enlargement if needed
                })
                .png({ quality: 100, compressionLevel: 9 }) // Max lossless compression
                .toBuffer();

            return processedImage;
        } catch (error) {
            console.error("Error processing image:", error);
            throw new Error("Failed to process image");
        }
    }

    /**
     * Process image from Buffer or base64 string
     * Resizes the image to fit within maxWidth x maxHeight while maintaining aspect ratio
     * Uses fit: "inside" to ensure no cropping occurs
     */
    async processImageBuffer(
        input: Buffer | string,
        maxWidth: number,
        maxHeight: number,
    ): Promise<Buffer> {
        try {
            // If input is base64 string, convert to Buffer
            const inputBuffer =
                typeof input === "string"
                    ? Buffer.from(input, "base64")
                    : input;

            const processedImage = await sharp(inputBuffer)
                .resize(maxWidth, maxHeight, {
                    fit: "inside", // Scale to fit inside bounds, no cropping
                    withoutEnlargement: false, // Allow enlargement if needed
                })
                .png({ quality: 100, compressionLevel: 9 }) // Max lossless compression
                .toBuffer();

            return processedImage;
        } catch (error) {
            console.error("Error processing image buffer:", error);
            throw new Error("Failed to process image buffer");
        }
    }

    /**
     * Load template file
     */
    private loadTemplate(templateName: string): Buffer {
        const templatePath = join(this.templatesPath, templateName);

        if (!existsSync(templatePath)) {
            throw new Error(`Template file not found: ${templatePath}`);
        }

        return readFileSync(templatePath);
    }

    /**
     * Known template variables - used to validate and normalize placeholders
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
        // Image variables (handled by image module)
        "signature_image",
        "stamp_image",
        "qr_code",
    ];

    /**
     * Convert double braces {{name}} to single braces {name} in template
     * This allows templates using {{}} format to work with docxtemplater 3.67+
     * Image tags {%name} are kept as-is
     * Also fixes common typos like {{name} (missing closing brace)
     * Processes all word/*.xml files to handle headers/footers
     */
    private normalizeTemplateBraces(zip: PizZip): void {
        // Process all word XML files
        const xmlFiles = [
            "word/document.xml",
            "word/header1.xml",
            "word/header2.xml",
            "word/header3.xml",
            "word/footer1.xml",
            "word/footer2.xml",
            "word/footer3.xml",
        ];

        // Image tags that need to be converted from {%...} to {{%...}}
        const IMAGE_TAGS = ["signature_image", "stamp_image", "qr_code"];

        let totalModified = 0;

        for (const fileName of xmlFiles) {
            const xmlFile = zip.file(fileName);
            if (!xmlFile) continue;

            let content = xmlFile.asText();
            let fileModified = false;

            // Fix variable tags: {{variable} -> {{variable}}
            // Use regex to find {{varname} patterns and add missing closing brace
            for (const varName of this.KNOWN_VARIABLES) {
                // Match {{varName} but NOT {{varName}} (negative lookahead for second )
                const regex = new RegExp(`\\{\\{${varName}\\}(?!\\})`, "g");
                const replacement = `{{${varName}}}`;

                if (regex.test(content)) {
                    console.log(
                        `Fixing in ${fileName}: {{${varName}} -> {{${varName}}}`,
                    );
                    // Reset regex lastIndex and replace
                    content = content.replace(
                        new RegExp(`\\{\\{${varName}\\}(?!\\})`, "g"),
                        replacement,
                    );
                    fileModified = true;
                }
            }

            // Convert image tags from {%tag} to {{%tag}} for double-brace delimiter compatibility
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
            console.log(
                `Template braces normalized in ${totalModified} file(s)`,
            );
        }
    }

    /**
     * Generate document from template
     */
    async generateDocument(
        templateName: string,
        data: TemplateData,
        digitalFeatures?: DigitalFeatures,
    ): Promise<Buffer> {
        try {
            console.log("Loading template:", templateName);

            // Load template
            const templateBuffer = this.loadTemplate(templateName);
            const zip = new PizZip(templateBuffer);

            // NOTE: Template normalization is DISABLED
            // The normalizer breaks templates when tags are split across XML elements
            // (e.g., {{program</w:t></w:r><w:r><w:t>_studi}})
            // Instead, the DOCX template must be manually updated to:
            // 1. Use {{%signature_image}} format for images (not {%signature_image})
            // 2. Ensure all variable braces are complete {{variable}}
            // this.normalizeTemplateBraces(zip);

            // Prepare data with defaults (includes processing images)
            console.log("Preparing template data...");
            const templateData = await this.prepareTemplateData(
                data,
                digitalFeatures,
            );
            console.log("Template data prepared:", Object.keys(templateData));

            // Configure image module for handling {%image} tags
            const imageModuleOptions = {
                centered: false,
                getImage: (tagValue: string) => {
                    // tagValue is the base64 string stored in templateData
                    if (tagValue && tagValue.length > 0) {
                        return Buffer.from(tagValue, "base64");
                    }
                    // Return empty/transparent 1x1 pixel PNG if no image
                    return Buffer.from(
                        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                        "base64",
                    );
                },
                getSize: (img: Buffer, tagValue: string, tagName: string) => {
                    // If no image data, return minimal size so it's invisible
                    if (!tagValue || tagValue.length === 0) {
                        return [1, 1]; // Effectively invisible
                    }
                    // Use configurable sizes from IMAGE_SIZE_CONFIG
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

            // Initialize docxtemplater with image module
            // NOTE: docxtemplater 3.67+ uses single braces {} by default
            // Configure delimiters to use double braces {{}} for client template compatibility
            const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
                // Use double braces {{}} to match client template format
                delimiters: { start: "{{", end: "}}" },
                modules: [imageModule],
                nullGetter(part: any) {
                    // For image tags, return empty string to avoid showing placeholder
                    if (
                        part.module ===
                        "open-xml-templating/docxtemplater-image-module"
                    ) {
                        return "";
                    }
                    console.warn("Template variable not found:", part.value);
                    return "";
                },
            });

            console.log("[DEBUG] Template data for rendering:", templateData);

            try {
                // Render document with data (new API - replaces deprecated setData + render)
                console.log("Rendering document...");
                doc.render(templateData);
                console.log("Document rendered successfully");
            } catch (error: any) {
                console.error("Error rendering document:", error);
                console.error("Template data keys:", Object.keys(templateData));

                // Handle multi-error from docxtemplater
                if (error.properties && error.properties.errors) {
                    const errorMessages = error.properties.errors.map(
                        (e: any) => {
                            console.error("Docxtemplater error detail:", {
                                message: e.message,
                                properties: e.properties,
                            });
                            return `${e.properties?.explanation || e.message || "Unknown error"} (tag: ${e.properties?.id || e.properties?.xtag || "unknown"})`;
                        },
                    );
                    console.error("Docxtemplater errors:", errorMessages);
                    throw new Error(
                        `Template rendering failed: ${errorMessages.join("; ")}`,
                    );
                }

                throw new Error(`Template rendering failed: ${error.message}`);
            }

            // Generate buffer
            const buffer = doc.getZip().generate({
                type: "nodebuffer",
                compression: "DEFLATE",
            });

            console.log(
                "Document generated successfully, size:",
                buffer.length,
            );
            return buffer;
        } catch (error: any) {
            console.error("Error generating document:", error);
            throw new Error(`Document generation failed: ${error.message}`);
        }
    }

    /**
     * Prepare template data with defaults and processing
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

        // Default values
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
            // Don't use placeholder for nomor_surat - empty if not assigned
            nomor_surat: data.nomor_surat || "",
            tahun_akademik:
                data.tahun_akademik || `${currentYear}/${currentYear + 1}`,
            // Don't use current date for tanggal_terbit - empty if not published
            tanggal_terbit: data.tanggal_terbit || "",
            jabatan_penandatangan:
                data.jabatan_penandatangan ||
                "Wakil Dekan Akademik dan Kemahasiswaan",
            // keperluan is just the scholarship name (template has "Pengajuan Beasiswa" prefix)
            keperluan: data.keperluan || "",
        };

        // Merge data with defaults
        const processedData: TemplateData = {
            ...defaults,
            ...data,
        };

        // Process digital features
        if (digitalFeatures) {
            // Process QR Code
            if (digitalFeatures.qrCodeData) {
                const qrBuffer = await this.generateQRCode(
                    digitalFeatures.qrCodeData,
                );
                // Resize QR code to configured size
                const resizedQr = await this.processImageBuffer(
                    qrBuffer,
                    IMAGE_SIZE_CONFIG.qrCode.width,
                    IMAGE_SIZE_CONFIG.qrCode.height,
                );
                processedData.qr_code = resizedQr.toString("base64");
            }

            // Handle signature - either from file path or direct base64
            if (digitalFeatures.signatureImageBase64) {
                // Resize base64 signature to configured size
                const resizedSig = await this.processImageBuffer(
                    digitalFeatures.signatureImageBase64,
                    IMAGE_SIZE_CONFIG.signature.width,
                    IMAGE_SIZE_CONFIG.signature.height,
                );
                processedData.signature_image = resizedSig.toString("base64");
            } else if (
                digitalFeatures.signatureImagePath &&
                existsSync(digitalFeatures.signatureImagePath)
            ) {
                const signatureBuffer = await this.processImage(
                    digitalFeatures.signatureImagePath,
                    IMAGE_SIZE_CONFIG.signature.width,
                    IMAGE_SIZE_CONFIG.signature.height,
                );
                processedData.signature_image =
                    signatureBuffer.toString("base64");
            }

            // Handle stamp image
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
     * Save generated document to file
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
     * Get available templates
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
     * Validate template data against schema
     */
    validateTemplateData(data: TemplateData): {
        valid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        // Required fields validation
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

        // Format validations
        if (
            data.tahun_akademik &&
            !/^\d{4}\/\d{4}$/.test(data.tahun_akademik)
        ) {
            errors.push("tahun_akademik must be in format YYYY/YYYY");
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }
}
