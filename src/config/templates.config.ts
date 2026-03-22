/**
 * Template Configuration - Konfigurasi Template Dokumen
 * ──────────────────────────────────────────────────────
 * Centralized configuration untuk document templates di seluruh aplikasi.
 * Edit file ini untuk mengubah template yang digunakan.
 *
 * Fitur Utama:
 * - Definisi interface untuk template configuration
 * - Centralized template management
 * - Support untuk multiple template versions
 * - Helper functions untuk akses template
 */

// [INTERFACE] Struktur konfigurasi untuk satu template dokumen
// - name: identifier unik template
// - path: lokasi relatif dari folder templates/
// - description: penjelasan template untuk user
// - isActive: flag apakah template sedang aktif
export interface TemplateConfig {
  /** Template name/identifier */
  name: string;
  /** Relative path from templates/ folder */
  path: string;
  /** Description of the template */
  description: string;
  /** Whether this template is active */
  isActive: boolean;
}

// [INTERFACE] Mapping templates untuk satu jenis surat
// - letterTypeId: identifier tipe surat (dari database)
// - displayName: nama display untuk UI
// - defaultTemplate: template yang digunakan secara default
// - templates: array dari templates yang tersedia untuk tipe surat ini
export interface LetterTypeTemplates {
  /** Letter type identifier (e.g., "srb-type-id") */
  letterTypeId: string;
  /** Letter type display name */
  displayName: string;
  /** Default template to use */
  defaultTemplate: string;
  /** Available templates for this letter type */
  templates: TemplateConfig[];
}

/**
 * TEMPLATE CONFIGURATION - Konfigurasi Utama Template
 * ────────────────────────────────────────────────────
 * Modify konfigurasi ini untuk mengubah template yang digunakan di aplikasi.
 * Setiap jenis surat dapat memiliki multiple template versions.
 */
// [CONFIG] Record mapping letterType ke template configuration-nya
export const TEMPLATE_CONFIG: Record<string, LetterTypeTemplates> = {
  // [SRB] Konfigurasi untuk Surat Rekomendasi Beasiswa
  "surat-rekomendasi-beasiswa": {
    letterTypeId: "srb-type-id",
    displayName: "Surat Rekomendasi Beasiswa",
    // [DEFAULT] Template default yang digunakan untuk SRB
    // Menggunakan Template V1 dari client (double braces auto-converted)
    defaultTemplate:
      "surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-v1.docx",
    // [TEMPLATES] Daftar template yang tersedia untuk SRB
    templates: [
      {
        name: "Template V1 (Client)",
        path: "surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-v1.docx",
        description:
          "Template standar dari client dengan double braces (auto-converted saat processing)",
        isActive: true,
      },
      // [TEMPLATE SIMPLE] Template dengan single braces
      {
        name: "Template Simple",
        path: "surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-simple.docx",
        description:
          "Template sederhana dengan single braces, kompatibel dengan docxtemplater 3.67+",
        isActive: false,
      },
      // [TEMPLATE CLEAN] Template yang di-generate programatik
      {
        name: "Template Clean",
        path: "surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-clean.docx",
        description:
          "Template yang di-generate secara programatik dengan double braces (legacy)",
        isActive: false,
      },
      // [UNCOMMENT] Uncomment di bawah untuk menambah template versions baru
      // {
      //     name: "Template V2",
      //     path: "surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-v2.docx",
      //     description: "Template alternatif dengan layout berbeda",
      //     isActive: false,
      // },
    ],
  },
};

/**
 * [FUNCTION] Ambil template path untuk tipe surat tertentu
 * @param letterTypeKey - Key dari TEMPLATE_CONFIG (contoh: "surat-rekomendasi-beasiswa")
 * @returns Template path relatif dari folder templates/
 * @throws Error jika letterTypeKey tidak ditemukan dalam config
 */
export function getTemplatePath(letterTypeKey: string): string {
  // [VALIDATION] Cek apakah configuration ada untuk letterTypeKey
  const config = TEMPLATE_CONFIG[letterTypeKey];
  if (!config) {
    throw new Error(
      `[ERROR] Template configuration not found for: ${letterTypeKey}`,
    );
  }
  return config.defaultTemplate;
}

/**
 * [FUNCTION] Ambil full template configuration untuk tipe surat
 * @param letterTypeKey - Key dari TEMPLATE_CONFIG
 * @returns Full template configuration atau undefined jika tidak ada
 */
export function getTemplateConfig(
  letterTypeKey: string,
): LetterTypeTemplates | undefined {
  return TEMPLATE_CONFIG[letterTypeKey];
}

/**
 * [FUNCTION] Ambil semua template yang aktif untuk tipe surat
 * @param letterTypeKey - Key dari TEMPLATE_CONFIG
 * @returns Array dari template-template yang sedang active (isActive: true)
 */
export function getAvailableTemplates(letterTypeKey: string): TemplateConfig[] {
  // [FILTER] Return hanya template yang isActive = true
  const config = TEMPLATE_CONFIG[letterTypeKey];
  if (!config) {
    return [];
  }
  return config.templates.filter((t) => t.isActive);
}

// [EXPORT] Default template path untuk Surat Rekomendasi Beasiswa
// Non-null assertion aman karena "surat-rekomendasi-beasiswa" terdefinisi statik di TEMPLATE_CONFIG
export const SRB_TEMPLATE_PATH =
  TEMPLATE_CONFIG["surat-rekomendasi-beasiswa"]!.defaultTemplate;

// [EXPORT] Template path untuk Surat Rekomendasi Keperluan Lain
export const SRL_TEMPLATE_PATH =
  "surat-rekomendasi-keperluan-lain/surat-rekomendasi-lain-template-v1.docx";
