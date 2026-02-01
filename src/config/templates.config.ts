/**
 * Template Configuration
 * ----------------------
 * Centralized configuration for document templates.
 * Edit this file to change which templates are used across the application.
 */

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
 * TEMPLATE CONFIGURATION
 * ----------------------
 * Modify this configuration to change which templates are used.
 */
export const TEMPLATE_CONFIG: Record<string, LetterTypeTemplates> = {
    // Surat Rekomendasi Beasiswa
    "surat-rekomendasi-beasiswa": {
        letterTypeId: "srb-type-id",
        displayName: "Surat Rekomendasi Beasiswa",
        // CHANGE THIS TO SWITCH TEMPLATES
        // Using client's V1 template with double braces (auto-converted to single braces)
        defaultTemplate:
            "surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-v1.docx",
        templates: [
            {
                name: "Template V1 (Client)",
                path: "surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-v1.docx",
                description:
                    "Template standar dari client dengan double braces (auto-converted saat processing)",
                isActive: true,
            },
            {
                name: "Template Simple",
                path: "surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-simple.docx",
                description:
                    "Template sederhana dengan single braces, kompatibel dengan docxtemplater 3.67+",
                isActive: false,
            },
            {
                name: "Template Clean",
                path: "surat-rekomendasi-beasiswa/surat-rekomendasi-beasiswa-template-clean.docx",
                description:
                    "Template yang di-generate secara programatik dengan double braces (legacy)",
                isActive: false,
            },
            // Uncomment below to add more template versions
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
 * Get template path for a letter type
 * @param letterTypeKey - Key from TEMPLATE_CONFIG (e.g., "surat-rekomendasi-beasiswa")
 * @returns Template path relative to templates/ folder
 */
export function getTemplatePath(letterTypeKey: string): string {
    const config = TEMPLATE_CONFIG[letterTypeKey];
    if (!config) {
        throw new Error(
            `Template configuration not found for: ${letterTypeKey}`,
        );
    }
    return config.defaultTemplate;
}

/**
 * Get template configuration for a letter type
 * @param letterTypeKey - Key from TEMPLATE_CONFIG
 * @returns Full template configuration
 */
export function getTemplateConfig(
    letterTypeKey: string,
): LetterTypeTemplates | undefined {
    return TEMPLATE_CONFIG[letterTypeKey];
}

/**
 * Get all available templates for a letter type
 * @param letterTypeKey - Key from TEMPLATE_CONFIG
 * @returns Array of active templates
 */
export function getAvailableTemplates(letterTypeKey: string): TemplateConfig[] {
    const config = TEMPLATE_CONFIG[letterTypeKey];
    if (!config) {
        return [];
    }
    return config.templates.filter((t) => t.isActive);
}

// Export default template path for Surat Rekomendasi Beasiswa
// Non-null assertion safe because "surat-rekomendasi-beasiswa" is statically defined in TEMPLATE_CONFIG
export const SRB_TEMPLATE_PATH =
    TEMPLATE_CONFIG["surat-rekomendasi-beasiswa"]!.defaultTemplate;
