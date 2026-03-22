/**
 * [CONSTANT] STEP_ROLE_MAP - Mapping step workflow ke kode role
 *
 * Digunakan saat sistem perlu menentukan role aktif berdasarkan nomor step.
 * Contoh: step 1 -> SUPERVISOR.
 */
export const STEP_ROLE_MAP: Record<number, string> = {
  1: "SUPERVISOR",
  2: "MANAJER_TU",
  3: "WAKIL_DEKAN_1",
  4: "UPA",
};

/**
 * [CONSTANT] ROLE_STEP_MAP - Mapping nama/kode role ke step workflow
 *
 * Mendukung 2 format key:
 * - Kode role internal (contoh: SUPERVISOR)
 * - Nama role display (contoh: Supervisor Akademik)
 *
 * Berguna untuk normalisasi input role dari berbagai sumber.
 */
export const ROLE_STEP_MAP: Record<string, number> = {
  SUPERVISOR: 1,
  "Supervisor Akademik": 1,
  MANAJER_TU: 2,
  "Manajer TU": 2,
  WAKIL_DEKAN_1: 3,
  "Wakil Dekan 1": 3,
  UPA: 4,
};
