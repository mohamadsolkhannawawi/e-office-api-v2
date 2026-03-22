import { Prisma } from "@backend/db/index.ts";

/**
 * Layanan manajemen penomoran surat.
 * Mengelola penomoran surat dengan pelacakan nomor yang sudah dipublikasikan.
 */

/**
 * Mengambil nomor urut dari format nomor surat: {nomor}/UN7.F8.1/KM/{month}/{year}
 */
function extractSequenceNumber(letterNumber: string): number | null {
  const match = letterNumber.match(/^(\d+)\//);
  return match && match[1] ? parseInt(match[1], 10) : null;
}

/**
 * Mengambil daftar semua nomor surat yang sudah dipublikasikan pada tahun tertentu.
 */
export async function getPublishedLetterNumbers(
  year: number,
  type: string = "SRB",
) {
  // Ambil semua pengajuan yang sudah dipublikasikan (status COMPLETED).
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

  // Filter berdasarkan tahun pada letterNumber (format: xxx/UN7.F8.1/KM/X/YYYY).
  const published = applications
    .filter((app: (typeof applications)[0]) => {
      if (!app.letterNumber) return false;
      const yearMatch = app.letterNumber.match(/\/(\d{4})$/);
      return yearMatch && yearMatch[1] && parseInt(yearMatch[1], 10) === year;
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
 * Mengambil nomor surat terakhir yang sudah dipublikasikan pada bulan/tahun tertentu.
 */
export async function getLastPublishedNumber(
  year: number,
  month: number,
  type: string = "SRB",
): Promise<{ number: string; sequence: number } | null> {
  // Format bulan Romawi untuk pencocokan.
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

  // Ambil semua pengajuan yang dipublikasikan dengan letterNumber pada bulan/tahun tertentu.
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
 * Membuat nomor surat berikutnya berdasarkan nomor terakhir yang dipublikasikan + 1.
 */
export async function generateNextLetterNumber(
  currentYear: number,
  currentMonth: number,
  type: string = "SRB",
): Promise<{ number: string; sequence: number }> {
  // Ambil nomor terakhir yang dipublikasikan pada bulan ini.
  const last = await getLastPublishedNumber(currentYear, currentMonth, type);
  const nextSequence = (last?.sequence || 0) + 1;

  // Konversi bulan ke angka Romawi.
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
 * Memvalidasi format nomor surat.
 */
export function validateLetterNumberFormat(letterNumber: string): boolean {
  const pattern = /^\d{3}\/UN7\.F8\.1\/KM\/[IVX]+\/\d{4}$/;
  return pattern.test(letterNumber);
}

/**
 * Memeriksa apakah nomor surat sudah digunakan.
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
 * Mengambil ringkasan penomoran surat per tahun.
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

  // Hitung jumlah per bulan.
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
