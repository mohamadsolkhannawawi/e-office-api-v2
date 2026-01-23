import crypto from "crypto";
import { Prisma } from "@backend/db/index.ts";

/**
 * QR Code Verification Service
 * - Generate verification code untuk surat yang terbit
 * - Validasi kode verifikasi
 */

/**
 * Generate verification code untuk surat
 * Code: hash dari applicationId + letterNumber + timestamp
 */
export function generateVerificationCode(
    applicationId: string,
    letterNumber: string
): string {
    const timestamp = Date.now().toString();
    const data = `${applicationId}|${letterNumber}|${timestamp}`;
    const hash = crypto.createHash("sha256").update(data).digest("hex");
    // Return 12 karakter pertama (cukup unik dan mudah dibaca)
    return hash.substring(0, 12).toUpperCase();
}

/**
 * Simpan verification record ke database
 */
export async function createVerificationRecord(params: {
    applicationId: string;
    letterNumber: string;
    code: string;
}) {
    // Cek apakah sudah ada
    const existing = await Prisma.letterVerification.findUnique({
        where: { applicationId: params.applicationId },
    });

    if (existing) {
        return existing;
    }

    return await Prisma.letterVerification.create({
        data: {
            applicationId: params.applicationId,
            letterNumber: params.letterNumber,
            code: params.code,
            verifiedCount: 0,
        },
    });
}

/**
 * Verify letter by code
 */
export async function verifyLetter(code: string) {
    const record = await Prisma.letterVerification.findUnique({
        where: { code },
        include: {
            application: {
                include: {
                    letterType: true,
                },
            },
        },
    });

    if (!record) {
        return null;
    }

    // Increment verified count
    await Prisma.letterVerification.update({
        where: { code },
        data: { verifiedCount: { increment: 1 } },
    });

    return {
        isValid: true,
        letterNumber: record.letterNumber,
        issuedAt: record.createdAt,
        verifiedCount: record.verifiedCount + 1,
        application: record.application,
    };
}

/**
 * Generate QR code URL
 */
export function getQRCodeUrl(code: string, baseUrl?: string): string {
    const base =
        baseUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return `${base}/verify/${code}`;
}

/**
 * Generate QR code data URL menggunakan external API
 * (Untuk simplicity, menggunakan QR Server API)
 */
export function getQRCodeImageUrl(code: string, baseUrl?: string): string {
    const verifyUrl = getQRCodeUrl(code, baseUrl);
    // Menggunakan QR Server untuk generate QR code image
    return `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(
        verifyUrl
    )}`;
}
