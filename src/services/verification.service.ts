import crypto from "crypto";
import { Prisma } from "@backend/db/index.ts";
import { config } from "@backend/config.ts";

/**
 * Layanan verifikasi kode QR.
 * - Membuat kode verifikasi untuk surat yang terbit
 * - Memvalidasi kode verifikasi
 */

/**
 * Membuat kode verifikasi untuk surat.
 * Kode dibentuk dari hash: applicationId + letterNumber + timestamp.
 */
export function generateVerificationCode(
  applicationId: string,
  letterNumber: string,
): string {
  const timestamp = Date.now().toString();
  const data = `${applicationId}|${letterNumber}|${timestamp}`;
  const hash = crypto.createHash("sha256").update(data).digest("hex");
  // Kembalikan 12 karakter pertama (cukup unik dan mudah dibaca).
  return hash.substring(0, 12).toUpperCase();
}

/**
 * Menyimpan record verifikasi ke database.
 */
export async function createVerificationRecord(params: {
  applicationId: string;
  letterNumber: string;
  code: string;
}) {
  // Cek apakah record sudah ada.
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
 * Memverifikasi surat berdasarkan kode.
 * Mengembalikan data verifikasi lengkap termasuk riwayat dan info pemohon.
 */
export async function verifyLetter(code: string) {
  const record = await Prisma.letterVerification.findUnique({
    where: { code },
    include: {
      application: {
        include: {
          letterType: true,
          createdBy: {
            include: {
              mahasiswa: {
                include: {
                  departemen: true,
                  programStudi: true,
                },
              },
              pegawai: {
                include: {
                  departemen: true,
                  programStudi: true,
                },
              },
            },
          },
          history: {
            include: {
              actor: true,
              role: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      },
    },
  });

  if (!record) {
    return null;
  }

  // Tambahkan jumlah verifikasi.
  await Prisma.letterVerification.update({
    where: { code },
    data: { verifiedCount: { increment: 1 } },
  });

  // Ekstrak informasi pemohon.
  const createdBy = record.application.createdBy;
  const applicant = {
    name: createdBy.name,
    email: createdBy.email,
    nim: createdBy.mahasiswa?.nim,
    departemen:
      createdBy.mahasiswa?.departemen?.name ||
      createdBy.pegawai?.departemen?.name,
    programStudi:
      createdBy.mahasiswa?.programStudi?.name ||
      createdBy.pegawai?.programStudi?.name,
  };

  // Tentukan jenis dari nilai pada application.
  const letterValues = record.application.values as Record<
    string,
    unknown
  > | null;
  const jenisBeasiswa =
    (letterValues?.jenisBeasiswa as string | undefined) || null;
  const resolvedLetterTypeName =
    jenisBeasiswa === "keperluan_lain"
      ? "Surat Rekomendasi Keperluan Lain"
      : record.application.letterType.name;

  // Format riwayat untuk ditampilkan ke publik.
  const history = record.application.history.map((h) => ({
    action: h.action,
    note: h.note,
    actorName: h.actor.name,
    roleName: h.role?.name || null,
    status: h.status,
    timestamp: h.createdAt,
  }));

  return {
    isValid: true,
    letterNumber: record.letterNumber,
    issuedAt: record.createdAt,
    verifiedCount: record.verifiedCount + 1,
    publishedAt: record.application.publishedAt,
    letterType: {
      id: record.application.letterType.id,
      name: resolvedLetterTypeName,
      description: record.application.letterType.description,
    },
    jenisBeasiswa,
    applicant,
    application: {
      id: record.application.id,
      scholarshipName: record.application.scholarshipName,
      status: record.application.status,
      createdById: record.application.createdById,
      createdAt: record.application.createdAt,
    },
    history,
  };
}

/**
 * Membuat URL kode QR.
 */
export function getQRCodeUrl(code: string, baseUrl?: string): string {
  const base = baseUrl || config.FRONTEND_URL;
  return `${base}/verify/${code}`;
}

/**
 * Membuat data URL kode QR menggunakan API eksternal.
 * (Untuk kesederhanaan, menggunakan QR Server API)
 */
export function getQRCodeImageUrl(code: string, baseUrl?: string): string {
  const verifyUrl = getQRCodeUrl(code, baseUrl);
  // Gunakan QR Server untuk membuat gambar kode QR.
  return `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(
    verifyUrl,
  )}`;
}
