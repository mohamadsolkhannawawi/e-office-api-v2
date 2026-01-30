import { Prisma } from "@backend/db/index.ts";

/**
 * Letter Numbering Management Service
 * Mengelola penomoran surat dengan tracking nomor yang sudah dipublish
 */

/**
 * Extract sequence number dari letter number format: {nomor}/UN7.F8.1/KM/{month}/{year}
 */
function extractSequenceNumber(letterNumber: string): number | null {
    const match = letterNumber.match(/^(\d+)\//);
    return match && match[1] ? parseInt(match[1], 10) : null;
}

/**
 * Get daftar semua nomor surat yang sudah dipublish dalam tahun tertentu
 */
export async function getPublishedLetterNumbers(
    year: number,
    type: string = "SRB",
) {
    // Get semua application yang sudah published (status COMPLETED)
    const applications = await Prisma.letterInstance.findMany({
        where: {
            status: "COMPLETED",
            letterNumber: {
                not: null,
            },
        },
        select: {
            id: true,
            letterNumber: true,
            scholarshipName: true,
            publishedAt: true,
            createdAt: true,
        },
        orderBy: {
            letterNumber: "asc",
        },
    });

    // Filter berdasarkan tahun dari letterNumber (format: xxx/UN7.F8.1/KM/X/YYYY)
    const published = applications
        .filter((app: (typeof applications)[0]) => {
            if (!app.letterNumber) return false;
            const yearMatch = app.letterNumber.match(/\/(\d{4})$/);
            return (
                yearMatch && yearMatch[1] && parseInt(yearMatch[1], 10) === year
            );
        })
        .map((app: (typeof applications)[0]) => ({
            applicationId: app.id,
            letterNumber: app.letterNumber!,
            sequence: extractSequenceNumber(app.letterNumber!),
            namaAplikasi: app.scholarshipName || "Surat Rekomendasi Beasiswa",
            publishedAt: app.publishedAt || app.createdAt,
        }))
        .sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0));

    return published;
}

/**
 * Get nomor surat terakhir yang sudah dipublish dalam bulan/tahun tertentu
 */
export async function getLastPublishedNumber(
    year: number,
    month: number,
    type: string = "SRB",
): Promise<{ number: string; sequence: number } | null> {
    // Format bulan romawi untuk matching
    const romanMonths = [
        "",
        "I",
        "II",
        "III",
        "IV",
        "V",
        "VI",
        "VII",
        "VIII",
        "IX",
        "X",
        "XI",
        "XII",
    ];
    const monthRoman = romanMonths[month];

    // Get semua application published dengan letterNumber di bulan/tahun tertentu
    const applications = await Prisma.letterInstance.findMany({
        where: {
            status: "COMPLETED",
            letterNumber: {
                contains: `/${monthRoman}/${year}`,
            },
        },
        select: {
            letterNumber: true,
        },
        orderBy: {
            letterNumber: "desc",
        },
        take: 1,
    });

    const app = applications[0];
    if (!app || !app.letterNumber) {
        return null;
    }

    const sequence = extractSequenceNumber(app.letterNumber);
    return sequence ? { number: app.letterNumber, sequence } : null;
}

/**
 * Generate next letter number berdasarkan last published + 1
 */
export async function generateNextLetterNumber(
    currentYear: number,
    currentMonth: number,
    type: string = "SRB",
): Promise<{ number: string; sequence: number }> {
    // Get last published number di bulan ini
    const last = await getLastPublishedNumber(currentYear, currentMonth, type);
    const nextSequence = (last?.sequence || 0) + 1;

    // Konversi bulan ke romawi
    const romanMonths = [
        "",
        "I",
        "II",
        "III",
        "IV",
        "V",
        "VI",
        "VII",
        "VIII",
        "IX",
        "X",
        "XI",
        "XII",
    ];
    const monthRoman = romanMonths[currentMonth];

    const nextNumber = `${String(nextSequence).padStart(3, "0")}/UN7.F8.1/KM/${monthRoman}/${currentYear}`;

    return {
        number: nextNumber,
        sequence: nextSequence,
    };
}

/**
 * Validate letter number format
 */
export function validateLetterNumberFormat(letterNumber: string): boolean {
    const pattern = /^\d{3}\/UN7\.F8\.1\/KM\/[IVX]+\/\d{4}$/;
    return pattern.test(letterNumber);
}

/**
 * Check if letter number sudah digunakan
 */
export async function isLetterNumberInUse(
    letterNumber: string,
): Promise<boolean> {
    const existing = await Prisma.letterInstance.findFirst({
        where: {
            letterNumber,
            status: "COMPLETED",
        },
    });

    return !!existing;
}

/**
 * Get summary penomoran surat per tahun
 */
export async function getNumberingSummary(year: number) {
    const published = await getPublishedLetterNumbers(year);

    const monthCounts: Record<string, number> = {};
    const monthRoman = [
        "",
        "I",
        "II",
        "III",
        "IV",
        "V",
        "VI",
        "VII",
        "VIII",
        "IX",
        "X",
        "XI",
        "XII",
    ];

    // Count per bulan
    published.forEach((item: any) => {
        const monthMatch = item.letterNumber.match(/\/([IVX]+)\//);
        if (monthMatch) {
            const month = monthMatch[1];
            monthCounts[month] = (monthCounts[month] || 0) + 1;
        }
    });

    return {
        year,
        totalPublished: published.length,
        monthCounts,
        lastPublished:
            published.length > 0 && published[published.length - 1]
                ? published[published.length - 1]!.letterNumber
                : null,
        published,
    };
}
