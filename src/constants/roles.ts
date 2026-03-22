/**
 * Role Constants - Konstanta Role & Permission System
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * File ini berisi semua konstanta role yang digunakan di seluruh aplikasi e-office.
 * Setiap role memiliki permission berbeda dalam workflow surat rekomendasi beasiswa.
 *
 * Roles dalam sistem:
 * - MAHASISWA: Mahasiswa yang mengajukan beasiswa
 * - SUPERVISOR_AKADEMIK: Supervisor akademik untuk verifikasi
 * - MANAJER_TU: Manager TU untuk proses surat
 * - WAKIL_DEKAN_1: Wakil Dekan untuk approval final
 * - UPA: UPA untuk publikasi dan penomoran surat
 * - SUPER_ADMIN: Administrator dengan akses penuh
 */

// [ROLES] Konstanta role yang digunakan di seluruh aplikasi
// Menggunakan 'as const' untuk type safety dan auto-completion
export const ROLES = {
  // [MAHASISWA] Role untuk mahasiswa yang mengajukan surat rekomendasi beasiswa
  MAHASISWA: "MAHASISWA",
  // [SUPERVISOR] Role untuk supervisor akademik di program studi (verifikasi)
  SUPERVISOR_AKADEMIK: "SUPERVISOR_AKADEMIK",
  // [MANAJER_TU] Role untuk manager/staff TU (processing surat)
  MANAJER_TU: "MANAJER_TU",
  // [WAKIL_DEKAN] Role untuk wakil dekan level 1 (signing & approval)
  WAKIL_DEKAN_1: "WAKIL_DEKAN_1",
  // [UPA] Role untuk UPA staff (publish/numbering/stamping)
  UPA: "UPA",
  // [ADMIN] Role untuk super admin dengan akses penuh ke semua feature
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;

// [TYPE] Derived type dari ROLES untuk type safety di seluruh aplikasi
// Otomatis include semua role value
export type RoleType = (typeof ROLES)[keyof typeof ROLES];

/**
 * [HIERARCHY] Role Hierarchy - Urutan tingkatan role untuk permission checking
 *
 * Gunakan untuk:
 * - Validasi permission level (higher level = lebih banyak akses)
 * - Protected route checking
 * - Conditional UI rendering
 *
 * Urutan: MAHASISWA < SUPERVISOR < TU < WAKIL_DEKAN < UPA < SUPER_ADMIN
 */
export const ROLE_HIERARCHY: Record<RoleType, number> = {
  // [LEVEL 1] Mahasiswa - akses minimal (hanya form pengajuan)
  [ROLES.MAHASISWA]: 1,
  // [LEVEL 2] Supervisor - dapat verifikasi submission
  [ROLES.SUPERVISOR_AKADEMIK]: 2,
  // [LEVEL 3] Manager TU - dapat proses surat di TU
  [ROLES.MANAJER_TU]: 3,
  // [LEVEL 4] Wakil Dekan - dapat approval dan signing
  [ROLES.WAKIL_DEKAN_1]: 4,
  // [LEVEL 5] UPA - dapat publish, numbering, stamping
  [ROLES.UPA]: 5,
  // [LEVEL 6] Super Admin - akses penuh ke semua feature
  [ROLES.SUPER_ADMIN]: 6,
};

/**
 * [WORKFLOW] Beasiswa Workflow Steps - Tahapan workflow surat rekomendasi beasiswa
 *
 * Setiap surat harus melewati tahapan ini secara berurutan:
 * 1. MAHASISWA_SUBMIT: Mahasiswa submit form permohonan
 * 2. SUPERVISOR_VERIFY: Supervisor akademik verifikasi
 * 3. TU_PROCESS: TU manager proses surat
 * 4. WAKIL_DEKAN_APPROVE: Wakil dekan approval & signing
 * 5. COMPLETED: Surat selesai dan siap publikasi
 */
export const BEASISWA_WORKFLOW_STEPS = {
  // [STEP 1] Mahasiswa submit: Mahasiswa mengirim form aplikasi beasiswa
  MAHASISWA_SUBMIT: 1,
  // [STEP 2] Supervisor verify: Supervisor memeriksa dan memverifikasi data
  SUPERVISOR_VERIFY: 2,
  // [STEP 3] TU process: Manager TU memproses dan membuat surat
  TU_PROCESS: 3,
  // [STEP 4] Wakil Dekan approve: Wakil dekan melakukan approval dan signing
  WAKIL_DEKAN_APPROVE: 4,
  // [STEP 5] Completed: Surat selesai diproses dan siap dipublikasi
  COMPLETED: 5,
} as const;

/**
 * [STATUS] Letter Status - Status dari setiap surat dalam sistem
 *
 * Status lifecycle dari surat rekomendasi:
 * - PENDING: Sedang menunggu action dari user tertentu
 * - IN_PROGRESS: Sedang diproses (di tengah workflow)
 * - COMPLETED: Telah selesai semua tahapan
 * - REJECTED: Ditolak dan perlu revisi ulang
 */
export const LETTER_STATUS = {
  // [PENDING] Menunggu action dari role tertentu (default status awal)
  PENDING: "PENDING",
  // [IN_PROGRESS] Sedang diproses, sudah dimulai workflow tapi belum selesai
  IN_PROGRESS: "IN_PROGRESS",
  // [COMPLETED] Telah selesai semua tahapan, siap untuk publikasi
  COMPLETED: "COMPLETED",
  // [REJECTED] Ditolak oleh salah satu reviewer, perlu revisi dari mahasiswa
  REJECTED: "REJECTED",
} as const;
