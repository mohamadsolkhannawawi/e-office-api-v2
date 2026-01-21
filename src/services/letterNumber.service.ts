import { Prisma } from "@backend/db/index.ts";

/**
 * Service untuk generate nomor surat otomatis
 * Format: {nomor}/UN7.F8.1/KM/{month_romawi}/{year}
 * Contoh: 001/UN7.F8.1/KM/I/2026
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
 * Menggunakan atomic increment untuk menghindari race condition
 */
export async function generateLetterNumber(
    letterTypeCode: string = "SRB",
): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12
    const monthRoman = toRomanNumeral(month);

    // Atomic upsert dengan increment
    const counter = await Prisma.letterCounter.upsert({
        where: {
            year_type: { year, type: letterTypeCode },
        },
        update: {
            count: { increment: 1 },
        },
        create: {
            year,
            type: letterTypeCode,
            count: 1,
        },
    });

    // Pad number dengan leading zeros (3 digit)
    const sequence = String(counter.count).padStart(3, "0");

    // Format: {nomor}/UN7.F8.1/KM/{month_romawi}/{year}
    return `${sequence}/UN7.F8.1/KM/${monthRoman}/${year}`;
}

/**
 * Preview nomor surat berikutnya (tanpa increment)
 */
export async function previewNextLetterNumber(
    letterTypeCode: string = "SRB",
): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthRoman = toRomanNumeral(month);

    // Get current counter tanpa increment
    const counter = await Prisma.letterCounter.findUnique({
        where: {
            year_type: { year, type: letterTypeCode },
        },
    });

    const nextCount = (counter?.count || 0) + 1;
    const sequence = String(nextCount).padStart(3, "0");

    return `${sequence}/UN7.F8.1/KM/${monthRoman}/${year}`;
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
