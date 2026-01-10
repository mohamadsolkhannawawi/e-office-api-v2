// Validation for Lampiran Tambahan (file upload)
// Rules:
// - Optional field
// - Max files: 3
// - Reuse same format/size rules as lampiran utama
export function validateLampiranTambahan(value: unknown) {
    const errors: string[] = [];

    if (value == null) return { valid: true, errors };

    if (!Array.isArray(value)) return { valid: true, errors };

    const files = value as Array<Record<string, unknown>>;

    if (files.length > 3) {
        errors.push("Maksimal 3 file");
    }

    const allowedExt = ["pdf", "jpg", "jpeg", "png"];
    const maxBytes = 5 * 1024 * 1024;

    for (const f of files) {
        const name = typeof f.name === "string" ? f.name : String(f?.filename ?? "");
        const size = typeof f.size === "number" ? f.size : Number(f?.fileSize ?? NaN);
        const type = typeof f.type === "string" ? f.type : "";

        if (!Number.isNaN(size) && size > maxBytes) {
            if (!errors.includes("Ukuran file maksimal 5MB")) {
                errors.push("Ukuran file maksimal 5MB");
            }
        }

        const extMatch = name.match(/\.([^.]+)$/);
        const ext = extMatch?.[1]?.toLowerCase() ?? "";

        const mimeAllowed = (type && (type.includes("pdf") || type.includes("jpeg") || type.includes("jpg") || type.includes("png")));
        const extAllowed = allowedExt.includes(ext);

        if (!mimeAllowed && !extAllowed) {
            if (!errors.includes("Format file tidak didukung")) {
                errors.push("Format file tidak didukung");
            }
        }
    }

    return { valid: errors.length === 0, errors };
}
