import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import QRCode from "qrcode";
import sharp from "sharp";
// @ts-ignore - no types for this module
import ImageModule from "docxtemplater-image-module-free";

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
     */
    async generateQRCode(data: string): Promise<Buffer> {
        try {
            const qrBuffer = await QRCode.toBuffer(data, {
                type: "png",
                margin: 1,
                width: 200,
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
     * Process image for template insertion
     */
    async processImage(
        imagePath: string,
        maxWidth: number = 150,
        maxHeight: number = 100,
    ): Promise<Buffer> {
        try {
            const processedImage = await sharp(imagePath)
                .resize(maxWidth, maxHeight, {
                    fit: "inside",
                    withoutEnlargement: true,
                })
                .png()
                .toBuffer();

            return processedImage;
        } catch (error) {
            console.error("Error processing image:", error);
            throw new Error("Failed to process image");
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

            // NOTE: We no longer call normalizeTemplateBraces() here
            // The template is correct as-is and docxtemplater handles XML splitting automatically
            // Calling the normalizer was actually breaking the template!

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
                    // Define sizes for different image types
                    if (tagName === "signature_image") {
                        return [150, 75]; // width x height in pixels
                    }
                    if (tagName === "stamp_image") {
                        return [100, 100];
                    }
                    if (tagName === "qr_code") {
                        return [80, 80];
                    }
                    return [100, 100]; // default size
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

            // Set template data
            doc.setData(templateData);

            console.log("[DEBUG] Template data for rendering:", templateData);

            try {
                // Render document
                console.log("Rendering document...");
                doc.render();
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
            nomor_surat: data.nomor_surat || "/UN7.F8.1/KM/……/20…",
            tahun_akademik:
                data.tahun_akademik || `${currentYear}/${currentYear + 1}`,
            tanggal_terbit: data.tanggal_terbit || currentDate,
            jabatan_penandatangan:
                data.jabatan_penandatangan ||
                "Wakil Dekan Akademik dan Kemahasiswaan",
            keperluan: data.keperluan || "Pengajuan Beasiswa",
        };

        // Merge data with defaults
        const processedData: TemplateData = {
            ...defaults,
            ...data,
        };

        // Process digital features
        if (digitalFeatures) {
            if (digitalFeatures.qrCodeData) {
                const qrBuffer = await this.generateQRCode(
                    digitalFeatures.qrCodeData,
                );
                // Convert to base64 for template insertion
                processedData.qr_code = qrBuffer.toString("base64");
            }

            // Handle signature - either from file path or direct base64
            if (digitalFeatures.signatureImageBase64) {
                processedData.signature_image =
                    digitalFeatures.signatureImageBase64;
            } else if (
                digitalFeatures.signatureImagePath &&
                existsSync(digitalFeatures.signatureImagePath)
            ) {
                const signatureBuffer = await this.processImage(
                    digitalFeatures.signatureImagePath,
                    150,
                    75,
                );
                processedData.signature_image =
                    signatureBuffer.toString("base64");
            }

            if (
                digitalFeatures.stampImagePath &&
                existsSync(digitalFeatures.stampImagePath)
            ) {
                const stampBuffer = await this.processImage(
                    digitalFeatures.stampImagePath,
                    100,
                    100,
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
