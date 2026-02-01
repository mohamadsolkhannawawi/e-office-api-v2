import {
    DocumentTemplateService,
    TemplateData,
    DigitalFeatures,
} from "./DocumentTemplateService.js";
import { Prisma } from "../../db/index.js";
import type {
    LetterInstance,
    LetterVerification,
} from "../../generated/prisma/client.js";
import { join } from "path";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { SRB_TEMPLATE_PATH } from "../../config/templates.config.js";

const prisma = Prisma;

export interface SuratRekomendasiData {
    letterInstanceId: string;
    applicationData: any;
    letterNumber?: string;
    signatureUrl?: string;
    stampUrl?: string;
    publishedAt?: Date;
    leadershipConfig?: {
        name: string;
        nip: string;
        jabatan: string;
    };
}

export class SuratRekomendasiTemplateService {
    private templateService: DocumentTemplateService;
    // Template path loaded from centralized config
    private templateName = SRB_TEMPLATE_PATH;

    constructor() {
        this.templateService = new DocumentTemplateService();
    }

    /**
     * Generate surat rekomendasi beasiswa from template
     */
    async generateSuratRekomendasi(
        data: SuratRekomendasiData,
    ): Promise<Buffer> {
        try {
            // Transform application data to template format
            const templateData =
                await this.transformApplicationDataToTemplate(data);

            // Prepare digital features
            const digitalFeatures = await this.prepareDigitalFeatures(data);

            // Generate document
            const documentBuffer = await this.templateService.generateDocument(
                this.templateName,
                templateData,
                digitalFeatures,
            );

            return documentBuffer;
        } catch (error: any) {
            console.error("Error generating surat rekomendasi:", error);
            throw new Error(
                `Failed to generate surat rekomendasi: ${error.message}`,
            );
        }
    }

