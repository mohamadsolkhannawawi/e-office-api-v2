// Validation for Lampiran Utama (file upload)
// Rules:
// - Allowed formats: PDF, JPG, PNG
// - Max file size: 5MB per file
// - Max files: 5
export function validateLampiranUtama(value: unknown) {
    const errors: string[] = [];

    // Require at least 1 lampiran utama
    if (value == null || !Array.isArray(value)) {
        errors.push("Minimal 1 lampiran wajib");
        return { valid: false, errors };
    }

    const files = value as Array<Record<string, unknown>>;

    if (files.length > 5) {
        errors.push("Maksimal 5 file");
    }

    const allowedExt = ["pdf", "jpg", "png"];
    const maxBytes = 5 * 1024 * 1024;

    for (const f of files) {
        const name = typeof f.name === "string" ? f.name : String(f?.filename ?? "");
        const size = typeof f.size === "number" ? f.size : Number(f?.fileSize ?? NaN);
        const type = typeof f.type === "string" ? f.type : "";

        // check size
        if (!Number.isNaN(size) && size > maxBytes) {
            if (!errors.includes("Ukuran file maksimal 5MB")) {
                errors.push("Ukuran file maksimal 5MB");
            }
        }

        // check extension / mime
        const extMatch = name.match(/\.([^.]+)$/);
        const ext = extMatch?.[1]?.toLowerCase() ?? "";

        const mimeAllowed = (type && (type.includes("pdf") || type.includes("jpg") || type.includes("png")));
        const extAllowed = allowedExt.includes(ext);

        if (!mimeAllowed && !extAllowed) {
            if (!errors.includes("Format file tidak didukung")) {
                errors.push("Format file tidak didukung");
            }
        }
    }

    return { valid: errors.length === 0, errors };
}
