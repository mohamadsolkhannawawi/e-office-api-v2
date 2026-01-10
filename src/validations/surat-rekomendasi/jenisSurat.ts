// Validation for Jenis Surat
export function validateJenisSurat(value: unknown) {
    const errors: string[] = [];
    let parsed = "";
    if (typeof value === "string") {
        parsed = value.trim();
    } else if (value != null) {
        parsed = String(value).trim();
    }
    if (parsed === "") {
        errors.push("Jenis surat harus valid dan tidak boleh kosong");
    }
    return { valid: errors.length === 0, errors };
}