    /**
     * Transform application data to template format
     * Supports both camelCase and snake_case field names
     */
    private async transformApplicationDataToTemplate(
        data: SuratRekomendasiData,
    ): Promise<TemplateData> {
        const { applicationData, letterNumber, leadershipConfig, publishedAt } =
            data;
        const formData = applicationData.formData || applicationData;

        // Get current academic year
        const currentYear = new Date().getFullYear();
        const academicYear =
            formData.tahunAkademik ||
            formData.tahun_akademik ||
            `${currentYear}/${currentYear + 1}`;

        // Format tanggal lahir - support both formats
        const rawTanggalLahir = formData.tanggalLahir || formData.tanggal_lahir;
        const tanggalLahir = rawTanggalLahir
            ? new Date(rawTanggalLahir).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
              })
            : "";

        // Format tanggal terbit
        const tanggalTerbit = publishedAt
            ? publishedAt.toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
              })
            : new Date().toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
              });

        // Determine keperluan - support both formats
        let keperluan = "Pengajuan Beasiswa";
        const jenisBeasiswa = formData.jenisBeasiswa || formData.jenis_beasiswa;
        const namaBeasiswa = formData.namaBeasiswa || formData.nama_beasiswa;
        if (jenisBeasiswa) {
            keperluan = `Pengajuan Beasiswa ${jenisBeasiswa}`;
        } else if (namaBeasiswa) {
            keperluan = `Pengajuan ${namaBeasiswa}`;
        }

        const templateData: TemplateData = {
            // Nomor surat
            nomor_surat: letterNumber || "/UN7.F8.1/KM/……/20…",

            // Data mahasiswa - support both camelCase and snake_case
            nama_lengkap:
                formData.namaLengkap ||
                formData.nama_lengkap ||
                formData.nama ||
                "",
            nim: formData.nim || "",
            tempat_lahir: formData.tempatLahir || formData.tempat_lahir || "",
            tanggal_lahir: tanggalLahir,
            no_hp: formData.noHp || formData.no_hp || "",
            tahun_akademik: academicYear,
            jurusan: formData.departemen || formData.jurusan || "",
            program_studi:
                formData.programStudi ||
                formData.program_studi ||
                formData.prodi ||
                "",
            semester: formData.semester?.toString() || "",
            ipk: formData.ipk?.toString() || "",
            ips: formData.ips?.toString() || "",
            keperluan: keperluan,

            // Tanggal terbit
            tanggal_terbit: tanggalTerbit,

            // Penandatangan (dari leadership config atau default)
            nama_penandatangan:
                leadershipConfig?.name || "Prof. Dr. Ngadiwiyana, S.Si., M.Si.",
            nip_penandatangan: leadershipConfig?.nip || "196906201990031002",
            jabatan_penandatangan:
                leadershipConfig?.jabatan ||
                "Wakil Dekan Akademik dan Kemahasiswaan",
        };

        return templateData;
    }

    /**
     * Prepare digital features (QR, signature, stamp)
     */
    private async prepareDigitalFeatures(
        data: SuratRekomendasiData,
    ): Promise<DigitalFeatures | undefined> {
        const digitalFeatures: DigitalFeatures = {};

        // QR Code for verification
        if (data.letterNumber) {
            try {
                // Get or create verification code
                const verification = await this.getOrCreateVerification(
                    data.letterInstanceId,
                    data.letterNumber,
                );
                if (verification) {
                    const verificationUrl = `${process.env.FRONTEND_URL}/verify/${verification.code}`;
                    digitalFeatures.qrCodeData = verificationUrl;
                }
            } catch (error) {
                console.error("Error preparing QR code:", error);
                // Continue without QR code
            }
        }

        // Signature
        if (data.signatureUrl) {
            // Check if it's a full URL or relative path
            if (data.signatureUrl.startsWith("http")) {
                // TODO: Download and save locally for processing
                digitalFeatures.signatureImagePath =
                    await this.downloadAndSaveImage(
                        data.signatureUrl,
                        "signature",
                    );
            } else {
                // Local path
                const localPath = join(
                    process.cwd(),
                    "uploads",
                    data.signatureUrl,
                );
                digitalFeatures.signatureImagePath = localPath;
            }
        }

        // Stamp
        if (data.stampUrl) {
            if (data.stampUrl.startsWith("http")) {
                digitalFeatures.stampImagePath =
                    await this.downloadAndSaveImage(data.stampUrl, "stamp");
            } else {
                const localPath = join(process.cwd(), "uploads", data.stampUrl);
                digitalFeatures.stampImagePath = localPath;
            }
        }

        return Object.keys(digitalFeatures).length > 0
            ? digitalFeatures
            : undefined;
    }

    /**
     * Get or create verification code for letter
     */
    private async getOrCreateVerification(
        letterInstanceId: string,
        letterNumber: string,
    ): Promise<LetterVerification | null> {
        try {
            // Check if verification already exists
            let verification = await prisma.letterVerification.findUnique({
                where: { applicationId: letterInstanceId },
            });

            if (!verification) {
                // Generate 12-character verification code
                const code = this.generateVerificationCode();

                verification = await prisma.letterVerification.create({
                    data: {
                        applicationId: letterInstanceId,
                        letterNumber: letterNumber,
                        code: code,
                    },
                });
            }

            return verification;
        } catch (error) {
            console.error("Error getting/creating verification:", error);
            return null;
        }
    }

    /**
     * Generate random verification code
     */
    private generateVerificationCode(length: number = 12): string {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let result = "";
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Download and save image locally for processing
     */
    private async downloadAndSaveImage(
        url: string,
        type: "signature" | "stamp",
    ): Promise<string> {
        try {
            // Ensure temp directory exists
            const tempDir = join(process.cwd(), "uploads", "temp");
            if (!existsSync(tempDir)) {
                mkdirSync(tempDir, { recursive: true });
            }

            // Generate unique filename
            const ext = url.includes(".png") ? "png" : "png";
            const filename = `${type}_${Date.now()}.${ext}`;
            const localPath = join(tempDir, filename);

            // Download image
            console.log(`📥 Downloading ${type} from:`, url);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(
                    `Failed to download ${type}: ${response.status}`,
                );
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            writeFileSync(localPath, buffer);
            console.log(`✅ ${type} saved to:`, localPath);

            return localPath;
        } catch (error) {
            console.error(`Error downloading ${type}:`, error);
            // Return URL as fallback (will be handled by caller)
            return url;
        }
    }

    /**
     * Validate surat rekomendasi data
     * Supports both camelCase and snake_case field names
     */
    validateSuratRekomendasiData(data: SuratRekomendasiData): {
        valid: boolean;
        errors: string[];
    } {
        const errors: string[] = [];

        if (!data.letterInstanceId) {
            errors.push("letterInstanceId is required");
        }

        if (!data.applicationData) {
            errors.push("applicationData is required");
        }

        const formData = data.applicationData?.formData || data.applicationData;
        if (!formData) {
            errors.push("formData is required in applicationData");
        }

        // Validate required form fields - support both camelCase and snake_case
        // Map of field variants: [camelCase, snake_case, aliases...]
        const requiredFieldVariants = [
            ["namaLengkap", "nama_lengkap", "nama"],
            ["nim"],
            ["tempatLahir", "tempat_lahir"],
            ["tanggalLahir", "tanggal_lahir"],
            ["noHp", "no_hp"],
            ["programStudi", "program_studi", "prodi"],
            ["semester"],
            ["ipk"],
            ["ips"],
        ];

        for (const variants of requiredFieldVariants) {
            const hasField = variants.some(
                (v) => formData?.[v] !== undefined && formData?.[v] !== "",
            );
            if (!hasField) {
                errors.push(
                    `formData.${variants[0]} (or ${variants.slice(1).join(", ")}) is required`,
                );
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Get template schema for validation
     */
    async getTemplateSchema(): Promise<any> {
        try {
            const schemaPath = join(
                process.cwd(),
                "templates",
                "surat-rekomendasi-beasiswa",
                "schema.json",
            );
            const schema = require(schemaPath);
            return schema;
        } catch (error) {
            console.error("Error loading template schema:", error);
            return null;
        }
    }
}
