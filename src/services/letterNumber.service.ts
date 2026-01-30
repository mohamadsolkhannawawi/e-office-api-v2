import { Prisma } from "@backend/db/index.ts";
import { generateNextLetterNumber } from "@backend/services/letterNumbering.service.ts";

/**
 * Service untuk generate nomor surat otomatis
 * Format: {nomor}/UN7.F8.1/KM/{month_romawi}/{year}
 * Contoh: 001/UN7.F8.1/KM/I/2026
 *
 * UPDATED: Sekarang menggunakan last published number sebagai base,
 * bukan hanya simple increment dari counter
 */

// Konversi angka ke angka romawi
const toRomanNumeral = (num: number): string => {
    const romanNumerals: [number, string][] = [
        [10, "X"],
        [9, "IX"],
        [5, "V"],
        [4, "IV"],
        [1, "I"],
    ];

    let result = "";
    let remaining = num;

    for (const [value, numeral] of romanNumerals) {
        while (remaining >= value) {
            result += numeral;
            remaining -= value;
        }
    }

    return result;
};

/**
 * Generate nomor surat baru dengan format standar
 * Sekarang menggunakan last published number + 1 sebagai base
 */
export async function generateLetterNumber(
    letterTypeCode: string = "SRB",
): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12

    // Get next number berdasarkan last published
    const next = await generateNextLetterNumber(year, month, letterTypeCode);

    return next.number;
}

/**
 * Preview nomor surat berikutnya (tanpa increment)
 * Menggunakan last published number + 1
 */
export async function previewNextLetterNumber(
    letterTypeCode: string = "SRB",
): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Get next number berdasarkan last published
    const next = await generateNextLetterNumber(year, month, letterTypeCode);

    return next.number;
}

/**
 * Get statistik penomoran untuk tahun tertentu
 */
export async function getLetterNumberStats(year?: number) {
    const targetYear = year || new Date().getFullYear();

    const counters = await Prisma.letterCounter.findMany({
        where: { year: targetYear },
        orderBy: { type: "asc" },
    });

    return counters.map((c) => ({
        type: c.type,
        year: c.year,
        totalIssued: c.count,
        lastUpdated: c.updatedAt,
    }));
}
