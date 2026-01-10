// Validation for Jenis Surat
export function validateJenisSurat(value: unknown) {
    const errors: string[] = [];

    if (typeof value !== "string") {
        errors.push("Jenis surat harus berupa string");
    }

    return { valid: errors.length === 0, errors };
}
